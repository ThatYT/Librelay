#!/bin/bash

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

# 获取系统架构
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
FORCE_CN=0                                       # -c 强制走国内 GitHub 镜像(国内机器 ipinfo 常超时/失败)
GH_MIRROR="${GH_MIRROR:-https://ghfast.top/}"    # 国内 GitHub 加速镜像,可用环境变量覆盖



# 显示菜单
show_menu() {
  echo "==============================================="
  echo "              管理脚本"
  echo "==============================================="
  echo "请选择操作："
  echo "1. 安装"
  echo "2. 更新"  
  echo "3. 卸载"
  echo "4. 退出"
  echo "==============================================="
}

# 删除脚本自身
delete_self() {
  echo ""
  echo "🗑️ 操作已完成，正在清理脚本文件..."
  SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
  sleep 1
  rm -f "$SCRIPT_PATH" && echo "✅ 脚本文件已删除" || echo "❌ 删除脚本文件失败"
}

# 检查并安装 tcpkill
check_and_install_tcpkill() {
  # 检查 tcpkill 是否已安装
  if command -v tcpkill &> /dev/null; then
    return 0
  fi
  
  # 检测操作系统类型
  OS_TYPE=$(uname -s)
  
  # 检查是否需要 sudo
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
  
  # 检测 Linux 发行版并安装对应的包
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


# 获取用户输入的配置参数
get_config_params() {
  if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
    echo "请输入配置参数："
    
    if [[ -z "$SERVER_ADDR" ]]; then
      read -p "服务器地址: " SERVER_ADDR
    fi
    
    if [[ -z "$SECRET" ]]; then
      read -p "密钥: " SECRET
    fi
    
    if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
      echo "❌ 参数不完整，操作取消。"
      exit 1
    fi
  fi
}

# 安装功能
install_gost() {
  echo "🚀 开始安装 GOST..."
  get_config_params

    # 检查并安装 tcpkill
  check_and_install_tcpkill
  

  mkdir -p "$INSTALL_DIR"

  # Build/download first; a failed download never removes the existing executable or settings.
  download_agent "$INSTALL_DIR/gost.new" || { echo "Node build/download failed; existing installation preserved." >&2; return 1; }
  systemctl stop gost 2>/dev/null || true
  mv "$INSTALL_DIR/gost.new" "$INSTALL_DIR/gost"
  chmod +x "$INSTALL_DIR/gost"

  # 打印版本
  echo "🔎 gost 版本：$($INSTALL_DIR/gost -V)"

  # 写入 config.json (安装时总是创建新的)
  CONFIG_FILE="$INSTALL_DIR/config.json"
  echo "📄 创建新配置: config.json"
  umask 077
  if [ -f "$CONFIG_FILE" ]; then
    jq --arg addr "$SERVER_ADDR" --arg secret "$SECRET" '.addr=$addr | .secret=$secret' "$CONFIG_FILE" > "$CONFIG_FILE.new" || return 1
  else
    jq -n --arg addr "$SERVER_ADDR" --arg secret "$SECRET" '{addr:$addr,secret:$secret}' > "$CONFIG_FILE.new" || return 1
  fi
  mv "$CONFIG_FILE.new" "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  printf '%s\n' "GITHUB_REPO=$GITHUB_REPO" "GITHUB_REF=$GITHUB_REF" > "$INSTALL_DIR/repository.conf"


  # 写入 gost.json
  GOST_CONFIG="$INSTALL_DIR/gost.json"
  if [[ -f "$GOST_CONFIG" ]]; then
    echo "⏭️ 跳过配置文件: gost.json (已存在)"
  else
    echo "📄 创建新配置: gost.json"
    cat > "$GOST_CONFIG" <<EOF
{}
EOF
  fi

  # 加强权限
  chmod 600 "$INSTALL_DIR"/*.json

  # 创建 systemd 服务
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

  # 启动服务
  systemctl daemon-reload
  systemctl enable gost
  systemctl start gost

  # 检查状态
  echo "🔄 检查服务状态..."
  if systemctl is-active --quiet gost; then
    echo "✅ 安装完成，gost服务已启动并设置为开机启动。"
    echo "📁 配置目录: $INSTALL_DIR"
    echo "🔧 服务状态: $(systemctl is-active gost)"
  else
    echo "❌ gost服务启动失败，请执行以下命令查看日志："
    echo "journalctl -u gost -f"
    return 1
  fi
}

# 更新功能
update_gost() {
  echo "🔄 开始更新 GOST..."
  
  if [[ ! -d "$INSTALL_DIR" ]]; then
    echo "❌ GOST 未安装，请先选择安装。"
    return 1
  fi
  
  echo "📥 下载当前仓库对应版本的节点代理..."
  
  # 检查并安装 tcpkill
  check_and_install_tcpkill
  
  # 先下载新版本
  echo "⬇️ 下载最新版本..."
  download_agent "$INSTALL_DIR/gost.new" || { echo "Node build/download failed; old executable retained." >&2; return 1; }
  if [[ ! -f "$INSTALL_DIR/gost.new" || ! -s "$INSTALL_DIR/gost.new" ]]; then
    echo "❌ 下载失败。"
    return 1
  fi

  # 停止服务
  if systemctl list-units --full -all | grep -Fq "gost.service"; then
    echo "🛑 停止 gost 服务..."
    systemctl stop gost
  fi

  # 替换文件
  mv "$INSTALL_DIR/gost.new" "$INSTALL_DIR/gost"
  chmod +x "$INSTALL_DIR/gost"
  
  # 打印版本
  echo "🔎 新版本：$($INSTALL_DIR/gost -V)"

  # 重启服务
  echo "🔄 重启服务..."
  systemctl start gost || return 1
  
  echo "✅ 更新完成，服务已重新启动。"
}

# 卸载功能
uninstall_gost() {
  echo "🗑️ 开始卸载 GOST..."
  
  read -p "确认卸载 GOST 吗？此操作将删除所有相关文件 (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ 取消卸载"
    return 0
  fi

  # 停止并禁用服务
  if systemctl list-units --full -all | grep -Fq "gost.service"; then
    echo "🛑 停止并禁用服务..."
    systemctl stop gost 2>/dev/null
    systemctl disable gost 2>/dev/null
  fi

  # 协议功能会在本机装 sing-box(服务文件在 /etc/systemd/system,不在安装目录里),
  # 不一起清掉的话:二进制被删、服务还注册着 → systemd 会一直重启失败刷日志
  if systemctl list-units --full -all | grep -Fq "sing-box.service"; then
    echo "🛑 停止并禁用 sing-box 服务..."
    systemctl stop sing-box 2>/dev/null
    systemctl disable sing-box 2>/dev/null
  fi

  # 删除服务文件
  if [[ -f "/etc/systemd/system/gost.service" ]]; then
    rm -f "/etc/systemd/system/gost.service"
    echo "🧹 删除服务文件"
  fi
  if [[ -f "/etc/systemd/system/sing-box.service" ]]; then
    rm -f "/etc/systemd/system/sing-box.service"
    echo "🧹 删除 sing-box 服务文件"
  fi
  # sing-box 的 systemd 覆盖配置(排查重启限流时可能加过)
  rm -rf /etc/systemd/system/sing-box.service.d 2>/dev/null

  # target 的 .wants 里残留的软链接。正常情况 systemctl disable 会删掉,
  # 但服务本身已经异常、或当初是手工 enable 的话就会留下来 ——
  # 结果是 systemctl list-units --all 里一直挂着一条 not-found,看着像没卸干净
  find /etc/systemd /run/systemd \( -name 'gost.service' -o -name 'sing-box.service' \) -delete 2>/dev/null

  # 删除安装目录(gost 二进制、sing-box 二进制、配置、自签证书都在这里)
  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    echo "🧹 删除安装目录: $INSTALL_DIR"
  fi

  # 重载 systemd 并清掉 failed 记录
  systemctl daemon-reload
  systemctl reset-failed 2>/dev/null

  echo "✅ 卸载完成(gost + sing-box + 配置 + 证书 已全部清除)"
}

# 主逻辑
main() {
  # 如果提供了命令行参数，直接执行安装
  if [[ -n "$SERVER_ADDR" && -n "$SECRET" ]]; then
    install_gost
    exit $?
  fi

  # 显示交互式菜单
  while true; do
    show_menu
    read -p "请输入选项 (1-5): " choice
    
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
      4)
        block_protocol
            exit 0
        ;;
      5)
        echo "👋 退出脚本"
            exit 0
        ;;
      *)
        echo "❌ 无效选项，请输入 1-5"
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
