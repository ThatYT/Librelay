#!/bin/bash
set -e

# Use a stable locale to avoid invalid byte sequences in tr on macOS.
export LANG=en_US.UTF-8
export LC_ALL=C



# Docker IPv6 is disabled by default; changing daemon settings can break MySQL startup.
# Container communication uses IPv4; public IPv6 access does not require an IPv6 Docker network.
# Set LIBRELAY_IPV6=1 only when Docker network IPv6 is needed.
LIBRELAY_IPV6="${LIBRELAY_IPV6:-${TMS_IPV6:-0}}"

# The only repository default. Override for another fork without editing download URLs.
GITHUB_REPO="${GITHUB_REPO:-ThatYT/Librelay}"
GITHUB_REF="${GITHUB_REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/librelay}"
INSTALL_DOMAIN=""
INSTALL_HTTPS_PORT=""
INSTALL_DIR_EXPLICIT=0
PORT_REQUESTED=0
SOURCE_REQUESTED=0
LIBRELAY_PANEL_SOURCE="${LIBRELAY_PANEL_SOURCE:-${TMS_PANEL_SOURCE:-0}}"

# Read settings as data; never source or evaluate installation credentials.
layout_setting() {
  local value=""
  [ ! -f .env ] || value=$(sed -n "s/^$1=//p" .env | head -1)
  [ -n "$value" ] || value="$2"
  [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || { echo "Invalid deployment setting: $1" >&2; return 1; }
  printf '%s\n' "$value"
}

# Old installations keep their exact containers, volumes and network. New ones
# use Librelay names. Do not move a live MySQL directory or change volume identity.
load_deployment_layout() {
  local legacy=0
  if [ -f .env ] && ! grep -q '^LIBRELAY_LAYOUT=1$' .env; then legacy=1; fi
  if [ "$legacy" = 1 ]; then
    MYSQL_CONTAINER=gost-mysql; BACKEND_CONTAINER=springboot-backend; FRONTEND_CONTAINER=vite-frontend
    MYSQL_VOLUME=mysql_data; LOG_VOLUME=backend_logs; PANEL_NETWORK=gost-network
    CADDY_CONTAINER=tms-caddy; CADDY_DATA=tms_caddy_data; CADDY_CONFIG=tms_caddy_config
  else
    MYSQL_CONTAINER=librelay-mysql; BACKEND_CONTAINER=librelay-backend; FRONTEND_CONTAINER=librelay-frontend
    MYSQL_VOLUME=librelay_mysql_data; LOG_VOLUME=librelay_backend_logs; PANEL_NETWORK=librelay-network
    CADDY_CONTAINER=librelay-caddy; CADDY_DATA=librelay_caddy_data; CADDY_CONFIG=librelay_caddy_config
  fi
  LIBRELAY_MYSQL_CONTAINER=$(layout_setting LIBRELAY_MYSQL_CONTAINER "$MYSQL_CONTAINER") || return 1
  LIBRELAY_BACKEND_CONTAINER=$(layout_setting LIBRELAY_BACKEND_CONTAINER "$BACKEND_CONTAINER") || return 1
  LIBRELAY_FRONTEND_CONTAINER=$(layout_setting LIBRELAY_FRONTEND_CONTAINER "$FRONTEND_CONTAINER") || return 1
  LIBRELAY_MYSQL_VOLUME=$(layout_setting LIBRELAY_MYSQL_VOLUME "$MYSQL_VOLUME") || return 1
  LIBRELAY_LOG_VOLUME=$(layout_setting LIBRELAY_LOG_VOLUME "$LOG_VOLUME") || return 1
  LIBRELAY_NETWORK=$(layout_setting LIBRELAY_NETWORK "$PANEL_NETWORK") || return 1
  MYSQL_CONTAINER=$LIBRELAY_MYSQL_CONTAINER; BACKEND_CONTAINER=$LIBRELAY_BACKEND_CONTAINER
  FRONTEND_CONTAINER=$LIBRELAY_FRONTEND_CONTAINER; MYSQL_VOLUME=$LIBRELAY_MYSQL_VOLUME
  LOG_VOLUME=$LIBRELAY_LOG_VOLUME; PANEL_NETWORK=$LIBRELAY_NETWORK
  export LIBRELAY_MYSQL_CONTAINER LIBRELAY_BACKEND_CONTAINER LIBRELAY_FRONTEND_CONTAINER
  export LIBRELAY_MYSQL_VOLUME LIBRELAY_LOG_VOLUME LIBRELAY_NETWORK
  case "${CADDY_FILE:-}" in
    ""|/etc/librelay/Caddyfile|/etc/tms/Caddyfile)
      if [ "$legacy" = 1 ]; then CADDY_FILE=/etc/tms/Caddyfile; else CADDY_FILE=/etc/librelay/Caddyfile; fi ;;
  esac
}

# Repository rename is the only automatic .env edit. Keep an exact private backup,
# preserve forks and refs, and report the change before touching saved settings.
migrate_repository_identity() {
  [ -f .env ] || return 0
  if grep -qi '^GITHUB_REPO=ThatYT/Tms_EN$' .env; then
    acquire_install_lock || return 1
    [ -f .env.before-librelay ] || cp -p .env .env.before-librelay
    chmod 600 .env.before-librelay
    echo "Migrating repository to ThatYT/Librelay; backup: $PWD/.env.before-librelay"
    (umask 077; sed 's~^[Gg][Ii][Tt][Hh][Uu][Bb]_[Rr][Ee][Pp][Oo]=[Tt][Hh][Aa][Tt][Yy][Tt]/[Tt][Mm][Ss]_[Ee][Nn]$~GITHUB_REPO=ThatYT/Librelay~' .env > .env.librelay-new)
    chmod 600 .env.librelay-new
    mv .env.librelay-new .env
  fi
}

load_deployment_layout

prepare_host() {
  [ "$(id -u)" -eq 0 ] || { echo "Root privileges are required." >&2; exit 1; }
  [ "$(uname -s)" = Linux ] || { echo "Only Linux is supported." >&2; exit 1; }
  [ -r /etc/os-release ] || { echo "Cannot detect Linux distribution." >&2; exit 1; }
  . /etc/os-release
  case "$ID" in
    ubuntu|debian|raspbian)
      if ! command -v curl >/dev/null || ! command -v ss >/dev/null || ! command -v openssl >/dev/null || ! command -v tar >/dev/null || ! command -v gzip >/dev/null || ! command -v jq >/dev/null || ! command -v flock >/dev/null; then
        apt-get update
        apt-get install -y curl ca-certificates openssl iproute2 tar gzip jq util-linux
      fi ;;
    fedora|centos|rhel|rocky|almalinux)
      if ! command -v curl >/dev/null || ! command -v ss >/dev/null || ! command -v openssl >/dev/null || ! command -v tar >/dev/null || ! command -v gzip >/dev/null || ! command -v jq >/dev/null || ! command -v flock >/dev/null; then
        if command -v dnf >/dev/null; then dnf install -y curl ca-certificates openssl iproute tar gzip jq util-linux
        else yum install -y curl ca-certificates openssl iproute tar gzip jq util-linux; fi
      fi ;;
    *) echo "Unsupported Linux distribution: $ID" >&2; exit 1 ;;
  esac
}

valid_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }

# Serialise install/update; a second process must not replace .env or race Docker.
acquire_install_lock() {
  [ "${LIBRELAY_LOCK_HELD:-${TMS_LOCK_HELD:-0}}" = 1 ] && return 0
  local lock_file=.librelay-install.lock
  [ ! -f .tms-install.lock ] || lock_file=.tms-install.lock
  exec 9> "$lock_file"
  chmod 600 "$lock_file"
  flock -n 9 || { echo "Another Librelay installation/update is running in $PWD." >&2; return 1; }
  export LIBRELAY_LOCK_HELD=1
}

