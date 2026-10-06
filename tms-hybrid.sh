#!/bin/bash
# ============================================================
# TMS 面板管理命令(源码编译版 / hybrid 部署专用)
#
# 适用于:用 git clone + docker-compose-hybrid.yml 本地 build 起来的面板
#         (panel_install.sh 也默认从配置的 GitHub 仓库构建源码)
#
# 安装:  bash tms-hybrid.sh install     (在面板目录里执行,会生成 /usr/local/bin/tms)
# 之后:  tms                            打开菜单
#        tms update / status / logs / restart / stop / start
# ============================================================
set -o pipefail

PANEL_DIR="${TMS_DIR:-$(pwd)}"
COMPOSE_FILE="docker-compose-hybrid.yml"
BRANCH="${TMS_BRANCH:-main}"

# cd 失败不退出:面板目录已被删/改名时,恰恰是最需要能跑 purge 的时候。
# 其余命令由 need_panel 挡住,不会误操作。
cd "$PANEL_DIR" 2>/dev/null || echo "⚠️  面板目录不存在: $PANEL_DIR(仅 purge 仍可执行)"

dc() { docker compose -f "$COMPOSE_FILE" --env-file .env "$@"; }

need_panel() {
  if [ ! -f "$PANEL_DIR/$COMPOSE_FILE" ]; then
    echo "❌ 这里不像面板目录(找不到 $COMPOSE_FILE): $PANEL_DIR"
    echo "   如果面板在别处,先 cd 过去再执行,或设 TMS_DIR=/你的面板目录"
    exit 1
  fi
}

cmd_update() {
  need_panel
  echo "⬇️  拉取最新代码(分支 $BRANCH)..."
  if [ -d .git ]; then
    git fetch --depth 1 origin "$BRANCH" && git reset --hard "origin/$BRANCH" || {
      echo "❌ 拉取失败,检查网络或 git 配置"; exit 1; }
  else
    echo "⚠️  这个目录不是 git 仓库,跳过拉代码(只重建)"
  fi
  echo "🔧 重新构建并启动(前后端会重新编译,几分钟)..."
  dc up -d --build || { echo "❌ 构建失败"; exit 1; }
  echo "✅ 更新完成"
  cmd_status
}

# 彻底清理:容器、本地构建的镜像、数据卷、网络、管理命令 全删。
# 刻意不调 need_panel —— 卸载正是在「面板已经不完整」时最需要能用,
# 再加一道「必须像面板目录」的检查,就成了装坏了反而卸不掉的死锁。
cmd_purge() {
  echo "🧨 彻底清理 TMS 面板(合体 / 源码版)"
  echo "   会删除:容器、本地构建的镜像、数据卷(含数据库数据)、网络、tms 命令"
  read -rp "确认吗? (y/N): " c
  if [ "$c" != "y" ] && [ "$c" != "Y" ]; then
    echo "❌ 已取消"
    return 0
  fi

  if [ -f "$PANEL_DIR/$COMPOSE_FILE" ]; then
    dc down -v --rmi local --remove-orphans 2>/dev/null || true
  fi

  # 兜底:compose 文件丢了也要能清干净,按容器名再来一遍
  docker rm -f gost-mysql springboot-backend vite-frontend tms-caddy 2>/dev/null || true

  # 卷名会被 compose 加上项目名前缀(项目名 = 目录名),写死 mysql_data 删不掉。
  # 按后缀匹配才能把 xxx_mysql_data 这种一并带走。
  docker volume ls -q 2>/dev/null     | grep -E '(^|_)(mysql_data|backend_logs|tms_caddy_data|tms_caddy_config)$'     | xargs -r docker volume rm 2>/dev/null || true

  docker network ls -q --filter name=gost-network 2>/dev/null | xargs -r docker network rm 2>/dev/null || true
  docker image prune -f 2>/dev/null || true

  rm -f /usr/local/bin/tms 2>/dev/null || true

  echo "✅ 面板已清理干净。"
  echo "ℹ️  源码目录保留在:$PANEL_DIR(确认不要了可以自己 rm -rf)"
  echo "ℹ️  本机若也装了节点(gost / sing-box),要单独卸载 —— 见 README。"
}

cmd_status() {
  echo "📊 容器状态:"
  docker ps -a --filter "name=gost-mysql" --filter "name=springboot-backend" --filter "name=vite-frontend" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker ps -a
  echo ""
  echo "📁 面板目录: $PANEL_DIR"
  if [ -f .env ]; then
    local port
    port="$(grep -E '^FRONTEND_PORT=' .env 2>/dev/null | cut -d= -f2)"
    port=${port:-2095}
    echo "🌐 访问地址: http://$(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo 本机IP):$port"
  fi
}

cmd_logs() {
  need_panel
  echo "📜 日志(Ctrl+C 退出)..."
  dc logs -f --tail=100 "${1:-}"
}

cmd_restart() { need_panel; dc restart; echo "✅ 已重启"; cmd_status; }
cmd_stop()    { need_panel; dc stop;    echo "⏹️  已停止"; }
cmd_start()   { need_panel; dc up -d;   echo "▶️  已启动"; cmd_status; }

# 把自己装成常驻命令 tms
cmd_install() {
  need_panel
  local self
  self="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
  cp -f "$self" /usr/local/bin/tms-hybrid.sh || { echo "❌ 复制失败(需要 root)"; exit 1; }
  chmod +x /usr/local/bin/tms-hybrid.sh
  cat > /usr/local/bin/tms <<EOF
#!/bin/bash
# TMS 面板管理命令(源码编译版)。直接输 tms 打开菜单。
export TMS_DIR="$PANEL_DIR"
exec bash /usr/local/bin/tms-hybrid.sh "\${1:-menu}"
EOF
  chmod +x /usr/local/bin/tms
  # 清掉改名前失效的 flux 命令(它里面写死的是旧面板目录)
  rm -f /usr/local/bin/flux /usr/local/bin/flux-panel.sh 2>/dev/null
  echo "✅ 装好了:以后在任何位置输入  tms  即可管理面板"
  echo "   面板目录已记住: $PANEL_DIR"
}

cmd_menu() {
  while true; do
    echo ""
    echo "=============================="
    echo "     TMS 面板管理菜单"
    echo "  目录: $PANEL_DIR"
    echo "=============================="
    echo " 1) 更新面板(拉代码 + 重新构建)"
    echo " 2) 查看运行状态"
    echo " 3) 查看日志"
    echo " 4) 重启"
    echo " 5) 停止"
    echo " 6) 启动"
    echo " 7) 彻底卸载(删容器/镜像/数据卷,含数据库数据)"
    echo " 0) 退出"
    echo "------------------------------"
    read -rp "请选择: " choice
    case "$choice" in
      1) cmd_update ;;
      2) cmd_status ;;
      3) cmd_logs ;;
      4) cmd_restart ;;
      5) cmd_stop ;;
      6) cmd_start ;;
      7) cmd_purge ;;
      0) exit 0 ;;
      *) echo "无效选择" ;;
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
  *) echo "用法: tms [menu|update|status|logs|restart|stop|start|purge]" ;;
esac
