#!/usr/bin/env bash
set -euo pipefail
# GitHub Actions supplies GITHUB_REF=refs/heads/main; installer settings use
# a download branch/tag name. Keep these tests independent of the runner's env.
export GITHUB_REPO=example/tms GITHUB_REF=main
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
source "$repo_dir/panel_install.sh"
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
cp .env expected.env
show_access_info() { :; }
check_docker() { echo 'Repeat install attempted Docker mutation'; return 1; }
install_panel
cmp .env expected.env
[ "$(get_frontend_port)" = 6366 ]
printf 'Installer regression checks passed\n'