resolve_panel_commit() {
  if [[ "$GITHUB_REF" =~ ^[a-fA-F0-9]{40}$ ]]; then
    PANEL_COMMIT=$(printf '%s' "$GITHUB_REF" | tr '[:upper:]' '[:lower:]')
  else
    PANEL_COMMIT=$(curl -fLsS --connect-timeout 10 --max-time 30 --retry 2 \
      "https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_REF}" | jq -er '.sha') || {
      echo "Cannot resolve $GITHUB_REPO ($GITHUB_REF). Check GitHub connectivity/API rate limits." >&2
      return 1
    }
  fi
  [[ "$PANEL_COMMIT" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid GitHub commit response." >&2; return 1; }
}

check_source_resources() {
  local available
  available=$(awk '/^MemAvailable:|^SwapFree:/ {total += $2} END {printf "%.0f", total}' /proc/meminfo)
  if [ "$available" -lt 2621440 ]; then
    echo "Source build needs at least 2.5 GiB available RAM + free swap. Use the default prebuilt images, or add swap first." >&2
    return 1
  fi
}

# Keep pipeline failure handling local; legacy management commands use grep -q
# pipelines, whose intentional early exit must not turn into a false failure.
run_deploy_logged() (
  set -o pipefail
  "$@" 2>&1 | tee -a .librelay-last-deploy.log
)

# Prepare everything before replacing the running deployment. Both image tags
# identify the same source commit; never mix latest tags or silently build locally.
deploy_panel() {
  local staging candidate owner mode=images had_compose=0 had_source=0
  acquire_install_lock || return 1
  load_deployment_layout || return 1
  resolve_panel_commit || return 1
  [ "$LIBRELAY_PANEL_SOURCE" = 0 ] || { mode=source; check_source_resources || return 1; }
  staging=$(mktemp -d "$PWD/.deployment.XXXXXX")
  candidate="$staging/docker-compose.yml"
  owner=$(printf '%s' "${GITHUB_REPO%%/*}" | tr '[:upper:]' '[:lower:]')
  umask 077
  : > .librelay-last-deploy.log
  chmod 600 .librelay-last-deploy.log
  echo "Deployment: $GITHUB_REPO @ ${PANEL_COMMIT:0:12} ($mode)"
  echo "Progress log: $PWD/.librelay-last-deploy.log"
  if [ "$mode" = images ]; then
    if ! curl -fLsS --connect-timeout 10 --max-time 60 --retry 2 \
      "https://raw.githubusercontent.com/${GITHUB_REPO}/${PANEL_COMMIT}/docker-compose-images.yml" -o "$candidate"; then
      rm -rf "$staging"; return 1
    fi
    sed "s@LIBRELAY_BACKEND_IMAGE@ghcr.io/$owner/springboot-backend:sha-$PANEL_COMMIT@;s@LIBRELAY_FRONTEND_IMAGE@ghcr.io/$owner/vite-frontend:sha-$PANEL_COMMIT@" "$candidate" > "$candidate.new"
    mv "$candidate.new" "$candidate"
  else
    echo "Source mode requested: frontend/backend will build one at a time."
    mkdir "$staging/source"
    if ! curl -fLsS --connect-timeout 10 --max-time 180 --retry 2 \
      "https://codeload.github.com/${GITHUB_REPO}/tar.gz/${PANEL_COMMIT}" -o "$staging/source.tar.gz" \
      || ! tar -xzf "$staging/source.tar.gz" --strip-components=1 -C "$staging/source"; then
      rm -rf "$staging"; return 1
    fi
    [ -f "$staging/source/docker-compose-hybrid.yml" ] || { rm -rf "$staging"; return 1; }
    sed "s@context: ./springboot-backend@context: $staging/source/springboot-backend@;s@context: ./vite-frontend@context: $staging/source/vite-frontend@;s@librelay-backend:hybrid@librelay-backend:sha-$PANEL_COMMIT@;s@librelay-frontend:hybrid@librelay-frontend:sha-$PANEL_COMMIT@" \
      "$staging/source/docker-compose-hybrid.yml" > "$candidate"
  fi
  if ! $DOCKER_CMD --project-directory "$PWD" --env-file .env -f "$candidate" config --quiet; then
    rm -rf "$staging"; return 1
  fi
  if [ ! -f gost.sql ]; then
    if ! curl -fLsS --connect-timeout 10 --max-time 60 --retry 2 \
      "https://raw.githubusercontent.com/${GITHUB_REPO}/${PANEL_COMMIT}/gost.sql" -o "$staging/gost.sql"; then
      rm -rf "$staging"; return 1
    fi
    [ -s "$staging/gost.sql" ] || { rm -rf "$staging"; return 1; }
    mv "$staging/gost.sql" gost.sql
  fi
  chmod 644 gost.sql
  if [ "$mode" = images ]; then
    echo "[1/3] Downloading version-matched panel images (no local compilation)..."
    if ! COMPOSE_PARALLEL_LIMIT=1 run_deploy_logged $DOCKER_CMD --project-directory "$PWD" --env-file .env -f "$candidate" pull backend frontend; then
      echo "Image download failed; running containers/configuration are untouched." >&2
      echo "Wait for 'Build and publish panel images' on GitHub to finish. Private forks need docker login ghcr.io. Local compilation requires explicit --source." >&2
      rm -rf "$staging"; return 1
    fi
    local image revision
    for image in "ghcr.io/$owner/springboot-backend:sha-$PANEL_COMMIT" "ghcr.io/$owner/vite-frontend:sha-$PANEL_COMMIT"; do
      revision=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") || revision=""
      if [ "$revision" != "$PANEL_COMMIT" ]; then
        echo "Image revision mismatch: $image. Running deployment unchanged." >&2
        rm -rf "$staging"; return 1
      fi
    done
  else
    echo "[1/3] Building source sequentially..."
    local service
    for service in backend frontend; do
      if ! COMPOSE_PARALLEL_LIMIT=1 run_deploy_logged $DOCKER_CMD --progress plain --project-directory "$PWD" --env-file .env -f "$candidate" \
        build --build-arg "BUILD_COMMIT=$PANEL_COMMIT" "$service"; then
        echo "Source build failed; running deployment unchanged." >&2
        rm -rf "$staging"; return 1
      fi
    done
  fi
  if ! docker image inspect mysql:5.7 >/dev/null 2>&1; then
    if ! run_deploy_logged $DOCKER_CMD --project-directory "$PWD" --env-file .env -f "$candidate" pull mysql; then
      rm -rf "$staging"; return 1
    fi
  fi
  [ ! -f docker-compose.yml ] || { cp -p docker-compose.yml "$staging/previous.yml"; had_compose=1; }
  if [ "$mode" = source ]; then
    [ ! -d .source ] || { mv .source "$staging/previous-source"; had_source=1; }
    mv "$staging/source" .source
    sed "s@$staging/source/springboot-backend@./.source/springboot-backend@;s@$staging/source/vite-frontend@./.source/vite-frontend@" "$candidate" > "$candidate.new"
    mv "$candidate.new" "$candidate"
  fi
  cp "$candidate" docker-compose.yml.new
  mv docker-compose.yml.new docker-compose.yml
  echo "[2/3] Replacing panel containers; keeping MySQL volumes and saved settings..."
  if ! $DOCKER_CMD --project-directory "$PWD" up -d --no-build --pull never \
    || ! wait_backend_ready || ! verify_database_schema; then
    echo "Deployment failed. Database/credentials retained; restoring previous Compose configuration if available." >&2
    if [ "$had_compose" = 1 ]; then
      cp -p "$staging/previous.yml" docker-compose.yml
      if [ "$had_source" = 1 ]; then rm -rf .source; mv "$staging/previous-source" .source; fi
      $DOCKER_CMD --project-directory "$PWD" up -d --no-build --pull never || echo "Previous containers could not be restored; inspect docker logs." >&2
    fi
    rm -rf "$staging"; return 1
  fi
  printf 'COMMIT=%s\nMODE=%s\n' "$PANEL_COMMIT" "$mode" > .librelay-deployment.new
  mv .librelay-deployment.new .librelay-deployment
  rm -rf "$staging"
  echo "[3/3] Login API and database schema are ready. Deployment complete."
}

# Repository download URLs.
# Use raw repository files, not releases/latest:
# A node-agent release can become the latest GitHub release.
# Such a release may not contain Compose or initialization SQL.
# Avoid overwriting valid configuration with a Not Found response.
# Raw branch URLs are independent of release ordering.
DOCKER_COMPOSEV4_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/docker-compose-v4.yml"
DOCKER_COMPOSEV6_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/docker-compose-v6.yml"
GOST_SQL_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/gost.sql"
# Raw manager URL used when the running installer cannot be copied.
PANEL_INSTALL_RAW_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/panel_install.sh"

# Choose the legacy Compose URL based on the IPv6 setting.
get_docker_compose_url() {
  # Default to IPv4; use IPv6 Compose only with LIBRELAY_IPV6=1.
  if [ "$LIBRELAY_IPV6" = "1" ]; then
    echo "$DOCKER_COMPOSEV6_URL"
  else
    echo "$DOCKER_COMPOSEV4_URL"
  fi
}

# Check Docker and its Compose plugin.
check_docker() {
  # Install Docker automatically if it is missing.
  if ! command -v docker &> /dev/null; then
    echo "🔧 Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com | sh || true

    # The official Docker installer may reject Rocky/AlmaLinux and related distributions.
    # Try the official CentOS package repository when that happens.
    # These distributions can run Docker even when absent from the installer allowlist.
    if ! command -v docker &> /dev/null && command -v dnf &> /dev/null; then
      echo "🔧 The official installer does not support this distribution. Trying dnf with the official Docker CentOS repository..."
      dnf -y install dnf-plugins-core &> /dev/null || true
      # Support both old and new dnf config-manager syntax.
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo &> /dev/null || dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/centos/docker-ce.repo &> /dev/null || true
      dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || true
    fi

    # Fallback for older CentOS/RHEL installations with yum.
    if ! command -v docker &> /dev/null && command -v yum &> /dev/null; then
      echo "🔧 Trying yum with the official Docker CentOS repository..."
      yum -y install yum-utils &> /dev/null || true
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo &> /dev/null || true
      yum -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin || true
    fi

    if command -v systemctl &> /dev/null; then
      systemctl enable docker &> /dev/null || true
      systemctl start docker &> /dev/null || true
    fi
  fi

  command -v docker >/dev/null || { echo "Docker installation failed." >&2; exit 1; }
  if ! docker compose version >/dev/null 2>&1; then
    echo "Installing the Docker Compose plugin..."
    local compose_arch compose_candidate
    case "$(uname -m)" in
      x86_64) compose_arch=x86_64 ;;
      aarch64|arm64) compose_arch=aarch64 ;;
      *) echo "Unsupported Docker Compose architecture" >&2; exit 1 ;;
    esac
    mkdir -p /usr/local/lib/docker/cli-plugins
    compose_candidate=$(mktemp)
    curl -fLsS --retry 3 "https://github.com/docker/compose/releases/download/v2.32.1/docker-compose-linux-${compose_arch}" -o "$compose_candidate" || { rm -f "$compose_candidate"; exit 1; }
    install -m 755 "$compose_candidate" /usr/local/lib/docker/cli-plugins/docker-compose
    rm -f "$compose_candidate"
    docker compose version >/dev/null || { echo "Docker Compose plugin installation failed." >&2; exit 1; }
  fi
  DOCKER_CMD="docker compose"
  if ! docker info >/dev/null 2>&1; then
    systemctl enable --now docker
    docker info >/dev/null || { echo "Docker daemon is unavailable." >&2; exit 1; }
  fi
  if [ "$LIBRELAY_PANEL_SOURCE" = 1 ] && ! docker buildx version >/dev/null 2>&1; then
    echo "--source requires the Docker Buildx plugin. Use default images or install docker-buildx-plugin." >&2
    exit 1
  fi
  echo "Docker Compose command: $DOCKER_CMD"
}

