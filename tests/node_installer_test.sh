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
unset TMS_NODE_RELEASE TMS_NODE_SOURCE
download_agent "$INSTALL_DIR/gost.new"
cmp "$INSTALL_DIR/gost.new" "$workspace/fixture-agent"
grep -q "/releases/download/node-${fixture_revision}/gost-amd64" "$workspace/urls"
if grep -qE 'codeload|go.dev' "$workspace/urls"; then echo 'Default mode compiled source'; exit 1; fi
# Specific tags use GitHub's correct /releases/download/TAG/asset route.
export TMS_NODE_RELEASE=gost-v-test
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
