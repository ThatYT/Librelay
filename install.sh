#!/bin/bash

# Use English diagnostics from external tools as well as installer prompts.
export LC_ALL=C

if [ -z "${GITHUB_REPO:-}" ] && [ -r /etc/gost/repository.conf ]; then
  GITHUB_REPO=$(sed -n 's/^GITHUB_REPO=//p' /etc/gost/repository.conf | head -1)
  GITHUB_REF=$(sed -n 's/^GITHUB_REF=//p' /etc/gost/repository.conf | head -1)
fi
GITHUB_REPO="${GITHUB_REPO:-Teminuosi/Tms}"
GITHUB_REF="${GITHUB_REF:-main}"
[[ "$GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && "$GITHUB_REF" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Invalid repository identity" >&2; exit 1; }

prepare_node_tools() {
  if ! command -v curl >/dev/null || ! command -v jq >/dev/null || ! command -v sha256sum >/dev/null || ! command -v tar >/dev/null || ! command -v gzip >/dev/null; then
    if command -v apt-get >/dev/null; then apt-get update && apt-get install -y curl ca-certificates jq tar gzip coreutils
    elif command -v dnf >/dev/null; then dnf install -y curl ca-certificates jq tar gzip coreutils
    elif command -v yum >/dev/null; then yum install -y curl ca-certificates jq tar gzip coreutils
    else echo "Unsupported distribution" >&2; exit 1; fi
  fi
}
check_node_space() {
  local directory="$1" needed="$2" available
  available=$(df -Pk "$directory" | awk 'NR==2 {print $4}')
  if [[ ! "$available" =~ ^[0-9]+$ ]] || [ "$available" -lt "$needed" ]; then
    echo "Insufficient free space at $directory (need at least $((needed / 1024)) MiB). Check df -h; existing node files are retained." >&2
    return 1
  fi
}

node_asset_url() {
  local url="https://github.com/${GITHUB_REPO}/releases/download/$1/$2"
  [ "${COUNTRY:-}" != CN ] || url="${GH_MIRROR}${url}"
  printf '%s\n' "$url"
}

download_prebuilt_agent() {
  local destination="$1" staging="$2" architecture release revision expected actual
  architecture=$(get_architecture) || return 1
  release=${TMS_NODE_RELEASE:-}
  if [ -z "$release" ]; then
    curl -fLsS --retry 3 --max-time 30 "https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_REF}" -o "$staging/revision.json" || return 1
    revision=$(jq -r '.sha // empty' "$staging/revision.json")
    [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "Cannot resolve the node source revision." >&2; return 1; }
    release="node-${revision}"
  elif [ "$release" = latest ]; then
    curl -fLsS --retry 3 --max-time 30 "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" -o "$staging/revision.json" || return 1
    release=$(jq -r '.tag_name // empty' "$staging/revision.json")
  fi
  [[ "$release" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Invalid node release tag." >&2; return 1; }
  echo "Downloading prebuilt node agent: $release ($architecture)..."
  if ! curl -fLsS --retry 2 --max-time 60 "$(node_asset_url "$release" checksums.sha256)" -o "$staging/checksums.sha256"; then
    echo "Prebuilt node release/checksums not available yet. Wait for the Node binaries workflow: https://github.com/${GITHUB_REPO}/actions" >&2
    echo "Source compilation is optional: TMS_NODE_SOURCE=1 (requires at least 3 GiB free build space)." >&2
    return 1
  fi
  expected=$(awk -v file="gost-${architecture}" '$2 == file {print $1}' "$staging/checksums.sha256")
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo "Missing or invalid node SHA-256 checksum." >&2; return 1; }
  curl -fLsS --retry 3 --max-time 180 "$(node_asset_url "$release" "gost-${architecture}")" -o "$destination" || return 1
  actual=$(sha256sum "$destination" | awk '{print $1}')
  [ "$actual" = "$expected" ] || { echo "Node SHA-256 verification failed; existing executable retained." >&2; return 1; }
  chmod +x "$destination"
  "$destination" -V >/dev/null || return 1
}

build_source_agent() {
  local destination="$1" staging architecture build_parent
  build_parent=${TMS_NODE_BUILD_DIR:-/var/tmp}
  [ -d "$build_parent" ] || { echo "Node build directory must already exist: $build_parent" >&2; return 1; }
  check_node_space "$build_parent" 3145728 || return 1
  staging=$(mktemp -d "$build_parent/tms-node-build.XXXXXX") || return 1
  architecture=$(get_architecture) || { rm -rf "$staging"; return 1; }
  echo "Building node agent from $GITHUB_REPO ($GITHUB_REF) with one compiler worker..."
  if ! curl -fLsS --retry 3 "https://codeload.github.com/${GITHUB_REPO}/tar.gz/${GITHUB_REF}" -o "$staging/source.tar.gz" \
      || ! curl -fLsS --retry 3 "https://go.dev/dl/go1.23.4.linux-${architecture}.tar.gz" -o "$staging/go.tar.gz"; then
    rm -rf "$staging"; return 1
  fi
  mkdir "$staging/source" "$staging/work"
  tar -xzf "$staging/source.tar.gz" --strip-components=1 -C "$staging/source" || { rm -rf "$staging"; return 1; }
  tar -xzf "$staging/go.tar.gz" -C "$staging" || { rm -rf "$staging"; return 1; }
  if ! (cd "$staging/source/go-gost" && PATH="$staging/go/bin:$PATH" GOTMPDIR="$staging/work" \
    GOCACHE="$staging/cache" GOPATH="$staging/modules" GOMAXPROCS=1 GOMEMLIMIT=256MiB CGO_ENABLED=0 \
    "$staging/go/bin/go" build -p 1 -mod=mod -trimpath -ldflags '-s -w' -o "$destination" .); then
    rm -rf "$staging"; return 1
  fi
  rm -rf "$staging"
}

download_agent() {
  local destination="$1" staging result=1
  check_node_space "$(dirname "$destination")" 131072 || return 1
  staging=$(mktemp -d "$(dirname "$destination")/.node-download.XXXXXX") || return 1
  if [ "${TMS_NODE_SOURCE:-0}" = 1 ]; then
    if build_source_agent "$staging/gost"; then result=0; fi
  else
    if download_prebuilt_agent "$staging/gost" "$staging"; then result=0; fi
  fi
  if [ "$result" = 0 ]; then
    mv "$staging/gost" "$destination" || result=1
  fi
  rm -rf "$staging"
  return "$result"
}

# Detect the system architecture.
get_architecture() {
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            echo "Unsupported architecture: $ARCH" >&2
            return 1
            ;;
    esac
}

INSTALL_DIR="/etc/gost"
FORCE_CN=0                                       # -c Force the GitHub mirror when direct access or country detection fails
GH_MIRROR="${GH_MIRROR:-https://ghfast.top/}"    # GitHub download mirror; overridable through the environment



# Display the node management menu.
show_menu() {
  echo "==============================================="
  echo "              Node Management"
  echo "==============================================="
  echo "Select an action:"
  echo "1. Install"
  echo "2. Update"
  echo "3. Uninstall"
  echo "4. Exit"
  echo "==============================================="
}

# Remove the temporary installer.
delete_self() {
  echo ""
  echo "🗑️ Operation complete. Removing the installer..."
  SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
  sleep 1
  rm -f "$SCRIPT_PATH" && echo "✅ Installer removed" || echo "❌ Failed to remove installer"
}

# Check/install tcpkill.
check_and_install_tcpkill() {
  # Skip if tcpkill is already installed.
  if command -v tcpkill &> /dev/null; then
    return 0
  fi
  
  # Detect the operating system.
  OS_TYPE=$(uname -s)
  
  # Determine whether sudo is needed.
  if [[ $EUID -ne 0 ]]; then
    SUDO_CMD="sudo"
  else
    SUDO_CMD=""
  fi
  
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    if command -v brew &> /dev/null; then
      brew install dsniff &> /dev/null
    fi
    return 0
  fi
  
  # Install the distribution-specific package.
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
  elif [ -f /etc/redhat-release ]; then
    DISTRO="rhel"
  elif [ -f /etc/debian_version ]; then
    DISTRO="debian"
  else
    return 0
  fi
  
  case $DISTRO in
    ubuntu|debian)
      $SUDO_CMD apt update &> /dev/null
      $SUDO_CMD apt install -y dsniff &> /dev/null
      ;;
    centos|rhel|fedora)
      if command -v dnf &> /dev/null; then
        $SUDO_CMD dnf install -y dsniff &> /dev/null
      elif command -v yum &> /dev/null; then
        $SUDO_CMD yum install -y dsniff &> /dev/null
      fi
      ;;
    alpine)
      $SUDO_CMD apk add --no-cache dsniff &> /dev/null
      ;;
    arch|manjaro)
      $SUDO_CMD pacman -S --noconfirm dsniff &> /dev/null
      ;;
    opensuse*|sles)
      $SUDO_CMD zypper install -y dsniff &> /dev/null
      ;;
    gentoo)
      $SUDO_CMD emerge --ask=n net-analyzer/dsniff &> /dev/null
      ;;
    void)
      $SUDO_CMD xbps-install -Sy dsniff &> /dev/null
      ;;
  esac
  
  return 0
}