# Detect IPv6 support.
check_ipv6_support() {
  echo "🔍 Checking IPv6 support..."

  # Exclude link-local IPv6 addresses.
  if ip -6 addr show | grep -v "scope link" | grep -q "inet6"; then
    echo "✅ IPv6 support detected"
    return 0
  elif ifconfig 2>/dev/null | grep -v "fe80:" | grep -q "inet6"; then
    echo "✅ IPv6 support detected"
    return 0
  else
    echo "⚠️ IPv6 support not detected"
    return 1
  fi
}



# Enable IPv6 for Docker.
configure_docker_ipv6() {
  echo "🔧 Configuring Docker IPv6 support..."

  # Detect the operating system.
  OS_TYPE=$(uname -s)

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    # Docker Desktop on macOS supports IPv6 by default.
    echo "✅ Docker Desktop on macOS supports IPv6 by default"
    return 0
  fi

  # Docker daemon configuration path.
  DOCKER_CONFIG="/etc/docker/daemon.json"

  # Determine whether sudo is needed.
  if [[ $EUID -ne 0 ]]; then
    SUDO_CMD="sudo"
  else
    SUDO_CMD=""
  fi

  # Check existing Docker configuration.
  if [ -f "$DOCKER_CONFIG" ]; then
    # Skip IPv6 configuration if already enabled.
    if grep -q '"ipv6"' "$DOCKER_CONFIG"; then
      echo "✅ Docker IPv6 support is already configured"
    else
      echo "📝 Updating Docker configuration to enable IPv6..."
      # Back up the original configuration.
      $SUDO_CMD cp "$DOCKER_CONFIG" "${DOCKER_CONFIG}.backup"

      # Add IPv6 settings using jq or sed.
      if command -v jq &> /dev/null; then
        $SUDO_CMD jq '. + {"ipv6": true, "fixed-cidr-v6": "fd00::/80"}' "$DOCKER_CONFIG" > /tmp/daemon.json && $SUDO_CMD mv /tmp/daemon.json "$DOCKER_CONFIG"
      else
        # Use sed when jq is unavailable.
        $SUDO_CMD sed -i 's/^{$/{\n  "ipv6": true,\n  "fixed-cidr-v6": "fd00::\/80",/' "$DOCKER_CONFIG"
      fi

      echo "🔄 Restarting Docker..."
      if command -v systemctl &> /dev/null; then
        $SUDO_CMD systemctl restart docker
      elif command -v service &> /dev/null; then
        $SUDO_CMD service docker restart
      else
        echo "⚠️ Please restart Docker manually"
      fi
      sleep 5
    fi
  else
    # Create a new configuration file.
    echo "📝 Creating Docker configuration..."
    $SUDO_CMD mkdir -p /etc/docker
    echo '{
  "ipv6": true,
  "fixed-cidr-v6": "fd00::/80"
}' | $SUDO_CMD tee "$DOCKER_CONFIG" > /dev/null

    echo "🔄 Restarting Docker..."
    if command -v systemctl &> /dev/null; then
      $SUDO_CMD systemctl restart docker
    elif command -v service &> /dev/null; then
      $SUDO_CMD service docker restart
    else
      echo "⚠️ Please restart Docker manually"
    fi
    sleep 5
  fi
}

# Display the management menu.
show_menu() {
  echo "==============================================="
  echo "          Librelay Panel Management"
  echo "==============================================="
  echo "  1. Install panel"
  echo "  2. Update panel"
  echo "  3. Uninstall panel"
  echo "  4. Purge panel (remove containers/images/volumes/commands)"
  echo "  5. Show status"
  echo "  6. Show access information (URL/account)"
  echo "  7. Export database backup"
  echo "  8. Configure domain + HTTPS"
  echo "  9. Restore database backup"
  echo "  0. Exit"
  echo "==============================================="
}

generate_random() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c16
}

# Remove only temporary installers; retain persistent management scripts.
delete_self() {
  SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
  # Keep both management scripts under /usr/local/bin so librelay remains usable.
  case "$SCRIPT_PATH" in
    /usr/local/bin/librelay-panel.sh|/usr/local/bin/librelay|/usr/local/bin/tms-panel.sh|/usr/local/bin/tms) return 0 ;;
  esac
  echo ""
  echo "🗑️ Operation complete. Removing the temporary installer..."
  sleep 1
  rm -f "$SCRIPT_PATH" && echo "✅ Temporary installer removed" || echo "❌ Failed to remove temporary installer"
}

# Initial credentials are shown only immediately after a fresh installation.
print_access_box() {
  local ip="$1" fport="$2" initial_install="${3:-}"
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║              Librelay Panel                           ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "    Panel URL :  http://${ip}:${fport}"
  if [ "$initial_install" = initial ]; then
    echo "    Username :  admin_user"
    echo "    Password :  admin_user"
    echo ""
    echo "    ⚠️  Change the default password immediately after signing in"
  fi
  echo ""
  echo "  ──────────────────────────────────────────────────────"
  echo "    Management : run librelay (update/uninstall/purge/status)"
  echo "    Repository :  https://github.com/${GITHUB_REPO}"
  echo "  ──────────────────────────────────────────────────────"
  echo ""
}

