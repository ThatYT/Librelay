#!/usr/bin/env bash
set -euo pipefail
export GITHUB_REPO=example/tms GITHUB_REF=main
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
source "$repo_dir/install.sh"
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
mkdir "$workspace/node"
INSTALL_DIR="$workspace/node"
COUNTRY=US
get_architecture() { echo amd64; }
cat > "$workspace/fixture-agent" <<'AGENT'
#!/bin/sh
echo 'gost fixture agent'
AGENT
fixture_hash=$(sha256sum "$workspace/fixture-agent" | awk '{print $1}')
fixture_revision=0123456789abcdef0123456789abcdef01234567
curl() {
  local url='' output=''
  while [ $# -gt 0 ]; do
    case "$1" in
      -o) output="$2"; shift 2 ;;
      https://*) url="$1"; shift ;;
      *) shift ;;
    esac
  done
  printf '%s\n' "$url" >> "$workspace/urls"
  case "$url" in
    */commits/main) printf '{"sha":"%s"}\n' "$fixture_revision" > "$output" ;;
    */checksums.sha256) printf '%s  gost-amd64\n' "$fixture_hash" > "$output" ;;
    */gost-amd64) cp "$workspace/fixture-agent" "$output" ;;
    *) echo "Unexpected network request: $url" >&2; return 1 ;;
  esac
}
unset LIBRELAY_NODE_RELEASE LIBRELAY_NODE_SOURCE
download_agent "$INSTALL_DIR/gost.new"
cmp "$INSTALL_DIR/gost.new" "$workspace/fixture-agent"
grep -q "/releases/download/node-${fixture_revision}/gost-amd64" "$workspace/urls"
if grep -qE 'codeload|go.dev' "$workspace/urls"; then echo 'Default mode compiled source'; exit 1; fi
# Specific tags use GitHub's correct /releases/download/TAG/asset route.
export LIBRELAY_NODE_RELEASE=gost-v-test
download_agent "$INSTALL_DIR/gost.new"
grep -q '/releases/download/gost-v-test/gost-amd64' "$workspace/urls"
# A corrupt download must not replace an existing executable.
printf 'existing node' > "$INSTALL_DIR/gost"
fixture_hash=$(printf 'different payload' | sha256sum | awk '{print $1}')
if download_agent "$INSTALL_DIR/gost.new"; then echo 'Accepted corrupt binary'; exit 1; fi
[ "$(cat "$INSTALL_DIR/gost")" = 'existing node' ]
if compgen -G "$INSTALL_DIR/.node-download.*" >/dev/null; then echo 'Leaked download staging'; exit 1; fi
# Failed builds/installations must propagate failure rather than exit success.
SERVER_ADDR=fixture SECRET=fixture
install_gost() { return 1; }
if (main); then echo 'Reported failed node install as success'; exit 1; fi
# Source compilation is explicit and disk failures are caught before building.
df() { printf 'Filesystem 1024-blocks Used Available Capacity Mounted\nfixture 100 99 1 99%% /\n'; }
if check_node_space "$workspace" 131072; then echo 'Ignored low disk space'; exit 1; fi
printf 'Node installer regression checks passed\n'

# Detect HTTPS without passing the node secret, while retaining legacy HTTP.
curl() {
  local last="${!#}"
  case "$last" in
    https://secure.example:2095/) return 0 ;;
    https://legacy.example:6365/) return 1 ;;
    http://legacy.example:6365/) printf 200 ;;
    https://broken.example:2095/) return 1 ;;
    http://broken.example:2095/) printf 400 ;;
    *) return 1 ;;
  esac
}
SERVER_ADDR=secure.example:2095
resolve_panel_address
[ "$SERVER_ADDR" = https://secure.example:2095 ]
SERVER_ADDR=legacy.example:6365
resolve_panel_address
[ "$SERVER_ADDR" = http://legacy.example:6365 ]
SERVER_ADDR=https://secure.example:2095
resolve_panel_address
[ "$SERVER_ADDR" = https://secure.example:2095 ]
SERVER_ADDR=broken.example:2095
if resolve_panel_address; then echo 'Accepted mismatched TLS endpoint'; exit 1; fi
SERVER_ADDR='https://user:secret@example.com'
if resolve_panel_address; then echo 'Accepted embedded credentials'; exit 1; fi
printf 'Panel transport detection regression checks passed\n'

printf '{"addr":"secure.example:2095","secret":"fixture","http":7,"services":["preserved"]}' > "$INSTALL_DIR/config.json"
resolve_existing_panel
jq -e '.addr=="https://secure.example:2095" and .secret=="fixture" and .http==7 and .services==["preserved"]' "$INSTALL_DIR/config.json" >/dev/null
printf 'Node endpoint migration preserves existing settings\n'

# Runtime failures stop setup before replacing the running agent.
cat > "$INSTALL_DIR/gost.new" <<'AGENT'
#!/bin/sh
[ "$1" = -prepare-node ] || exit 4
exit "${FIXTURE_RUNTIME_EXIT:-0}"
AGENT
chmod +x "$INSTALL_DIR/gost.new"
prepare_node_runtime
export FIXTURE_RUNTIME_EXIT=1
if prepare_node_runtime; then echo 'Accepted failed runtime preparation'; exit 1; fi
[ ! -f "$INSTALL_DIR/gost.new" ]
[ "$(cat "$INSTALL_DIR/gost")" = 'existing node' ]
unset FIXTURE_RUNTIME_EXIT
# Success requires both services running and enabled at boot.
systemctl() {
  [ "${FIXTURE_FAILED_SERVICE:-}" != "${!#}" ] || return 1
}
verify_node_services
FIXTURE_FAILED_SERVICE=sing-box
if verify_node_services; then echo 'Accepted stopped sing-box'; exit 1; fi
FIXTURE_FAILED_SERVICE=gost
if verify_node_services; then echo 'Accepted stopped agent'; exit 1; fi
unset FIXTURE_FAILED_SERVICE
printf 'Node runtime readiness regression checks passed\n'