# Read node configuration.
get_config_params() {
  if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
    echo "Enter configuration:"
    
    if [[ -z "$SERVER_ADDR" ]]; then
      read -p "Panel server address: " SERVER_ADDR
    fi
    
    if [[ -z "$SECRET" ]]; then
      read -p "Node secret: " SECRET
    fi
    
    if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
      echo "❌ Required parameters are missing. Operation cancelled."
      exit 1
    fi
  fi
}

# Install the node agent.
install_gost() {
  echo "🚀 Installing GOST..."
  get_config_params

    # Check/install tcpkill.
  check_and_install_tcpkill
  

  mkdir -p "$INSTALL_DIR"

  # Build/download first; a failed download never removes the existing executable or settings.
  download_agent "$INSTALL_DIR/gost.new" || { echo "Node build/download failed; existing installation preserved." >&2; return 1; }
  systemctl stop gost 2>/dev/null || true
  mv "$INSTALL_DIR/gost.new" "$INSTALL_DIR/gost"
  chmod +x "$INSTALL_DIR/gost"

  # Print the agent version.
  echo "🔎 gost version: $($INSTALL_DIR/gost -V)"

  # Create a new config.json for installation.
  CONFIG_FILE="$INSTALL_DIR/config.json"
  echo "📄 Creating configuration: config.json"
  umask 077
  if [ -f "$CONFIG_FILE" ]; then
    jq --arg addr "$SERVER_ADDR" --arg secret "$SECRET" '.addr=$addr | .secret=$secret' "$CONFIG_FILE" > "$CONFIG_FILE.new" || return 1
  else
    jq -n --arg addr "$SERVER_ADDR" --arg secret "$SECRET" '{addr:$addr,secret:$secret}' > "$CONFIG_FILE.new" || return 1
  fi
  mv "$CONFIG_FILE.new" "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  printf '%s\n' "GITHUB_REPO=$GITHUB_REPO" "GITHUB_REF=$GITHUB_REF" > "$INSTALL_DIR/repository.conf"


  # Write gost.json when absent.
  GOST_CONFIG="$INSTALL_DIR/gost.json"
  if [[ -f "$GOST_CONFIG" ]]; then
    echo "⏭️ Keeping existing configuration: gost.json (already exists)"
  else
    echo "📄 Creating configuration: gost.json"
    cat > "$GOST_CONFIG" <<EOF
{}
EOF
  fi

  # Restrict configuration permissions.
  chmod 600 "$INSTALL_DIR"/*.json

  # Create the systemd unit.
  SERVICE_FILE="/etc/systemd/system/gost.service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Gost Proxy Service
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/gost
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

  # Start the service.
  systemctl daemon-reload
  systemctl enable gost
  systemctl start gost

  # Check service status.
  echo "🔄 Checking service status..."
  if systemctl is-active --quiet gost; then
    echo "✅ Installation complete. gost is running and enabled at boot."
    echo "📁 Configuration directory: $INSTALL_DIR"
    echo "🔧 Service status: $(systemctl is-active gost)"
  else
    echo "❌ gost failed to start. View logs with:"
    echo "journalctl -u gost -f"
    return 1
  fi
}

# Update the node agent.
update_gost() {
  echo "🔄 Updating GOST..."
  
  if [[ ! -d "$INSTALL_DIR" ]]; then
    echo "❌ GOST is not installed. Install it first."
    return 1
  fi
  
  echo "📥 Downloading the matching node agent from this repository..."
  
  # Check/install tcpkill.
  check_and_install_tcpkill
  
  # Download before stopping the existing service.
  echo "⬇️ Downloading the latest version..."
  download_agent "$INSTALL_DIR/gost.new" || { echo "Node build/download failed; old executable retained." >&2; return 1; }
  if [[ ! -f "$INSTALL_DIR/gost.new" || ! -s "$INSTALL_DIR/gost.new" ]]; then
    echo "❌ Download failed."
    return 1
  fi

  # Stop the service.
  if systemctl list-units --full -all | grep -Fq "gost.service"; then
    echo "🛑 Stopping gost..."
    systemctl stop gost
  fi

  # Replace the executable.
  mv "$INSTALL_DIR/gost.new" "$INSTALL_DIR/gost"
  chmod +x "$INSTALL_DIR/gost"
  
  # Print the new version.
  echo "🔎 New version: $($INSTALL_DIR/gost -V)"

  # Restart the service.
  echo "🔄 Restarting service..."
  systemctl start gost || return 1
  
  echo "✅ Update complete. Service restarted."
}

# Uninstall the node agent.
uninstall_gost() {
  echo "🗑️ Removing GOST..."
  
  read -p "Remove GOST? This will delete all related files (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ Uninstall cancelled"
    return 0
  fi

  # Stop and disable the service.
  if systemctl list-units --full -all | grep -Fq "gost.service"; then
    echo "🛑 Stopping and disabling service..."
    systemctl stop gost 2>/dev/null
    systemctl disable gost 2>/dev/null
  fi

  # Protocol management may also install a sing-box systemd unit.
  # Remove the unit with the binary to avoid repeated failed restart attempts.
  if systemctl list-units --full -all | grep -Fq "sing-box.service"; then
    echo "🛑 Stopping and disabling sing-box..."
    systemctl stop sing-box 2>/dev/null
    systemctl disable sing-box 2>/dev/null
  fi

  # Remove the unit file.
  if [[ -f "/etc/systemd/system/gost.service" ]]; then
    rm -f "/etc/systemd/system/gost.service"
    echo "🧹 Removing service file"
  fi
  if [[ -f "/etc/systemd/system/sing-box.service" ]]; then
    rm -f "/etc/systemd/system/sing-box.service"
    echo "🧹 Removing sing-box service file"
  fi
  # Remove sing-box systemd drop-in overrides.
  rm -rf /etc/systemd/system/sing-box.service.d 2>/dev/null

  # Remove leftover target .wants symlinks.
  # Broken or manually enabled units may leave links after disable.
  # Those links otherwise appear as not-found units.
  find /etc/systemd /run/systemd \( -name 'gost.service' -o -name 'sing-box.service' \) -delete 2>/dev/null

  # Remove the node directory, including binaries, configuration and certificates.
  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    echo "🧹 Removing installation directory: $INSTALL_DIR"
  fi

  # Reload systemd and clear failed states.
  systemctl daemon-reload
  systemctl reset-failed 2>/dev/null

  echo "✅ Uninstall complete (gost, sing-box, configuration and certificates removed)"
}

# Entry point.
main() {
  # Install directly when address and secret are supplied.
  if [[ -n "$SERVER_ADDR" && -n "$SECRET" ]]; then
    install_gost
    exit $?
  fi

  # Otherwise show the interactive menu.
  while true; do
    show_menu
    read -p "Select an option (1-4): " choice
    
    case $choice in
      1)
        install_gost
            exit $?
        ;;
      2)
        update_gost
            exit $?
        ;;
      3)
        uninstall_gost
            exit 0
        ;;
      4|5)
        echo "👋 Exiting installer"
            exit 0
        ;;
      *)
        echo "❌ Invalid option. Enter 1-4."
        echo ""
        ;;
    esac
  done
}

# Sourcing exposes helpers to regression tests without installing packages/services.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  [ "$(id -u)" -eq 0 ] && [ "$(uname -s)" = Linux ] || { echo "Run as root on Linux." >&2; exit 1; }
  prepare_node_tools
  while getopts "a:s:c" opt; do
    case "$opt" in
      a) SERVER_ADDR="$OPTARG" ;;
      s) SECRET="$OPTARG" ;;
      c) FORCE_CN=1 ;;
      *) echo "Invalid node installer option" >&2; exit 1 ;;
    esac
  done
  COUNTRY=""
  if [ "$FORCE_CN" = 1 ]; then COUNTRY=CN
  else COUNTRY=$(curl -s --max-time 5 https://ipinfo.io/country 2>/dev/null || true); fi
  main
fi
