#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
export GITHUB_REPO=example/tms GITHUB_REF=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa TMS_PANEL_SOURCE=0
source "$repo_dir/panel_install.sh"
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
fixture_revision=$GITHUB_REF
mkdir "$workspace/archive"
cp "$repo_dir/docker-compose-hybrid.yml" "$workspace/archive/"
cp "$repo_dir/gost.sql" "$workspace/archive/"
mkdir "$workspace/archive/springboot-backend" "$workspace/archive/vite-frontend"
tar -czf "$workspace/source.tar.gz" -C "$workspace/archive" .

# Cross-platform fixtures never operate on the user's Docker or /usr/local/bin.
acquire_install_lock() { :; }
check_source_resources() { :; }
wait_backend_ready() { [ "${FAIL_READY:-0}" = 0 ]; }
verify_database_schema() { :; }
curl() {
  local target="" url="" previous=""
  for arg in "$@"; do
    [ "$previous" != -o ] || target="$arg"
    previous="$arg"
    case "$arg" in https://*) url="$arg" ;; esac
  done
  if [[ "$url" = *'/commits/'* ]]; then printf '{"sha":"%s"}\n' "$fixture_revision"; return; fi
  case "$url" in
    */docker-compose-images.yml) cp "$repo_dir/docker-compose-images.yml" "$target" ;;
    */gost.sql) cp "$repo_dir/gost.sql" "$target" ;;
    https://codeload.github.com/*) cp "$workspace/source.tar.gz" "$target" ;;
    *) echo "Unexpected download: $url" >&2; return 1 ;;
  esac
}
docker() {
  if [[ "$*" = *'image inspect -f'* ]]; then
    if [ "${BAD_REVISION:-0}" = 1 ]; then echo wrong-revision; else echo "$fixture_revision"; fi
  elif [[ "$*" = *'image inspect mysql:5.7'* ]]; then return 0
  else echo "Unexpected docker invocation: $*" >&2; return 1; fi
}
fixture_compose() {
  local action="" candidate="" previous=""
  for arg in "$@"; do
    [ "$previous" != -f ] || candidate="$arg"
    case "$arg" in config|pull|build|up) action="$arg" ;; esac
    previous="$arg"
  done
  case "$action" in
    config)
      [ -s "$candidate" ]
      if [ -n "${TMS_TEST_COMPOSE:-}" ]; then
        "$TMS_TEST_COMPOSE" --project-directory "$PWD" --env-file .env -f "$candidate" config --quiet
      fi ;;
    pull)
      printf 'pull %s\n' "$*" >> calls
      [ "$TMS_PANEL_SOURCE" = 0 ]
      grep -q "sha-$fixture_revision" "$candidate"
      [ "${FAIL_PULL:-0}" = 0 ] ;;
    build)
      printf 'build %s\n' "${*: -1}" >> calls
      [ "$TMS_PANEL_SOURCE" = 1 ]
      [ "$COMPOSE_PARALLEL_LIMIT" = 1 ]
      [[ "$*" = *"BUILD_COMMIT=$fixture_revision"* ]]
      [ "${FAIL_BUILD:-0}" = 0 ] ;;
    up)
      printf 'up\n' >> calls
      [[ "$*" = *'--no-build --pull never'* ]]
      [ -f docker-compose.yml ] ;;
    *) echo "Unexpected Compose invocation: $*" >&2; return 1 ;;
  esac
}
DOCKER_CMD=fixture_compose
prepare_fixture() {
  mkdir "$workspace/$1"; cd "$workspace/$1"
  printf 'DB_NAME=gost\nDB_USER=gost\nDB_PASSWORD=fixture-only\nJWT_SECRET=fixture-only\nFRONTEND_PORT=8080\nBACKEND_PORT=6365\nGITHUB_REPO=example/tms\nGITHUB_REF=main\n' > .env
  chmod 600 .env; cp .env expected.env
  printf '# previous Compose\nservices: {}\n' > docker-compose.yml
  cp docker-compose.yml previous.yml
  cp "$repo_dir/gost.sql" gost.sql; cp gost.sql previous.sql
  printf 'panel.example.com:2095 { reverse_proxy frontend:80 }\n' > Caddyfile
  cp Caddyfile previous.caddy
}
assert_saved_data() { cmp .env expected.env; cmp gost.sql previous.sql; cmp Caddyfile previous.caddy; }
(
  prepare_fixture images
  rm gost.sql
  umask 077
  deploy_panel
  [ "$(ls -l gost.sql | cut -c1-10)" = "-rw-r--r--" ]
  [ "$(ls -l .env | cut -c1-10)" = "-rw-------" ]
  assert_saved_data
  ! grep -q 'build:' docker-compose.yml
  grep -q "ghcr.io/example/springboot-backend:sha-$fixture_revision" docker-compose.yml
  grep -q "ghcr.io/example/vite-frontend:sha-$fixture_revision" docker-compose.yml
  grep -q '^MODE=images$' .tms-deployment
  ! grep -q '^build ' calls
  [ "$(grep -c '^up$' calls)" = 1 ]
)
for failure in pull revision; do (
  prepare_fixture "$failure"
  if [ "$failure" = pull ]; then FAIL_PULL=1; else BAD_REVISION=1; fi
  if deploy_panel; then echo "Accepted failed $failure"; exit 1; fi
  assert_saved_data
  cmp docker-compose.yml previous.yml
  ! grep -q '^up$' calls
  [ ! -e .tms-deployment ]
); done
(
  prepare_fixture rollback
  FAIL_READY=1
  if deploy_panel; then echo 'Accepted unready backend'; exit 1; fi
  assert_saved_data
  cmp docker-compose.yml previous.yml
  [ "$(grep -c '^up$' calls)" = 2 ]
  [ ! -e .tms-deployment ]
)
(
  prepare_fixture source
  TMS_PANEL_SOURCE=1
  deploy_panel
  assert_saved_data
  [ "$(sed -n '/^build /p' calls)" = 'build backend'$'\n''build frontend' ]
  ! grep -q '^pull ' calls
  [ -d .source/springboot-backend ]
  grep -q 'context: ./.source/springboot-backend' docker-compose.yml
  grep -q '^MODE=source$' .tms-deployment
)
(
  prepare_fixture source-rollback
  mkdir .source; printf 'old source' > .source/sentinel
  TMS_PANEL_SOURCE=1 FAIL_READY=1
  if deploy_panel; then echo 'Accepted unready source backend'; exit 1; fi
  assert_saved_data; cmp docker-compose.yml previous.yml
  [ "$(cat .source/sentinel)" = 'old source' ]
)
(
  prepare_fixture build-failed
  TMS_PANEL_SOURCE=1 FAIL_BUILD=1
  if deploy_panel; then echo 'Accepted failed source build'; exit 1; fi
  assert_saved_data; cmp docker-compose.yml previous.yml
  ! grep -q '^up$' calls
)
# No tar/source build is downloaded by default; immutable resolution accepts only real SHAs.
GITHUB_REF=main; resolve_panel_commit; [ "$PANEL_COMMIT" = "$fixture_revision" ]
curl() { printf '{"sha":"bad; touch injected"}'; }
if resolve_panel_commit; then echo 'Accepted malicious commit response'; exit 1; fi
# The shell update path must not execute the removed destructive legacy SQL.
if sed -n '/^update_panel()/,/^# 导出数据库备份/p' "$repo_dir/panel_install.sh" | grep -q 'DROP COLUMN\|temp_migration.sql'; then
  echo 'Destructive legacy migration still present'; exit 1
fi
# CLI mode remains explicit, and resource mode is never enabled for status/domain.
prepare_host() { :; }
install_panel() { echo "$TMS_PANEL_SOURCE"; }
TMS_PANEL_SOURCE=0
[ "$(main --source --install-dir "$workspace/cli")" = 1 ]
if (main status --source --install-dir "$workspace/cli") >/dev/null 2>&1; then exit 1; fi
if (TMS_PANEL_SOURCE=invalid; main --install-dir "$workspace/cli") >/dev/null 2>&1; then exit 1; fi
printf 'Panel image/source deployment regression checks passed\n'
