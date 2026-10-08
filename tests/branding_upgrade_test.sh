#!/usr/bin/env bash
set -euo pipefail
export GITHUB_REPO=example/librelay GITHUB_REF=main
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
source "$repo_dir/panel_install.sh"
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
cd "$workspace"
acquire_install_lock() { :; }
# Fresh deployments get branded resources and paths.
load_deployment_layout
[ "$INSTALL_DIR" = /opt/librelay ]
[ "$MYSQL_CONTAINER" = librelay-mysql ]
[ "$MYSQL_VOLUME" = librelay_mysql_data ]
[ "$PANEL_NETWORK" = librelay-network ]
[ "$CADDY_FILE" = /etc/librelay/Caddyfile ]
# Legacy credentials, ports and resource identities survive the repository rename.
printf 'GITHUB_REPO=ThatYT/Tms_EN\nGITHUB_REF=main\nDB_NAME=gost\nDB_USER=gost\nDB_PASSWORD=fixture-only\nJWT_SECRET=fixture-only\nFRONTEND_PORT=6366\nBACKEND_PORT=6365\n' > .env
chmod 600 .env
cp .env original.env
load_deployment_layout
[ "$MYSQL_CONTAINER" = gost-mysql ]
[ "$MYSQL_VOLUME" = mysql_data ]
[ "$PANEL_NETWORK" = gost-network ]
[ "$CADDY_FILE" = /etc/tms/Caddyfile ]
[ "$CADDY_CONTAINER" = tms-caddy ]
[ "$CADDY_DATA" = tms_caddy_data ]
migrate_repository_identity
cmp original.env .env.before-librelay
sed 's~ThatYT/Tms_EN~ThatYT/Librelay~' original.env > expected.env
cmp expected.env .env
migrate_repository_identity
cmp expected.env .env
[ "$(ls -l .env.before-librelay | cut -c1-10)" = '-rw-------' ]
# An unrelated fork must not be silently redirected.
sed 's~ThatYT/Librelay~AnotherOwner/AnotherFork~' .env > other.env
mv other.env .env
cp .env expected.env
migrate_repository_identity
cmp expected.env .env
# New saved layouts persist across refresh/update and reject injected resource names.
printf 'LIBRELAY_LAYOUT=1\nLIBRELAY_MYSQL_VOLUME=custom_database_volume\n' > .env
load_deployment_layout
[ "$MYSQL_CONTAINER" = librelay-mysql ]
[ "$MYSQL_VOLUME" = custom_database_volume ]
[ "$CADDY_FILE" = /etc/librelay/Caddyfile ]
printf 'LIBRELAY_NETWORK=bad;touch injected\n' >> .env
if load_deployment_layout >/dev/null 2>&1; then echo 'Accepted invalid Docker resource name'; exit 1; fi
[ ! -e injected ]
# Old environment flags remain usable by old node installation commands.
rm .env
unset LIBRELAY_NODE_SOURCE LIBRELAY_NODE_BUILD_DIR
export TMS_NODE_SOURCE=1 TMS_NODE_BUILD_DIR="$workspace"
source "$repo_dir/install.sh"
# The download path chooses source explicitly; the fixture never builds or downloads.
check_node_space() { :; }
build_source_agent() { printf fixture > "$1"; printf 'source\n'; }
[ "$(download_agent "$workspace/gost")" = source ]
[ -s "$workspace/gost" ]
printf 'Branding and legacy upgrade regression checks passed\n'
