#!/usr/bin/env bash
set -euo pipefail
export GITHUB_REPO=example/tms GITHUB_REF=main
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
source "$repo_dir/panel_install.sh"
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
cd "$workspace"
CADDY_FILE="$workspace/Caddyfile"
printf 'FRONTEND_PORT=8080\nBACKEND_PORT=6365\n' > .env
get_server_ip() { echo 192.0.2.1; }
resolve_a_record() { echo 192.0.2.1; }
sleep() { :; }
curl() { printf '%s\n' "$*" >> "$workspace/curls"; }
docker() {
  case "$1" in
    ps) printf 'vite-frontend\ntms-caddy\n' ;;
    port) printf '80/tcp -> 0.0.0.0:80\n443/tcp -> 0.0.0.0:443\n' ;;
    run)
      printf '%s\n' "$*" >> "$workspace/docker-runs"
      if [ "${fixture_fail_start:-0}" = 1 ] && [[ "$*" = *'-p 2095:2095'* ]]; then return 1; fi ;;
    rm) : ;;
    *) echo "Unexpected Docker operation: $*" >&2; return 1 ;;
  esac
}
# A Reality listener already occupies 443; it must not block Caddy HTTPS 2095.
port_in_use() { [ "$1" = 443 ]; }
setup_domain panel.example.com 2095 > "$workspace/output"
[ "$(current_domain)" = panel.example.com ]
[ "$(current_https_port)" = 2095 ]
[ "$(current_https_url)" = https://panel.example.com:2095 ]
grep -q 'disable_tlsalpn_challenge' "$CADDY_FILE"
grep -q -- '-p 2095:2095' "$workspace/docker-runs"
if grep -q -- '-p 443:443' "$workspace/docker-runs"; then echo 'Claimed Reality port'; exit 1; fi
grep -q 'https://panel.example.com:2095/' "$workspace/curls"
# Reapplying the same domain retains its selected HTTPS port.
setup_domain panel.example.com > /dev/null
[ "$(current_https_port)" = 2095 ]
cp "$CADDY_FILE" expected
if setup_domain panel.example.com 65536 >/dev/null 2>&1; then exit 1; fi
cmp expected "$CADDY_FILE"
printf 'FRONTEND_PORT=2095\nBACKEND_PORT=6365\n' > .env
if setup_domain panel.example.com 2095 >/dev/null 2>&1; then echo 'Accepted frontend collision'; exit 1; fi
cmp expected "$CADDY_FILE"
# Any occupied port from a different Docker service also causes a hard failure.
printf 'FRONTEND_PORT=8080\nBACKEND_PORT=6365\n' > .env
port_in_use() { [ "$1" = 2095 ]; }
if setup_domain panel.example.com 2095 >/dev/null 2>&1; then exit 1; fi
cmp expected "$CADDY_FILE"
# A failed new container restores the prior configuration and binding.
port_in_use() { return 1; }
write_caddy_config panel.example.com 443 "$CADDY_FILE"
cp "$CADDY_FILE" expected
fixture_fail_start=1
if setup_domain panel.example.com 2095 >/dev/null 2>&1; then echo 'Ignored Caddy startup failure'; exit 1; fi
cmp expected "$CADDY_FILE"
[ "$(current_https_port)" = 443 ]
fixture_fail_start=0
# Legacy files without an explicit port still mean HTTPS 443.
printf 'panel.example.com {\n}\n' > "$CADDY_FILE"
[ "$(current_https_url)" = https://panel.example.com ]
# Capture configs for real Caddy validation/runtime checks in CI.
if [ -n "${TMS_CADDY_FIXTURE_DIR:-}" ]; then
  mkdir -p "$TMS_CADDY_FIXTURE_DIR"
  write_caddy_config panel.example.test 2095 "$TMS_CADDY_FIXTURE_DIR/Caddyfile"
fi
prepare_host() { :; }
setup_domain() { printf '%s %s\n' "$1" "$2"; }
output=$(main domain panel.example.com --https-port 2095)
[ "$output" = 'panel.example.com 2095' ]
if (main domain panel.example.com --https-port 65536) >/dev/null 2>&1; then exit 1; fi
printf 'Domain regression checks passed\n'