# Install the persistent librelay management command.
install_librelay_command() {
  echo "🔗 Installing the librelay management command..."
  local self panel_dir
  local command_dir="${LIBRELAY_COMMAND_DIR:-${TMS_COMMAND_DIR:-/usr/local/bin}}"
  panel_dir="$(pwd)"
  self="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
  # Copy this installer when possible; otherwise download it.
  if [ -f "$self" ] && [ -s "$self" ]; then
    cp -f "$self" "$command_dir/librelay-panel.sh" 2>/dev/null || true
  fi
  if [ ! -f "$command_dir/librelay-panel.sh" ]; then
    curl -fLsS "$PANEL_INSTALL_RAW_URL" -o "$command_dir/librelay-panel.sh" 2>/dev/null || true
  fi
  chmod +x "$command_dir/librelay-panel.sh" 2>/dev/null || true
  # The launcher enters the saved installation directory for Compose commands.
  cat > "$command_dir/librelay" <<EOF
#!/bin/bash
# Librelay panel management. Run librelay without arguments to open the menu.
export GITHUB_REPO="$GITHUB_REPO"
export GITHUB_REF="$GITHUB_REF"
LIBRELAY_DIR="$panel_dir"
export TMS_DIR="\$LIBRELAY_DIR"
[ -d "\$LIBRELAY_DIR" ] && cd "\$LIBRELAY_DIR"
# Forward all arguments: librelay domain needs both the command and hostname.
# Passing only the first argument would discard the domain.
if [ \$# -eq 0 ]; then exec bash "$command_dir/librelay-panel.sh" menu; fi
exec bash "$command_dir/librelay-panel.sh" "\$@"
EOF
  chmod +x "$command_dir/librelay" 2>/dev/null || true
  cp -f "$command_dir/librelay" "$command_dir/tms"
  chmod +x "$command_dir/tms"
  echo "✅ Management command ready: run librelay for update/uninstall/purge/status"
}

# Compatibility signature used by older self-updating managers.
install_tms_command() { install_librelay_command "$@"; }

# Display container status.
show_status() {
  echo "📊 Librelay panel container status:"
  docker ps -a --filter "name=$MYSQL_CONTAINER" --filter "name=$BACKEND_CONTAINER" --filter "name=$FRONTEND_CONTAINER" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker ps -a
}

# Return the public IP or a placeholder; callers validate the result.
get_server_ip() {
  curl -s --max-time 8 https://api.ipify.org 2>/dev/null \
    || curl -s --max-time 8 https://ipinfo.io/ip 2>/dev/null \
    || echo 'SERVER_IP'
}

# Resolve the domain A record (IPv4).
# getent hosts may return an AAAA record first when both address families exist.
# That would create a false mismatch against the public IPv4 address.
# Some minimal systems also have incomplete DNS NSS configuration.
# Use ahostsv4 first, then dig, host and nslookup.
resolve_a_record() {
  local d="$1" ip=""
  ip="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | head -n1)"
  if [ -z "$ip" ] && command -v dig >/dev/null 2>&1; then
    ip="$(dig +short +time=3 +tries=2 A "$d" 2>/dev/null | grep -E '^[0-9.]+$' | head -n1)"
  fi
  if [ -z "$ip" ] && command -v host >/dev/null 2>&1; then
    ip="$(host -t A "$d" 2>/dev/null | awk '/has address/{print $4; exit}')"
  fi
  if [ -z "$ip" ] && command -v nslookup >/dev/null 2>&1; then
    # Read Address only after Name, excluding the DNS server address.
    # This guard avoids accidentally returning the resolver IP.
    ip="$(nslookup -type=A "$d" 2>/dev/null | awk '/^Name:/{f=1} f && /^Address: /{print $2; exit}')"
  fi
  echo "$ip"
}
# Read the public frontend port from .env; default to 2095.
get_frontend_port() {
  local fport=""
  [ -f ".env" ] && fport="$(grep '^FRONTEND_PORT=' .env | cut -d'=' -f2)"
  [ -z "$fport" ] && fport="2095"
  echo "$fport"
}

# Show access details for an existing deployment without claiming default credentials.
show_access_info() {
  print_access_box "$(get_server_ip)" "$(get_frontend_port)"
  local deployment_file=.librelay-deployment
  [ -f "$deployment_file" ] || deployment_file=.tms-deployment
  if [ -f "$deployment_file" ]; then
    echo "Deployment commit: $(sed -n 's/^COMMIT=//p' "$deployment_file")"
    echo "Deployment mode: $(sed -n 's/^MODE=//p' "$deployment_file")"
  fi
  local d
  d="$(current_domain)"
  [ -n "$d" ] && echo "🌐 Configured domain URL: $(current_https_url)"
  return 0
}

# Purge all panel containers, images, volumes, networks, configuration and commands.
# Check whether the current Compose file belongs to Librelay.
# down -v and removing .env are destructive in an unrelated directory.
# Verify ownership before removing files or volumes.
is_librelay_compose() {
  [ -f docker-compose.yml ] && grep -Eq "teminuosi|gost-mysql|librelay-mysql|LIBRELAY_MYSQL_CONTAINER" docker-compose.yml
}

purge_panel() {
  echo "🧨 Purging Librelay (removing containers/images/data volumes/networks/configuration and management commands)..."

  # A downloaded purge command may run outside the install directory.
  # Find the saved directory so configuration is removed there as well.
  # Read LIBRELAY_DIR from the installed launcher.
  if ! is_librelay_compose && [ -f /usr/local/bin/tms ]; then
    recorded_dir="$(grep -m1 -E '^(LIBRELAY_DIR|TMS_DIR)=' /usr/local/bin/tms 2>/dev/null | cut -d'"' -f2)"
    if [ -n "$recorded_dir" ] && [ -d "$recorded_dir" ]; then
      cd "$recorded_dir" 2>/dev/null && echo "📁 Using the saved panel directory: $recorded_dir"
    fi
  fi

  if [ -f docker-compose.yml ] && ! is_librelay_compose; then
    echo "⚠️  The current docker-compose.yml does not belong to Librelay. Skipping Compose cleanup and configuration removal."
    echo "    Only named Librelay containers/images will be removed. Enter the panel install directory to purge its files."
  fi
  if command -v docker &> /dev/null; then
    # Use Compose cleanup only for a verified Librelay deployment.
    if is_librelay_compose; then
      docker compose down -v --rmi all --remove-orphans 2>/dev/null \
        || docker-compose down -v --rmi all --remove-orphans 2>/dev/null || true
    fi
    # Fallback: remove known Librelay containers by name.
    # Remove Caddy too, since it is attached to gost-network.
    docker rm -f "$MYSQL_CONTAINER" "$BACKEND_CONTAINER" "$FRONTEND_CONTAINER" "$CADDY_CONTAINER" gost-mysql springboot-backend vite-frontend tms-caddy librelay-mysql librelay-backend librelay-frontend librelay-caddy 2>/dev/null || true
    # Compose may prefix volume names with its project name.
    # Also match suffixes when the Compose file has been lost.
    # Leaving a MySQL volume would cause a fresh install to reuse the old database.
    docker volume rm "$MYSQL_VOLUME" "$LOG_VOLUME" "$CADDY_DATA" "$CADDY_CONFIG" mysql_data backend_logs tms_caddy_data tms_caddy_config 2>/dev/null || true
    docker volume ls -q 2>/dev/null       | grep -E '(^|_)(mysql_data|backend_logs|tms_caddy_data|tms_caddy_config|librelay_mysql_data|librelay_backend_logs|librelay_caddy_data|librelay_caddy_config)$'       | xargs -r docker volume rm 2>/dev/null || true
    docker network rm "$PANEL_NETWORK" gost-network librelay-network 2>/dev/null || true
    docker rmi -f ghcr.io/teminuosi/springboot-backend:latest ghcr.io/teminuosi/vite-frontend:latest mysql:5.7 2>/dev/null || true
    # Reclaim only dangling images; leave other applications alone.
    docker image prune -f 2>/dev/null || true
  fi
  # Remove configuration only in a verified panel directory.
  # An unrelated project may also have a file named .env.
  if is_librelay_compose || [ ! -f docker-compose.yml ]; then
    rm -f docker-compose.yml docker-compose-v4.yml docker-compose-v6.yml gost.sql .env temp_migration.sql 2>/dev/null || true
  fi
  # Remove persistent management commands.
  rm -f /usr/local/bin/librelay /usr/local/bin/tms /usr/local/bin/librelay-panel.sh /usr/local/bin/tms-panel.sh 2>/dev/null || true
  rm -rf /etc/librelay /etc/tms 2>/dev/null || true
  echo "✅ Purge complete. Librelay is no longer installed."
  echo "ℹ️  Only the panel was removed. Node agents (gost / sing-box) were retained."
  echo "    To uninstall a node, run the node uninstaller on that machine (see README)."
}



# Read installation settings.
# Port helpers can search nearby free ports.
#
# Panel defaults to 2095; backend defaults to 6365. Check both on the panel host.
# Repeated installations or other local services can cause port conflicts.
# A conflicting port may cause failed startup or repeated container restarts.
#
# Match the full address/port suffix instead of relying on ss column positions.
# The ss output layout varies between versions.
# Match a full port, so 12095 cannot be mistaken for 2095.
port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lnt 2>/dev/null | grep -qE "[:.]${port}([[:space:]]|$)" && return 0
    return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | grep -qE "[:.]${port}([[:space:]]|$)" && return 0
    return 1
  fi
  return 1
}

pick_free_port() {
  # Declare these locals separately so arithmetic can read the previous variable.
  # A combined declaration can expand start before it has a value.
  # That would silently break automatic free-port selection.
  local start="$1"
  local p="$start"
  local limit=$((start + 100))
  while [ "$p" -lt "$limit" ]; do
    if ! port_in_use "$p"; then
      echo "$p"
      return 0
    fi
    p=$((p + 1))
  done
  echo "$start"
}

