#!/bin/bash
# ============================================================
# Librelay management command for manual source/hybrid deployments.
#
# Use with a git checkout and docker-compose-hybrid.yml local build.
# panel_install.sh uses prebuilt images by default; --source opts into compilation.
#
# Install: bash tms-hybrid.sh install from the panel directory.
# Then run librelay to open the menu.
#        librelay update / status / logs / restart / stop / start
# ============================================================
export LC_ALL=C
set -o pipefail

PANEL_DIR="${TMS_DIR:-$(pwd)}"
COMPOSE_FILE="docker-compose-hybrid.yml"
BRANCH="${TMS_BRANCH:-main}"

# Allow purge even if the saved panel directory was deleted or renamed.
# Other commands require need_panel to prevent operations in the wrong directory.
cd "$PANEL_DIR" 2>/dev/null || echo "⚠️  Panel directory not found: $PANEL_DIR (only purge remains available)"

dc() { docker compose -f "$COMPOSE_FILE" --env-file .env "$@"; }

need_panel() {
  if [ ! -f "$PANEL_DIR/$COMPOSE_FILE" ]; then
    echo "❌ Not a panel directory (missing $COMPOSE_FILE): $PANEL_DIR"
    echo "   Enter the panel directory first, or set TMS_DIR=/path/to/panel"
    exit 1
  fi
}

cmd_update() {
  need_panel
  echo "⬇️  Fetching the latest source (branch $BRANCH)..."
  if [ -d .git ]; then
    git fetch --depth 1 origin "$BRANCH" && git reset --hard "origin/$BRANCH" || {
      echo "❌ Source fetch failed. Check network connectivity and Git configuration."; exit 1; }
  else
    echo "⚠️  This directory is not a Git repository. Skipping source fetch and rebuilding only."
  fi
  echo "🔧 Rebuilding and starting the panel (frontend/backend compilation may take several minutes)..."
  dc up -d --build || { echo "❌ Build failed"; exit 1; }
  echo "✅ Update complete"
  cmd_status
}

# Purge containers, locally built images, data volumes, networks and commands.
# Do not require a complete panel directory for removal.
# An incomplete installation must still be removable.
cmd_purge() {
  echo "🧨 Purging Librelay (source/hybrid deployment)"
  echo "   This removes containers, locally built images, data volumes (INCLUDING DATABASE DATA), networks and the librelay command"
  read -rp "Continue? (y/N): " c
  if [ "$c" != "y" ] && [ "$c" != "Y" ]; then
    echo "❌ Cancelled"
    return 0
  fi

  if [ -f "$PANEL_DIR/$COMPOSE_FILE" ]; then
    dc down -v --rmi local --remove-orphans 2>/dev/null || true
  fi

  # Fallback to known container names when Compose configuration is missing.
  docker rm -f gost-mysql springboot-backend vite-frontend tms-caddy 2>/dev/null || true

  # Compose may prefix volumes with the directory/project name.
  # Match suffixes to include prefixed MySQL volumes.
  docker volume ls -q 2>/dev/null     | grep -E '(^|_)(mysql_data|backend_logs|tms_caddy_data|tms_caddy_config)$'     | xargs -r docker volume rm 2>/dev/null || true

  docker network ls -q --filter name=gost-network 2>/dev/null | xargs -r docker network rm 2>/dev/null || true
  docker image prune -f 2>/dev/null || true

  rm -f /usr/local/bin/librelay /usr/local/bin/tms 2>/dev/null || true

  echo "✅ Panel purge complete."
  echo "ℹ️  Source directory retained:$PANEL_DIR(remove it manually only if no longer needed)"
  echo "ℹ️  A local node agent (gost / sing-box) must be uninstalled separately; see README."
}

cmd_status() {
  echo "📊 Container status:"
  docker ps -a --filter "name=gost-mysql" --filter "name=springboot-backend" --filter "name=vite-frontend" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker ps -a
  echo ""
  echo "📁 Panel directory: $PANEL_DIR"
  if [ -f .env ]; then
    local port
    port="$(grep -E '^FRONTEND_PORT=' .env 2>/dev/null | cut -d= -f2)"
    port=${port:-2095}
    echo "🌐 Panel URL: http://$(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo SERVER_IP):$port"
  fi
}

cmd_logs() {
  need_panel
  echo "📜 Logs (Ctrl+C to exit)..."
  dc logs -f --tail=100 "${1:-}"
}

cmd_restart() { need_panel; dc restart; echo "✅ Restarted"; cmd_status; }
cmd_stop()    { need_panel; dc stop;    echo "⏹️  Stopped"; }
cmd_start()   { need_panel; dc up -d;   echo "▶️  Started"; cmd_status; }

# Install this script as the persistent librelay command.
cmd_install() {
  need_panel
  local self
  self="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
  cp -f "$self" /usr/local/bin/tms-hybrid.sh || { echo "❌ Copy failed (root required)"; exit 1; }
  chmod +x /usr/local/bin/tms-hybrid.sh
  cat > /usr/local/bin/tms <<EOF
#!/bin/bash
# Librelay source deployment management. Run librelay to open the menu.
export TMS_DIR="$PANEL_DIR"
exec bash /usr/local/bin/tms-hybrid.sh "\${1:-menu}"
EOF
  chmod +x /usr/local/bin/tms
  cp -f /usr/local/bin/tms /usr/local/bin/librelay
  chmod +x /usr/local/bin/librelay
  # Remove the obsolete flux launcher that points to the previous directory.
  rm -f /usr/local/bin/flux /usr/local/bin/flux-panel.sh 2>/dev/null
  echo "✅ Management command installed. Run librelay from any directory."
  echo "   Saved panel directory: $PANEL_DIR"
}

cmd_menu() {
  while true; do
    echo ""
    echo "=============================="
    echo "     Librelay Panel Management"
    echo "  Directory: $PANEL_DIR"
    echo "=============================="
    echo " 1) Update panel (fetch source + rebuild)"
    echo " 2) Show status"
    echo " 3) Show logs"
    echo " 4) Restart"
    echo " 5) Stop"
    echo " 6) Start"
    echo " 7) Purge (remove containers/images/volumes, INCLUDING DATABASE DATA)"
    echo " 0) Exit"
    echo "------------------------------"
    read -rp "Select an option: " choice
    case "$choice" in
      1) cmd_update ;;
      2) cmd_status ;;
      3) cmd_logs ;;
      4) cmd_restart ;;
      5) cmd_stop ;;
      6) cmd_start ;;
      7) cmd_purge ;;
      0) exit 0 ;;
      *) echo "Invalid option" ;;
    esac
  done
}

case "${1:-menu}" in
  install) cmd_install ;;
  update)  cmd_update ;;
  status)  cmd_status ;;
  logs)    shift; cmd_logs "$@" ;;
  restart) cmd_restart ;;
  stop)    cmd_stop ;;
  start)   cmd_start ;;
  purge|uninstall) cmd_purge ;;
  menu|"") cmd_menu ;;
  *) echo "Usage: librelay [menu|update|status|logs|restart|stop|start|purge]" ;;
esac
