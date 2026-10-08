#!/usr/bin/env bash
set -euo pipefail
# GitHub Actions supplies GITHUB_REF=refs/heads/main; installer settings use
# a download branch/tag name. Keep these tests independent of the runner's env.
export GITHUB_REPO=example/tms GITHUB_REF=main
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
source "$repo_dir/panel_install.sh"
# Linux flock is mocked for cross-platform fixture tests.
flock() { :; }
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
cd "$workspace"
for port in 1 443 2095 8080 65535; do valid_port "$port"; done
for port in 0 -1 65536 abc '443;touch /tmp/unwanted' 999999999999; do
  if valid_port "$port"; then echo "Accepted invalid port: $port"; exit 1; fi
done
port_in_use() { return 1; }
unset FRONTEND_PORT BACKEND_PORT
get_config_params </dev/null
[ "$FRONTEND_PORT" = 2095 ] && [ "$BACKEND_PORT" = 6365 ]
FRONTEND_PORT=8080
get_config_params </dev/null
[ "$FRONTEND_PORT" = 8080 ]
if (FRONTEND_PORT=65536; get_config_params </dev/null) >/dev/null 2>&1; then exit 1; fi
if (port_in_use() { return 0; }; FRONTEND_PORT=443; get_config_params </dev/null) >/dev/null 2>&1; then exit 1; fi
prepare_host() { :; }
install_panel() { printf '%s\n' "$FRONTEND_PORT" "$INSTALL_DIR" "$INSTALL_DOMAIN"; }
output=$(main --port 8080 --install-dir "$workspace/install" --domain panel.example.com)
[[ "$output" = "8080"$'\n'"$workspace/install"$'\npanel.example.com' ]]
output=$(main -p 8443 --install-dir "$workspace/custom")
[[ "$output" = "8443"$'\n'"$workspace/custom" ]]
# Restore installer and verify a repeat install cannot overwrite configuration or call Docker.
source "$repo_dir/panel_install.sh"
unset FRONTEND_PORT
printf 'FRONTEND_PORT=6366\nDB_PASSWORD=existing-test-value\n' > .env
chmod 600 .env
cp .env expected.env
show_access_info() { :; }
check_docker() { echo 'Repeat install attempted Docker mutation'; return 1; }
install_panel
cmp .env expected.env
[ "$(get_frontend_port)" = 6366 ]
# A live MySQL server with missing tables must not count as a successful install.
docker() { echo 12; }
verify_database_schema
docker() { echo 0; }
sleep() { :; }
if verify_database_schema >/dev/null 2>&1; then
  echo 'Accepted incomplete database schema'; exit 1
fi
# The login API must return application success, not just HTTP 200.
curl() { printf '%s\n' '{"code":0,"data":0}'; }
backend_api_ready
curl() { printf '%s\n' '{"code":500,"msg":"database unavailable"}'; }
if backend_api_ready; then echo 'Accepted failing login API'; exit 1; fi
curl() { return 7; }
if backend_api_ready; then echo 'Accepted unavailable backend'; exit 1; fi
# Existing images without a Docker HEALTHCHECK can still be API-ready.
curl() { printf '%s\n' '{"code":0,"data":1}'; }
docker() {
  if [[ "$*" = *Health* ]]; then echo not_configured; else echo running; fi
}
wait_backend_ready
curl() { printf '%s\n' '{"code":500}'; }
if wait_backend_ready >/dev/null 2>&1; then echo 'Accepted unready backend'; exit 1; fi
docker() { echo exited; }
if wait_backend_ready >/dev/null 2>&1; then echo 'Accepted exited backend'; exit 1; fi
# Domain and restore must have distinct menu routes; neither fixture touches Docker/data.
show_domain_status() { :; }
setup_domain() { printf 'domain:%s\n' "$1" >> menu-calls; }
restore_migration_sql() { printf 'restore:%s\n' "$1" >> menu-calls; }
menu_loop <<'MENU' > menu-output
8
panel.example.com
9
/path/to/backup.sql
0
MENU
[ "$(cat menu-calls)" = 'domain:panel.example.com'$'\n''restore:/path/to/backup.sql' ]
grep -q 'Configure domain + HTTPS' menu-output
grep -q 'Restore database backup' menu-output
# Both the advertised node exit and its legacy option must exit without running services.
for option in 4 5; do
  output=$(source "$repo_dir/install.sh"; SERVER_ADDR=""; SECRET=""; main <<< "$option")
  [[ "$output" = *'Node Management'* && "$output" = *'Exiting installer'* ]]
done
# Install both CLI names into an isolated directory and verify argument forwarding.
source "$repo_dir/panel_install.sh"
LIBRELAY_COMMAND_DIR="$workspace/bin with spaces"
mkdir -p "$LIBRELAY_COMMAND_DIR"
# Resolve the real installer instead of the test driver when creating launchers.
readlink() { printf '%s\n' "$repo_dir/panel_install.sh"; }
install_librelay_command
unset -f readlink
cmp "$repo_dir/panel_install.sh" "$LIBRELAY_COMMAND_DIR/librelay-panel.sh"
cat > "$LIBRELAY_COMMAND_DIR/librelay-panel.sh" <<'MANAGER'
#!/usr/bin/env bash
printf '%s\n' "$PWD" "$@"
MANAGER
for command in librelay tms; do
  output=$("$LIBRELAY_COMMAND_DIR/$command" domain panel.example.com --https-port 2095)
  [ "$output" = "$workspace"$'\n''domain'$'\n''panel.example.com'$'\n''--https-port'$'\n''2095' ]
  output=$("$LIBRELAY_COMMAND_DIR/$command")
  [ "$output" = "$workspace"$'\n''menu' ]
done
printf 'Installer regression checks passed\n'