get_config_params() {
  BACKEND_PORT=${BACKEND_PORT:-6365}
  if [ -z "${FRONTEND_PORT:-}" ]; then
    FRONTEND_PORT=2095
    if [ -t 0 ]; then
      while true; do
        read -rp "Panel port [2095]: " panel_input
        panel_input=${panel_input:-2095}
        if valid_port "$panel_input" && ! port_in_use "$panel_input"; then
          FRONTEND_PORT=$((10#$panel_input)); break
        fi
        echo "Invalid or occupied TCP port. Choose a port between 1 and 65535."
      done
    fi
  fi
  valid_port "$FRONTEND_PORT" || { echo "Invalid panel port: $FRONTEND_PORT" >&2; exit 1; }
  valid_port "$BACKEND_PORT" || { echo "Invalid backend port: $BACKEND_PORT" >&2; exit 1; }
  FRONTEND_PORT=$((10#$FRONTEND_PORT))
  BACKEND_PORT=$((10#$BACKEND_PORT))
  local https_port=${INSTALL_HTTPS_PORT:-443}
  if [ -n "$INSTALL_DOMAIN" ] && { [ "$FRONTEND_PORT" = 80 ] || [ "$FRONTEND_PORT" = "$https_port" ] || [ "$BACKEND_PORT" = 80 ] || [ "$BACKEND_PORT" = "$https_port" ]; }; then
    echo "Caddy needs panel-host ports 80 and $https_port. Choose separate panel HTTP/backend ports." >&2; exit 1
  fi
  [ "$FRONTEND_PORT" != "$BACKEND_PORT" ] || { echo "Panel and backend ports must differ." >&2; exit 1; }
  ! port_in_use "$FRONTEND_PORT" || { echo "Panel TCP port $FRONTEND_PORT is already occupied." >&2; exit 1; }
  ! port_in_use "$BACKEND_PORT" || { echo "Backend TCP port $BACKEND_PORT is already occupied." >&2; exit 1; }
  DB_NAME=librelay
  DB_USER=librelay
  DB_PASSWORD=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 48)
}

# mysqladmin ping only proves the server is alive, not that init SQL succeeded.
verify_database_schema() {
  local count attempt
  for attempt in {1..30}; do
    count=$(docker exec "$MYSQL_CONTAINER" sh -c '
      export MYSQL_PWD="$MYSQL_PASSWORD"
      exec mysql --user="$MYSQL_USER" --database="$MYSQL_DATABASE" --batch --skip-column-names -e "$1"
    ' sh "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('forward','node','speed_limit','statistics_flow','tunnel','user','user_tunnel','vite_config','inbound','inbound_user','landing','inbound_line')" 2>/dev/null) || count=""
    if [ "$count" = 12 ]; then return 0; fi
    sleep 2
  done
  echo "Database schema initialization failed. Check: docker logs $MYSQL_CONTAINER --tail 80" >&2
  echo "Keep the existing .env and MySQL volume; update the backend to recover missing tables." >&2
  return 1
}

backend_api_ready() {
  local port
  port=$(sed -n 's/^BACKEND_PORT=//p' .env | head -1)
  port=${port:-6365}
  valid_port "$port" || return 1
  curl --noproxy '*' -fsS --max-time 4 -X POST "http://127.0.0.1:${port}/api/v1/captcha/check" 2>/dev/null \
    | grep -Eq '"code"[[:space:]]*:[[:space:]]*0[[:space:]]*[,}]'
}

wait_backend_ready() {
  local attempt state health
  echo "🔍 Checking backend login API and database readiness..."
  for attempt in {1..180}; do
    state=$(docker inspect -f '{{.State.Status}}' "$BACKEND_CONTAINER" 2>/dev/null) || state=not_found
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}not_configured{{end}}' "$BACKEND_CONTAINER" 2>/dev/null) || health=unknown
    if [ "$state" = running ] && backend_api_ready; then
      echo "✅ Backend login API and database are ready"
      return 0
    fi
    case "$state" in
      exited|dead|not_found)
        echo "❌ Backend container state: $state. Check: docker logs $BACKEND_CONTAINER --tail 80" >&2
        return 1 ;;
    esac
    if [ $((attempt % 15)) = 1 ]; then
      echo "⏳ Waiting for backend readiness... ($attempt/180) container=$state health=$health"
    fi
    sleep 1
  done
  echo "❌ Backend readiness timed out. Check: docker logs $BACKEND_CONTAINER --tail 80" >&2
  return 1
}

# Install the panel.
install_panel() {
  echo "🚀 Starting panel installation..."
  acquire_install_lock || return 1
  load_deployment_layout || return 1
  if [ -f .env ]; then
    echo "Existing installation found. .env and database preserved. Use: librelay update"
    [ -z "${FRONTEND_PORT:-}" ] || { echo "Port changes require editing the existing FRONTEND_PORT in .env." >&2; return 1; }
    show_access_info
    return 0
  fi
  check_docker
  if docker volume inspect "$MYSQL_VOLUME" >/dev/null 2>&1 || docker volume inspect mysql_data >/dev/null 2>&1; then
    echo "Existing $MYSQL_VOLUME volume found without .env. Restore the original credentials before installing." >&2
    return 1
  fi
  get_config_params
  load_deployment_layout || return 1
  umask 077

  cat > .env <<EOF
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
GITHUB_REPO=$GITHUB_REPO
GITHUB_REF=$GITHUB_REF
LIBRELAY_LAYOUT=1
LIBRELAY_MYSQL_CONTAINER=$MYSQL_CONTAINER
LIBRELAY_BACKEND_CONTAINER=$BACKEND_CONTAINER
LIBRELAY_FRONTEND_CONTAINER=$FRONTEND_CONTAINER
LIBRELAY_MYSQL_VOLUME=$MYSQL_VOLUME
LIBRELAY_LOG_VOLUME=$LOG_VOLUME
LIBRELAY_NETWORK=$PANEL_NETWORK
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
EOF

  install_librelay_command
  deploy_panel || return 1

  # Save the detected backend address for generated node commands.
  echo "Detecting the public IP and configuring the backend address..."
  PUBLIC_IP=$(curl -s --max-time 8 https://api.ipify.org || curl -s --max-time 8 https://ipinfo.io/ip || echo "")
  if [[ "$PUBLIC_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    for i in $(seq 1 30); do
      if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost --silent >/dev/null 2>&1; then
        if docker exec "$MYSQL_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
             -e "INSERT IGNORE INTO vite_config (name, value, time) VALUES ('ip', '${PUBLIC_IP}:${BACKEND_PORT}', $(date +%s)000);" >/dev/null 2>&1; then
          echo "      ✔ Backend address set to ${PUBLIC_IP}:${BACKEND_PORT}"
        fi
        break
      fi
      sleep 2
    done
  else
    echo "      ⚠ Could not detect the public IP. Set the backend address in Website Settings after login (IP:${BACKEND_PORT})"
  fi

  # Install the persistent librelay command.
  install_librelay_command >/dev/null 2>&1

  # Print access information after all installation output.
  echo "Librelay installed successfully"
  print_access_box "${PUBLIC_IP:-SERVER_IP}" "$FRONTEND_PORT" initial
  echo "Commands: librelay | librelay status | librelay info | librelay update | librelay domain example.com"
  [ -z "$INSTALL_DOMAIN" ] || setup_domain "$INSTALL_DOMAIN" "${INSTALL_HTTPS_PORT:-}"


}

# Update the manager before taking the deployment lock, retaining all CLI options.
update_panel() {
  if [ -z "${LIBRELAY_SELF_UPDATED:-${TMS_SELF_UPDATED:-}}" ] && [ -w /usr/local/bin ]; then
    local manager_candidate
    manager_candidate=$(mktemp "$PWD/.manager.XXXXXX")
    if curl -fLsS --connect-timeout 10 --max-time 30 --retry 2 -o "$manager_candidate" "$PANEL_INSTALL_RAW_URL" \
      && bash -n "$manager_candidate" && grep -q 'install_librelay_command' "$manager_candidate"; then
      if ! cmp -s "$manager_candidate" "$0"; then
        install -m 755 "$manager_candidate" /usr/local/bin/librelay-panel.sh
        rm -f "$manager_candidate"
        export LIBRELAY_SELF_UPDATED=1
        local manager_args=(update --install-dir "$PWD")
        [ "$LIBRELAY_PANEL_SOURCE" = 0 ] || manager_args+=(--source)
        exec bash /usr/local/bin/librelay-panel.sh "${manager_args[@]}"
      fi
    fi
    rm -f "$manager_candidate"
  fi
  echo "🔄 Starting panel update..."
  acquire_install_lock || return 1
  check_docker
  [ -f .env ] || { echo "Missing .env; restore it before updating." >&2; return 1; }
  if ! grep -q '^GITHUB_REPO=' .env; then
    echo "Adding repository identity to .env; existing credentials and ports are unchanged."
    printf '\nGITHUB_REPO=%s\n' "$GITHUB_REPO" >> .env
  fi
  if ! grep -q '^GITHUB_REF=' .env; then printf 'GITHUB_REF=%s\n' "$GITHUB_REF" >> .env; fi
  chmod 600 .env
  unset FRONTEND_PORT BACKEND_PORT
  # Additive database migrations run in the backend before the readiness checks.
  deploy_panel || return 1
  install_librelay_command
  echo "✅ Update complete"
  show_access_info
}

# Export a database backup.
export_migration_sql() {
  echo "📄 Starting database backup export..."

  # Read database configuration.
  echo "🔍 Reading database configuration..."

  # Check whether the backend container is running.
  if ! docker ps --format "{{.Names}}" | grep -qx "$BACKEND_CONTAINER"; then
    echo "❌ Backend container is not running. Reading configuration from .env..."

    # Read configuration from .env.
    if [[ -f ".env" ]]; then
      DB_NAME=$(grep "^DB_NAME=" .env | cut -d'=' -f2 2>/dev/null)
      DB_PASSWORD=$(grep "^DB_PASSWORD=" .env | cut -d'=' -f2 2>/dev/null)
      DB_USER=$(grep "^DB_USER=" .env | cut -d'=' -f2 2>/dev/null)

      if [[ -n "$DB_NAME" && -n "$DB_PASSWORD" && -n "$DB_USER" ]]; then
        echo "✅ Database configuration loaded from .env"
      else
        echo "❌ Database configuration in .env is incomplete"
        return 1
      fi
    else
      echo "❌ .env file not found"
      return 1
    fi
  else
    # Read database settings from the container environment.
    DB_INFO=$(docker exec "$BACKEND_CONTAINER" env | grep "^DB_" 2>/dev/null || echo "")

    if [[ -n "$DB_INFO" ]]; then
      DB_NAME=$(echo "$DB_INFO" | grep "^DB_NAME=" | cut -d'=' -f2)
      DB_PASSWORD=$(echo "$DB_INFO" | grep "^DB_PASSWORD=" | cut -d'=' -f2)
      DB_USER=$(echo "$DB_INFO" | grep "^DB_USER=" | cut -d'=' -f2)

      echo "✅ Database configuration loaded from the container environment"
    else
      echo "❌ Could not read container configuration. Trying .env..."

      if [[ -f ".env" ]]; then
        DB_NAME=$(grep "^DB_NAME=" .env | cut -d'=' -f2 2>/dev/null)
        DB_PASSWORD=$(grep "^DB_PASSWORD=" .env | cut -d'=' -f2 2>/dev/null)
        DB_USER=$(grep "^DB_USER=" .env | cut -d'=' -f2 2>/dev/null)

        if [[ -n "$DB_NAME" && -n "$DB_PASSWORD" && -n "$DB_USER" ]]; then
          echo "✅ Database configuration loaded from .env"
        else
          echo "❌ Database configuration in .env is incomplete"
          return 1
        fi
      else
        echo "❌ .env file not found"
        return 1
      fi
    fi
  fi

  # Validate the required database settings.
  if [[ -z "$DB_PASSWORD" || -z "$DB_USER" || -z "$DB_NAME" ]]; then
    echo "❌ Database configuration is incomplete (required parameters are missing)"
    return 1
  fi

  echo "📋 Database configuration:"
  echo "   Database: $DB_NAME"
  echo "   Username: $DB_USER"

  # Check whether MySQL is running.
  if ! docker ps --format "{{.Names}}" | grep -qx "$MYSQL_CONTAINER"; then
    echo "❌ Database container is not running; export cannot proceed"
    echo "🔍 Running containers:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
    return 1
  fi

  # Generate the database backup filename.
  SQL_FILE="database_backup_$(date +%Y%m%d_%H%M%S).sql"
  echo "📝 Exporting database backup: $SQL_FILE"

  # Keep --default-character-set=utf8mb4 when exporting.
  # The panel schema and MySQL server use utf8mb4.
  # A three-byte utf8 connection can silently corrupt four-byte characters.
  # Emoji in node names would be replaced with question marks.
  # Ordinary three-byte text may still look correct, hiding the corruption.
  # Use the full character set to preserve all node names.
  # Export using mysqldump.
  echo "⏳ Exporting database..."
  if docker exec "$MYSQL_CONTAINER" mysqldump --default-character-set=utf8mb4 -u "$DB_USER" -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME" > "$SQL_FILE" 2>/dev/null; then
    echo "✅ Database export complete"
  else
    echo "⚠️ Database user authentication failed. Trying the root account..."
    if docker exec "$MYSQL_CONTAINER" mysqldump --default-character-set=utf8mb4 -u root -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME" > "$SQL_FILE" 2>/dev/null; then
      echo "✅ Database export complete"
    else
      echo "❌ Database export failed"
      rm -f "$SQL_FILE"
      return 1
    fi
  fi

  # Check file size and the completion marker.
  if [[ -f "$SQL_FILE" ]] && [[ -s "$SQL_FILE" ]]; then
    if ! _verify_sql_dump "$SQL_FILE"; then
      rm -f "$SQL_FILE"
      return 1
    fi
    FILE_SIZE=$(du -h "$SQL_FILE" | cut -f1)
    echo "📁 File: $(pwd)/$SQL_FILE"
    echo "📊 Size: $FILE_SIZE"
    echo "🔒 Backup verified (mysqldump completion marker found)"
    echo "➡️  Migration: install the panel on the new server, then run  librelay restore $SQL_FILE"
  else
    echo "❌ Exported file is empty or missing"
    rm -f "$SQL_FILE"
    return 1
  fi
}


# ============================================================
# Domain and HTTPS management using Caddy certificates.
#
# Keep Caddy outside the generated Compose file:
# Updates replace Compose files, so embedding Caddy there would be fragile.
# An independent Caddy container can stay running during panel restarts.
# It joins gost-network and proxies to frontend:80.
# ============================================================



# Read the configured domain, or return an empty string.
# Skip comments/global settings and locate the first site block.
current_caddy_site() {
  [ -f "$CADDY_FILE" ] || return 0
  grep -m1 -E '^[^#[:space:]][^{]*\{' "$CADDY_FILE" 2>/dev/null | sed 's/[[:space:]]*{.*//;s~^https://~~' | tr -d ' '
}

current_domain() {
  current_caddy_site | sed 's/:[0-9]*$//'
}

current_https_port() {
  local site port
  site=$(current_caddy_site)
  port=${site##*:}
  if [ "$port" != "$site" ] && valid_port "$port"; then echo "$port"; else echo 443; fi
}

https_url() {
  if [ "$2" = 443 ]; then echo "https://$1"; else echo "https://$1:$2"; fi
}

current_https_url() {
  local domain
  domain=$(current_domain)
  [ -n "$domain" ] || return 0
  https_url "$domain" "$(current_https_port)"
}

write_caddy_config() {
  local domain="$1" port="$2" target="$3"
  cat > "$target" <<EOF
# Librelay panel: generated by librelay domain
{
    https_port $port
}
$domain:$port {
    encode gzip
EOF
  if [ "$port" != 443 ]; then
    cat >> "$target" <<'EOF'
    tls {
        issuer acme {
            disable_tlsalpn_challenge
        }
    }
EOF
  fi
  cat >> "$target" <<'EOF'
    reverse_proxy frontend:80 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
EOF
}

start_caddy() {
  docker run -d --name "$CADDY_CONTAINER" --restart unless-stopped --network "$PANEL_NETWORK" \
    -p 80:80 -p "$1:$1" \
    -v "$CADDY_FILE":/etc/caddy/Caddyfile:ro \
    -v "$CADDY_DATA":/data -v "$CADDY_CONFIG":/config caddy:2-alpine >/dev/null
}

show_domain_status() {
  local d
  d="$(current_domain)"
  if [ -z "$d" ]; then
    echo "ℹ️  No domain configured. Panel URL: http://IP:$(get_frontend_port)"
    echo "   Configure a domain: librelay domain panel.example.com"
    return 0
  fi
  echo "🌐 Current domain: $d"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CADDY_CONTAINER"; then
    echo "   Caddy status: ✅ running"
    echo "   Panel URL:   $(current_https_url)"
  else
    echo "   Caddy status: ❌ not running (try librelay domain $d to configure it again)"
  fi
}

# Disable domain access and return to the HTTP IP/port URL.
domain_off() {
  echo "🧹 Disabling domain access..."
  docker rm -f "$CADDY_CONTAINER" 2>/dev/null || true
  rm -f "$CADDY_FILE" 2>/dev/null || true
  echo "✅ Domain access disabled. Panel URL: http://$(get_server_ip):$(get_frontend_port)"
  echo "ℹ️  Certificates remain in the $CADDY_DATA volume for reuse with the same domain."
}

setup_domain() {
  local domain="$1" https_port="${2:-}" old_port url candidate backup owned_ports
  old_port=$(current_https_port)
  if [ -z "$https_port" ]; then
    if [ "$domain" = "$(current_domain)" ]; then https_port=$old_port; else https_port=443; fi
  fi

  if [ -z "$domain" ]; then
    if [ -n "${2:-}" ]; then
      domain=$(current_domain)
      [ -n "$domain" ] || { echo "No existing domain; supply domain DOMAIN with --https-port." >&2; return 1; }
    else
      show_domain_status
      return 0
    fi
  fi
  # Retain the previous non-English off alias for CLI compatibility.
  if [ "$domain" = "off" ] || [ "$domain" = $'\345\205\263\351\227\255' ]; then
    domain_off
    return 0
  fi

  # Validate a hostname without a URL scheme or port.
  if ! echo "$domain" | grep -qE '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'; then
    echo "❌ Invalid domain: $domain"
    echo "   Enter only the hostname, without a scheme or port. Example: librelay domain panel.example.com"
    return 1
  fi
  if echo "$domain" | grep -qE '^[0-9.]+$'; then
    echo "❌ An IP address was supplied. This command requires a domain name."
    return 1
  fi

  valid_port "$https_port" || { echo "Invalid HTTPS port: $https_port" >&2; return 1; }
  https_port=$((10#$https_port))
  if [ "$https_port" = 80 ] || [ "$https_port" = 2019 ]; then
    echo "HTTPS port conflicts with Caddy HTTP validation or its admin listener." >&2; return 1
  fi
  local frontend_port backend_port
  frontend_port=$(get_frontend_port)
  backend_port=$(sed -n 's/^BACKEND_PORT=//p' .env | head -1)
  backend_port=${backend_port:-6365}
  if [ "$https_port" = "$frontend_port" ] || [ "$https_port" = "$backend_port" ]; then
    echo "HTTPS port $https_port conflicts with the panel HTTP/API port." >&2
    echo "For HTTPS 2095: set FRONTEND_PORT=8080 in the original .env, run librelay update, then configure the domain with --https-port 2095." >&2
    return 1
  fi
  url=$(https_url "$domain" "$https_port")

  if ! command -v docker &>/dev/null; then
    echo "❌ Docker is not installed. Install the panel first."
    return 1
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx "$FRONTEND_CONTAINER"; then
    echo "❌ Panel is not running ($FRONTEND_CONTAINER container not found). Start the panel before configuring a domain."
    return 1
  fi

  echo "🌐 Configuring panel domain: $domain"
  echo ""

  # DNS checks are advisory because CDN addresses and propagation may differ.
  echo "[1/5] Checking domain DNS..."
  local server_ip resolved
  server_ip="$(get_server_ip)"
  resolved="$(resolve_a_record "$domain")"
  if [ -z "$resolved" ]; then
    echo "   ⚠️  Could not resolve $domain; certificate issuance may fail."
    echo "      Add a DNS A record pointing to $server_ip and wait for DNS propagation."
    echo "      DNS changes may take a few minutes. Enter y to continue once propagation is complete."
    read -p "      Continue anyway? (y/N): " go
    [[ "$go" == "y" || "$go" == "Y" ]] || { echo "Cancelled"; return 1; }
  elif [ "$resolved" != "$server_ip" ]; then
    echo "   ⚠️  $domain resolves to $resolved; this server is $server_ip. The addresses do not match."
    echo "      A CDN (such as the Cloudflare proxy) may explain this difference. Check its certificate configuration."
    read -p "      Continue anyway? (y/N): " go
    [[ "$go" == "y" || "$go" == "Y" ]] || { echo "Cancelled"; return 1; }
  else
    echo "   ✔ DNS matches -> $resolved"
  fi

  # Panel-host conflicts only. Do not ignore ports owned by other Docker containers.
  echo "[2/5] Checking ports 80 / $https_port ..."
  owned_ports=$(docker port "$CADDY_CONTAINER" 2>/dev/null | awk '{p=$NF; sub(/^.*:/,"",p); print p}') || owned_ports=""
  local p
  for p in 80 "$https_port"; do
    if port_in_use "$p" && ! printf '%s\n' "$owned_ports" | grep -qx "$p"; then
      echo "TCP port $p is occupied on the panel host; existing Caddy configuration retained." >&2
      return 1
    fi
  done

  echo "[3/5] Writing and validating configuration..."
  mkdir -p "$(dirname "$CADDY_FILE")"
  candidate="$CADDY_FILE.new"
  backup="$CADDY_FILE.previous"
  write_caddy_config "$domain" "$https_port" "$candidate"
  if ! docker run --rm -v "$candidate":/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile; then
    rm -f "$candidate"
    echo "Caddy configuration validation failed; existing service retained." >&2
    return 1
  fi
  rm -f "$backup"
  [ ! -f "$CADDY_FILE" ] || cp -p "$CADDY_FILE" "$backup"
  docker rm -f "$CADDY_CONTAINER" 2>/dev/null || true
  mv "$candidate" "$CADDY_FILE"
  echo "[4/5] Starting Caddy: $url"
  if ! start_caddy "$https_port"; then
    echo "Caddy startup failed. Restoring the previous configuration." >&2
    if [ -f "$backup" ]; then
      mv "$backup" "$CADDY_FILE"
      docker rm -f "$CADDY_CONTAINER" 2>/dev/null || true
      start_caddy "$old_port" || echo "Previous Caddy could not restart; inspect docker logs $CADDY_CONTAINER" >&2
    else
      rm -f "$CADDY_FILE"
    fi
    return 1
  fi
  rm -f "$backup"
  echo "   ✔ Container started"

  # Wait for the certificate.
  echo "[5/5] Waiting for certificate issuance (up to 60 seconds)..."
  local ok=0 i
  for i in $(seq 1 30); do
    sleep 2
    if curl -fsS --max-time 5 -o /dev/null "$url/" 2>/dev/null; then
      ok=1
      break
    fi
    # Stop waiting if the Caddy container exits.
    if ! docker ps --format '{{.Names}}' | grep -qx "$CADDY_CONTAINER"; then
      echo "   ❌ Caddy container exited"
      docker logs --tail 30 "$CADDY_CONTAINER" 2>&1 | sed 's/^/      /'
      return 1
    fi
    printf "."
  done
  echo ""

  echo ""
  echo "==============================================="
  if [ "$ok" = "1" ]; then
    echo "  ✅ Domain configuration complete"
    echo "==============================================="
    echo "  Panel URL: $url"
  else
    echo "  ⚠️  Certificate is not ready yet"
    echo "==============================================="
    echo "  Caddy is running. Certificate issuance may still be in progress and can take a few minutes."
    echo "  Follow progress: docker logs -f $CADDY_CONTAINER"
    echo "  Check port 80 connectivity, DNS records and cloud firewall/security group rules."
  fi
  echo "  The existing http://$server_ip:$(get_frontend_port) remains available as a fallback URL"
  echo ""
  echo "  ⚠️  Subscription URLs will use $url/...,"
  echo "     Ask users to refresh any existing IP-based subscription URLs."
  echo "==============================================="
}

# Confirm removal, then use the panel purge routine.
uninstall_panel() {
  echo "🗑️ Starting panel removal..."
  read -p "Uninstall? All Librelay containers, images, data volumes and configuration will be removed (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ Uninstall cancelled"
    return 0
  fi
  purge_panel
  echo "✅ Uninstall complete"
}

# Backup integrity and migration restore helpers.
# Server migration requires both a usable export and a safe restore.
# A nonempty file alone does not prove an export completed.

# Verify backup completeness.
# A successful mysqldump ends with a Dump completed marker.
# OOM, disk exhaustion or a restart can leave a nonempty partial dump.
# Verify the backup before decommissioning the old server.
# Never report a partial backup as migration-ready.
_verify_sql_dump() {
  local f="$1"
  [[ -s "$f" ]] || { echo "❌ Backup file is empty"; return 1; }
  if ! tail -c 2000 "$f" | grep -q -- "-- Dump completed"; then
    echo "❌ Backup is incomplete: mysqldump completion marker is missing"
    echo "   The export may have been interrupted by a full disk, insufficient memory or a container restart."
    echo "   Do not use this file for migration. Resolve the resource issue and export again."
    return 1
  fi
  return 0
}

# Prefer container database settings, falling back to .env.
_load_db_cfg() {
  if docker ps --format "{{.Names}}" | grep -qx "$BACKEND_CONTAINER"; then
    local info
    info=$(docker exec "$BACKEND_CONTAINER" env 2>/dev/null | grep "^DB_" || echo "")
    DB_NAME=$(echo "$info" | grep "^DB_NAME=" | cut -d'=' -f2)
    DB_USER=$(echo "$info" | grep "^DB_USER=" | cut -d'=' -f2)
    DB_PASSWORD=$(echo "$info" | grep "^DB_PASSWORD=" | cut -d'=' -f2)
  fi
  if [[ -z "$DB_NAME" || -z "$DB_USER" || -z "$DB_PASSWORD" ]] && [[ -f ".env" ]]; then
    DB_NAME=$(grep "^DB_NAME=" .env | cut -d'=' -f2 2>/dev/null)
    DB_USER=$(grep "^DB_USER=" .env | cut -d'=' -f2 2>/dev/null)
    DB_PASSWORD=$(grep "^DB_PASSWORD=" .env | cut -d'=' -f2 2>/dev/null)
  fi
  [[ -n "$DB_NAME" && -n "$DB_USER" && -n "$DB_PASSWORD" ]]
}

# Choose one working account before consuming restore input.
# A failed restore may already have consumed part of stdin.
# Retrying another account on the same stream could silently restore only the tail.
_pick_mysql_user() {
  if docker exec "$MYSQL_CONTAINER" mysql -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
    MYSQL_AS="$DB_USER"
  elif docker exec "$MYSQL_CONTAINER" mysql -u root -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
    MYSQL_AS="root"
  else
    echo "❌ Cannot connect to the database with either the application or root account. Check the credentials."
    return 1
  fi
  return 0
}

# Execute SQL without printing it; load configuration and select the account first.
_sql_exec() {
  docker exec "$MYSQL_CONTAINER" mysql --default-character-set=utf8mb4 \
    -u "$MYSQL_AS" -p"$DB_PASSWORD" "$DB_NAME" -e "$1" 2>/dev/null
}
# Read one scalar value and remove carriage returns for reliable comparison.
_sql_scalar() {
  docker exec "$MYSQL_CONTAINER" mysql --default-character-set=utf8mb4 \
    -u "$MYSQL_AS" -p"$DB_PASSWORD" "$DB_NAME" -N -B -e "$1" 2>/dev/null | tr -d '\r' | head -1
}

# Restore can overwrite data; require the guards below.
restore_migration_sql() {
  local file="$1" force="$2"

  if [[ -z "$file" ]]; then
    echo "Usage: librelay restore <backup.sql> [--force]"
    echo "  Create the backup with librelay export. --force is required to overwrite an existing database."
    return 1
  fi
  [[ -f "$file" ]] || { echo "❌ File not found: $file"; return 1; }

  echo "🔍 Verifying backup integrity..."
  _verify_sql_dump "$file" || return 1
  echo "✅ Backup integrity verified"

  if ! docker ps --format "{{.Names}}" | grep -qx "$MYSQL_CONTAINER"; then
    echo "❌ Database container is not running. Install the panel on this server (librelay install) before restoring."
    return 1
  fi
  _load_db_cfg || { echo "❌ Database configuration could not be read from either the container or .env"; return 1; }
  _pick_mysql_user || return 1
  echo "📋 Target database: $DB_NAME (using $MYSQL_AS to connect)"

  # Guard: refuse to overwrite a nonempty database without --force.
  # A fresh installation has initial tables too; explicit confirmation is required.
  local cnt
  cnt=$(docker exec "$MYSQL_CONTAINER" mysql -u "$MYSQL_AS" -p"$DB_PASSWORD" -N -B \
        -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'" 2>/dev/null | tr -d '\r')
  if [[ "${cnt:-0}" -gt 0 && "$force" != "--force" ]]; then
    echo ""
    echo "⚠️  Target database $DB_NAME already contains $cnt tables. Restoring will OVERWRITE them."
    echo "   A fresh installation normally contains initial tables. Confirm that this server"
    echo "   has no data you need to keep, then rerun with --force:"
    echo ""
    echo "     librelay restore $file --force"
    echo ""
    return 1
  fi

  # Guard: export the current database before restoring another backup.
  # A failed safety export is tolerated for an empty database.
  if [[ "${cnt:-0}" -gt 0 ]]; then
    local safety="before_restore_$(date +%Y%m%d_%H%M%S).sql"
    echo "💾 Saving current data to $safety(for recovery if needed)..."
    if docker exec "$MYSQL_CONTAINER" mysqldump --default-character-set=utf8mb4 -u "$MYSQL_AS" -p"$DB_PASSWORD" \
         --single-transaction --routines --triggers "$DB_NAME" > "$safety" 2>/dev/null \
       && _verify_sql_dump "$safety" >/dev/null 2>&1; then
      echo "✅ Saved:$(pwd)/$safety"
    else
      rm -f "$safety"
      echo "⚠️  Could not save current data (the database may be empty). Continuing restore."
    fi
  fi

  # The backup contains the previous server address in vite_config.ip.
  # Restoring it replaces the address detected on this server.
  # Remember the current address so the mismatch can be reported afterward.
  local addr_new
  addr_new=$(_sql_scalar "SELECT value FROM vite_config WHERE name='ip' LIMIT 1")

  # Stop the backend before importing to avoid reads of partially restored data.
  echo "⏸  Stopping backend..."
  docker stop "$BACKEND_CONTAINER" >/dev/null 2>&1 || true

  echo "⏳ Restoring..."
  local rc=0
  docker exec -i "$MYSQL_CONTAINER" mysql --default-character-set=utf8mb4 -u "$MYSQL_AS" -p"$DB_PASSWORD" "$DB_NAME" < "$file" 2>/dev/null || rc=$?

  # Nodes must reconnect before being marked online.
  # WebSocket connection callbacks normally set node.status to 1 or 0.
  # The old server backup can contain status=1 for connected nodes.
  # The new server has never seen those connections, so no disconnect event resets them.
  # Without resetting status, the UI would incorrectly show those nodes online.
  # An apparently online node may have no current device information.
  # CPU, memory, uptime and traffic updates require an active WebSocket.
  # Mark nodes offline until a real connection is established.
  if [[ $rc -eq 0 ]]; then
    _sql_exec "UPDATE node SET status=0;" >/dev/null 2>&1 || true
  fi

  echo "▶️  Restarting backend..."
  docker start "$BACKEND_CONTAINER" >/dev/null 2>&1 || true

  if [[ $rc -ne 0 ]]; then
    echo "❌ Restore failed (mysql exit code $rc)"
    echo "   The database may be partially restored. Recover using the before_restore_*.sql backup above:"
    echo "     librelay restore before_restore_xxx.sql --force"
    return 1
  fi

  echo ""
  echo "✅ Restore complete"
  echo "   All nodes are marked offline until they reconnect to this panel."
  echo "   ⏳ Allow a minute or two for reconnection. If nodes stay offline, see item 1 below."

  # Restoring can replace this server address with the old panel address.
  # Generated installation commands use that address, so report any mismatch.
  local addr_now
  addr_now=$(_sql_scalar "SELECT value FROM vite_config WHERE name='ip' LIMIT 1")
  if [[ -n "$addr_new" && -n "$addr_now" && "$addr_new" != "$addr_now" ]]; then
    echo ""
    echo "⚠️  The backup replaced the panel address with its previous value:"
    echo "      Detected on this server during installation:$addr_new"
    echo "      Restored from backup (currently active):$addr_now"
    echo "   Generated node installation commands use the currently active address."
    echo "   · Keeping the same domain with DNS pointing here: no change needed"
    echo "   · Using a new address: change Website Settings to $addr_new or your new domain,"
    echo "     otherwise newly installed nodes will connect to the old server and remain offline here."
  fi

  echo ""
  echo "⚠️  When migrating servers, also check:"
  echo "   1. Existing nodes still use the old address. Keeping the same domain and updating DNS lets them reconnect;"
  echo "      otherwise update the panel address on each node. Also check this server's firewall/security group"
  echo "      allows the panel API port. New VPS firewall rules may prevent node connections."
  echo "   2. Users' subscription URLs contain the old panel address and may stop working."
  echo "      Keep the same domain (librelay domain panel.example.com), or distribute new subscription URLs."
  return 0
}

# Default to installation; arguments select management actions.
# ./panel_install.sh            Install without opening the menu.
# ./panel_install.sh update     Update.
# ./panel_install.sh uninstall  Uninstall.
# ./panel_install.sh menu       Interactive menu.
main() {
  local command=install
  local args=()
  if [[ "${1:-}" != -* && $# -gt 0 ]]; then command="$1"; shift; fi
  while [ $# -gt 0 ]; do
    case "$1" in
      --source) LIBRELAY_PANEL_SOURCE=1; SOURCE_REQUESTED=1; shift ;;
      --port|-p) [ $# -ge 2 ] || { echo "Missing port." >&2; exit 1; }; FRONTEND_PORT="$2"; PORT_REQUESTED=1; valid_port "$FRONTEND_PORT" || { echo "Invalid panel port: $FRONTEND_PORT" >&2; exit 1; }; shift 2 ;;
      --https-port) [ $# -ge 2 ] || { echo "Missing HTTPS port." >&2; exit 1; }; INSTALL_HTTPS_PORT="$2"; valid_port "$INSTALL_HTTPS_PORT" || { echo "Invalid HTTPS port" >&2; exit 1; }; INSTALL_HTTPS_PORT=$((10#$INSTALL_HTTPS_PORT)); [ "$INSTALL_HTTPS_PORT" != 80 ] && [ "$INSTALL_HTTPS_PORT" != 2019 ] || { echo "HTTPS port conflicts with Caddy HTTP/admin listener" >&2; exit 1; }; shift 2 ;;
      --domain) [ $# -ge 2 ] || { echo "Missing domain." >&2; exit 1; }; INSTALL_DOMAIN="$2"; shift 2 ;;
      --install-dir) [ $# -ge 2 ] || { echo "Missing install directory." >&2; exit 1; }; INSTALL_DIR="$2"; INSTALL_DIR_EXPLICIT=1; shift 2 ;;
      --help|-h) echo "Usage: panel_install.sh [install|update|status|info|domain DOMAIN] [--source] [--port PORT|-p PORT] [--domain DOMAIN] [--https-port PORT] [--install-dir /opt/librelay]"; return ;;
      -*) echo "Unknown option: $1" >&2; exit 1 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  [[ "$GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Invalid GITHUB_REPO" >&2; exit 1; }
  [[ "$GITHUB_REF" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Invalid GITHUB_REF" >&2; exit 1; }
  [[ "$INSTALL_DIR" =~ ^/[A-Za-z0-9_./-]+$ && "$INSTALL_DIR" != / ]] || { echo "Invalid install directory" >&2; exit 1; }
  if [ -n "$INSTALL_DOMAIN" ]; then
    [[ "$INSTALL_DOMAIN" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$ ]] || { echo "Invalid domain" >&2; exit 1; }
  fi
  if [ -n "$INSTALL_HTTPS_PORT" ] && [ "$command" != domain ] && { [ "$command" != install ] || [ -z "$INSTALL_DOMAIN" ]; }; then
    echo "--https-port requires domain DOMAIN, or --domain during install." >&2; exit 1
  fi
  [[ "$LIBRELAY_PANEL_SOURCE" = 0 || "$LIBRELAY_PANEL_SOURCE" = 1 ]] || { echo "LIBRELAY_PANEL_SOURCE must be 0 or 1" >&2; exit 1; }
  if [ "$SOURCE_REQUESTED" = 1 ] && [ "$command" != install ] && [ "$command" != update ]; then
    echo "--source applies only to install/update." >&2; exit 1
  fi
  prepare_host
  if [ "$INSTALL_DIR_EXPLICIT" = 0 ] && [ ! -f .env ] && [ "$command" != install ]; then
    local saved_dir="${LIBRELAY_DIR:-${TMS_DIR:-}}" launcher
    for launcher in /usr/local/bin/librelay /usr/local/bin/tms; do
      [ -n "$saved_dir" ] || [ ! -f "$launcher" ] || saved_dir=$(sed -n 's/^\(LIBRELAY_DIR\|TMS_DIR\)="\([^" ]*\)"$/\2/p' "$launcher" | head -1)
    done
    if [ -n "$saved_dir" ] && [ -f "$saved_dir/.env" ]; then INSTALL_DIR="$saved_dir"
    elif [ -f /opt/librelay/.env ]; then INSTALL_DIR=/opt/librelay
    elif [ -f /opt/tms/.env ]; then INSTALL_DIR=/opt/tms; fi
  fi
  # Management launcher already enters the saved directory. Standalone commands may reuse cwd.
  if [ "$INSTALL_DIR_EXPLICIT" = 1 ] || [ ! -f .env ]; then mkdir -p "$INSTALL_DIR"; cd "$INSTALL_DIR"; fi
  if [ "$command" = update ]; then migrate_repository_identity || return 1; fi
  load_deployment_layout || return 1
  if [ -f .env ]; then
    saved_repo=$(sed -n 's/^GITHUB_REPO=//p' .env | head -1)
    saved_ref=$(sed -n 's/^GITHUB_REF=//p' .env | head -1)
    if [ -n "$saved_repo" ]; then
      [[ "$saved_repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Invalid repository in .env" >&2; exit 1; }
      GITHUB_REPO="$saved_repo"
    fi
    if [ -n "$saved_ref" ]; then
      [[ "$saved_ref" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Invalid ref in .env" >&2; exit 1; }
      GITHUB_REF="$saved_ref"
    fi
    PANEL_INSTALL_RAW_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/panel_install.sh"
  fi
  if [ "$PORT_REQUESTED" = 1 ] && [ "$command" != install ]; then
    echo "--port applies to new installations. Change FRONTEND_PORT in the existing .env, then run librelay update." >&2
    exit 1
  fi
  set -- "$command" ${args[@]+"${args[@]}"}
  case "$command" in
    install)   install_panel ;;
    update)    update_panel ;;
    uninstall) uninstall_panel ;;
    purge)     purge_panel ;;
    export)    export_migration_sql ;;
    # Migration: export on the old server, copy the SQL, then restore on the new server.
    # Keep the script available for a guarded restore retry with --force.
    restore)   restore_migration_sql "$2" "$3" ;;
    status)    show_status ;;
    info)      show_access_info ;;
    domain)    setup_domain "${2:-}" "${INSTALL_HTTPS_PORT:-${3:-}}" ;;
    menu)      menu_loop ;;
    *)
      # Reject unknown commands instead of silently starting an installation.
      # A typo must not overwrite a running panel; no arguments still means install.
      echo "❌ Unknown command: $1"
      echo "Available commands: install / update / uninstall / purge / export / restore / status / info / domain / menu"
      exit 1
      ;;
  esac
}

# Interactive menu used by the persistent librelay launcher.
menu_loop() {
  while true; do
    show_menu
    read -p "Select an option: " choice

    case $choice in
      1) install_panel; break ;;
      2) update_panel; break ;;
      3) uninstall_panel; break ;;
      4) purge_panel; break ;;
      5) show_status ;;
      6) show_access_info ;;
      7) export_migration_sql ;;
      9) read -rp "Backup file path: " _f; restore_migration_sql "$_f" ;;
      8)
        show_domain_status
        echo ""
        read -p "Domain (Enter to cancel, off to disable): " d
        [ -n "$d" ] && setup_domain "$d"
        ;;
      0) echo "👋 Exit"; break ;;
      *) echo "❌ Invalid option. Try again." ;;
    esac
    echo ""
  done
}

# Execute the entry point.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
