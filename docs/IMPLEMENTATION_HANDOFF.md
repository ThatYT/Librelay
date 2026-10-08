# Implementation handoff

See [DEPLOYMENT.md](DEPLOYMENT.md) for installation commands, existing installation upgrade instructions, database migration, Reality configuration, i18n/themes, validation matrix and known limitations.

## Complete changed-file inventory

73 modified tracked files and 21 new files (94 total). Every file is listed below; generated build outputs and temporary test tools are excluded.

| File | Change |
| --- | --- |
| [.env.example](../.env.example) | Document frontend 2095/API 6365 and blank secret placeholders for manual configuration. |
| [.github/workflows/docker-build.yml](../.github/workflows/docker-build.yml) | Derive lowercase GHCR owner from the fork rather than the upstream username. |
| [.github/workflows/release-gost.yml](../.github/workflows/release-gost.yml) | Use the current repository in release installation examples. |
| [.github/workflows/validate.yml](../.github/workflows/validate.yml) | Add backend/frontend/agent regression, production builds, shell and Compose checks to CI. |
| [.gitignore](../.gitignore) | Ignore local pnpm dependency caches. |
| [README.md](../README.md) | Update panel port/install examples and link the deployment guide. |
| [docker-compose-hybrid.yml](../docker-compose-hybrid.yml) | Default frontend to 2095 and API to 6365; propagate repository/ref for source installs. |
| [docker-compose-v4.yml](../docker-compose-v4.yml) | Apply new panel default and propagate repository/ref; retain named data volumes. |
| [docker-compose-v6.yml](../docker-compose-v6.yml) | Apply new panel default and propagate repository/ref; retain named data volumes. |
| [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) | Document architecture, fresh installation, existing upgrades, migration, UI behavior and test limitations. |
| [docs/IMPLEMENTATION_HANDOFF.md](../docs/IMPLEMENTATION_HANDOFF.md) | Provide this complete file inventory and tracked diff summary. |
| [docs/反向代理.md](../docs/反向代理.md) | Update panel reverse-proxy examples to port 2095. |
| [go-gost/x/config/parsing/service/parse.go](../go-gost/x/config/parsing/service/parse.go) | Share SOCKS traffic counters and mark private transports exempt from node protocol blocking. |
| [go-gost/x/go.mod](../go-gost/x/go.mod) | Record previously missing build dependencies for the node module. |
| [go-gost/x/go.sum](../go-gost/x/go.sum) | Record verified dependency checksums used by node builds. |
| [go-gost/x/handler/socks/v5/handler.go](../go-gost/x/handler/socks/v5/handler.go) | Accept shared per-service counters for private SOCKS traffic. |
| [go-gost/x/handler/socks/v5/udp.go](../go-gost/x/handler/socks/v5/udp.go) | Account SOCKS UDP association packets in the same service counters. |
| [go-gost/x/service/service.go](../go-gost/x/service/service.go) | Support private transport bypass; allow missing optional node settings while rejecting malformed settings. |
| [go-gost/x/socket/listen_port.go](../go-gost/x/socket/listen_port.go) | Validate and probe independent TCP/UDP availability on the selected node. |
| [go-gost/x/socket/listen_port_test.go](../go-gost/x/socket/listen_port_test.go) | Test invalid inputs, TCP conflicts and TCP/UDP port coexistence. |
| [go-gost/x/socket/reality_egress_test.go](../go-gost/x/socket/reality_egress_test.go) | Exercise actual private TCP/UDP SOCKS traffic, counters and lifecycle with node blocking enabled. |
| [go-gost/x/socket/service.go](../go-gost/x/socket/service.go) | Handle paired pause/resume/delete when a private SOCKS service has no separate UDP listener. |
| [go-gost/x/socket/singbox.go](../go-gost/x/socket/singbox.go) | Validate candidate config, check service startup and restore prior configuration on failure. |
| [go-gost/x/socket/websocket_reporter.go](../go-gost/x/socket/websocket_reporter.go) | Dispatch the remote CheckListenPort command. |
| [gost.sql](../gost.sql) | Add compatible public_listen/egress_port columns to the initial inbound schema. |
| [install.sh](../install.sh) | Fetch/build the fork agent, preserve node settings, validate repository inputs and safely pass configuration. |
| [panel_install.sh](../panel_install.sh) | Add port/domain/directory flags, prerequisite/plugin checks, random secrets, source builds and nondestructive install/update. |
| [springboot-backend/Dockerfile](../springboot-backend/Dockerfile) | Use standard Debian package sources when installing fonts. |
| [springboot-backend/pom.xml](../springboot-backend/pom.xml) | Enable JUnit 5 execution through current Maven Surefire. |
| [springboot-backend/src/main/java/com/admin/common/dto/InboundDto.java](../springboot-backend/src/main/java/com/admin/common/dto/InboundDto.java) | Validate listening port bounds and reject fractional JSON numbers. |
| [springboot-backend/src/main/java/com/admin/common/task/SchemaMigration.java](../springboot-backend/src/main/java/com/admin/common/task/SchemaMigration.java) | Add missing inbound columns without changing existing ports or rows. |
| [springboot-backend/src/main/java/com/admin/common/utils/GostUtil.java](../springboot-backend/src/main/java/com/admin/common/utils/GostUtil.java) | Generate private per-user SOCKS meters/chains and remove their chains on deletion. |
| [springboot-backend/src/main/java/com/admin/common/utils/NodeCommandClient.java](../springboot-backend/src/main/java/com/admin/common/utils/NodeCommandClient.java) | Expose an injectable node-command boundary for configuration and regression tests. |
| [springboot-backend/src/main/java/com/admin/common/utils/PortNumberDeserializer.java](../springboot-backend/src/main/java/com/admin/common/utils/PortNumberDeserializer.java) | Reject fractional/out-of-range integer representations while retaining numeric-string compatibility. |
| [springboot-backend/src/main/java/com/admin/common/utils/RepositoryConfig.java](../springboot-backend/src/main/java/com/admin/common/utils/RepositoryConfig.java) | Centralize validated repository/ref settings and safe shell quoting. |
| [springboot-backend/src/main/java/com/admin/common/utils/SingboxUtil.java](../springboot-backend/src/main/java/com/admin/common/utils/SingboxUtil.java) | Generate public Reality listeners, authenticated per-user routes and private gateway listeners. |
| [springboot-backend/src/main/java/com/admin/controller/InboundController.java](../springboot-backend/src/main/java/com/admin/controller/InboundController.java) | Expose authorized Reality port editing and forward optional one-click listening ports. |
| [springboot-backend/src/main/java/com/admin/controller/VersionController.java](../springboot-backend/src/main/java/com/admin/controller/VersionController.java) | Check updates from configured repository/ref. |
| [springboot-backend/src/main/java/com/admin/entity/Inbound.java](../springboot-backend/src/main/java/com/admin/entity/Inbound.java) | Persist public listener mode and separate private gateway port. |
| [springboot-backend/src/main/java/com/admin/entity/InboundUser.java](../springboot-backend/src/main/java/com/admin/entity/InboundUser.java) | Carry transient private user-meter ports during config generation. |
| [springboot-backend/src/main/java/com/admin/service/ForwardService.java](../springboot-backend/src/main/java/com/admin/service/ForwardService.java) | Expose checked inbound-forward reconfiguration result. |
| [springboot-backend/src/main/java/com/admin/service/InboundService.java](../springboot-backend/src/main/java/com/admin/service/InboundService.java) | Extend creation and port-edit API contracts. |
| [springboot-backend/src/main/java/com/admin/service/impl/ForwardServiceImpl.java](../springboot-backend/src/main/java/com/admin/service/impl/ForwardServiceImpl.java) | Keep private meters independent of public transfer ranges and reserve private gateway ports. |
| [springboot-backend/src/main/java/com/admin/service/impl/InboundServiceImpl.java](../springboot-backend/src/main/java/com/admin/service/impl/InboundServiceImpl.java) | Default only new VLESS to 443, validate node/transport conflicts, edit with recovery and unify all subscription ports. |
| [springboot-backend/src/main/java/com/admin/service/impl/NodeServiceImpl.java](../springboot-backend/src/main/java/com/admin/service/impl/NodeServiceImpl.java) | Generate safely quoted installation commands against the configured fork. |
| [springboot-backend/src/test/java/com/admin/AdminApplicationTests.java](../springboot-backend/src/test/java/com/admin/AdminApplicationTests.java) | Replace production-context-only test with focused port bounds/JSON validation. |
| [springboot-backend/src/test/java/com/admin/service/impl/RealityPortTest.java](../springboot-backend/src/test/java/com/admin/service/impl/RealityPortTest.java) | Test defaults, custom config/exports, legacy preservation, occupied ports and editing without credential reallocation. |
| [tests/installer_test.sh](../tests/installer_test.sh) | Check port range, busy rejection, default/custom CLI and existing .env preservation. |
| [librelay-hybrid.sh](../librelay-hybrid.sh) | Update status/default port reporting to 2095. |
| [vite-frontend/.gitignore](../vite-frontend/.gitignore) | Allow the reproducible pnpm lockfile to be versioned. |
| [vite-frontend/Dockerfile](../vite-frontend/Dockerfile) | Use Node compatible with pinned pnpm and frozen-lockfile installation. |
| [vite-frontend/index.html](../vite-frontend/index.html) | Apply persisted Light/Dark immediately and migrate old skin IDs. |
| [vite-frontend/package.json](../vite-frontend/package.json) | Declare React localization/direct build dependencies, pinned package manager and test command. |
| [vite-frontend/pnpm-lock.yaml](../vite-frontend/pnpm-lock.yaml) | Lock complete frontend dependencies for local, CI and Docker builds. |
| [vite-frontend/pnpm-workspace.yaml](../vite-frontend/pnpm-workspace.yaml) | Declare permitted dependency build scripts for pnpm installation. |
| [vite-frontend/src/App.tsx](../vite-frontend/src/App.tsx) | Subscribe app rendering to language changes and translate global UI. |
| [vite-frontend/src/api/index.ts](../vite-frontend/src/api/index.ts) | Expose port-edit API and custom one-click/relay port payloads. |
| [vite-frontend/src/api/network.ts](../vite-frontend/src/api/network.ts) | Translate displayed network/session notifications while retaining raw API messages. |
| [vite-frontend/src/components/language-picker.tsx](../vite-frontend/src/components/language-picker.tsx) | Provide persisted Chinese/English selection. |
| [vite-frontend/src/components/navbar.tsx](../vite-frontend/src/components/navbar.tsx) | Translate navigation/account actions and show the language picker. |
| [vite-frontend/src/components/reality-port-button.tsx](../vite-frontend/src/components/reality-port-button.tsx) | Provide a reusable validated Reality port-edit dialog for relay listings. |
| [vite-frontend/src/components/skin-picker.tsx](../vite-frontend/src/components/skin-picker.tsx) | Translate and restrict theme selection to Light/Dark. |
| [vite-frontend/src/components/sub-qr.tsx](../vite-frontend/src/components/sub-qr.tsx) | Translate subscription QR dialogs and actions. |
| [vite-frontend/src/components/theme-provider.tsx](../vite-frontend/src/components/theme-provider.tsx) | Document persisted Light/Dark skin behavior. |
| [vite-frontend/src/config/skins.ts](../vite-frontend/src/config/skins.ts) | Retain only two skins and map old skin IDs to their light/dark base. |
| [vite-frontend/src/config/sni.ts](../vite-frontend/src/config/sni.ts) | Translate human-readable SNI descriptions without changing host identifiers. |
| [vite-frontend/src/i18n.ts](../vite-frontend/src/i18n.ts) | Initialize React i18next catalogs, browser fallback and localStorage persistence. |
| [vite-frontend/src/layouts/admin.tsx](../vite-frontend/src/layouts/admin.tsx) | Translate navigation/account/dialog controls and rerender on language switches. |
| [vite-frontend/src/layouts/h5-simple.tsx](../vite-frontend/src/layouts/h5-simple.tsx) | Show language switching in the simple mobile layout. |
| [vite-frontend/src/layouts/h5.tsx](../vite-frontend/src/layouts/h5.tsx) | Translate mobile navigation and provide language switching. |
| [vite-frontend/src/locales/en-US.json](../vite-frontend/src/locales/en-US.json) | Provide English UI, validation and common server-notification translations. |
| [vite-frontend/src/locales/zh-CN.json](../vite-frontend/src/locales/zh-CN.json) | Provide matching Chinese messages and interpolation fields. |
| [vite-frontend/src/pages/change-password.tsx](../vite-frontend/src/pages/change-password.tsx) | Translate password forms and validation and subscribe to language changes. |
| [vite-frontend/src/pages/config.tsx](../vite-frontend/src/pages/config.tsx) | Translate website configuration forms and alerts and subscribe to language changes. |
| [vite-frontend/src/pages/dashboard.tsx](../vite-frontend/src/pages/dashboard.tsx) | Translate dashboard statistics, traffic and expiry labels and subscribe to language changes. |
| [vite-frontend/src/pages/forward.tsx](../vite-frontend/src/pages/forward.tsx) | Translate transfer rules, bulk actions and validation and subscribe to language changes. |
| [vite-frontend/src/pages/guide.tsx](../vite-frontend/src/pages/guide.tsx) | Translate setup guidance, dialogs and notifications and subscribe to language changes. |
| [vite-frontend/src/pages/inbound.tsx](../vite-frontend/src/pages/inbound.tsx) | Add new/edit/one-click Reality port controls and translate protocol management. |
| [vite-frontend/src/pages/index.tsx](../vite-frontend/src/pages/index.tsx) | Translate login, CAPTCHA and authentication messages and subscribe to language changes. |
| [vite-frontend/src/pages/landing.tsx](../vite-frontend/src/pages/landing.tsx) | Translate landing nodes, forms and status and subscribe to language changes. |
| [vite-frontend/src/pages/limit.tsx](../vite-frontend/src/pages/limit.tsx) | Translate rate limits, forms and validation and subscribe to language changes. |
| [vite-frontend/src/pages/my-sub.tsx](../vite-frontend/src/pages/my-sub.tsx) | Translate subscription formats, QR/export controls and expiry and subscribe to language changes. |
| [vite-frontend/src/pages/node.tsx](../vite-frontend/src/pages/node.tsx) | Translate node installation, status, configuration and alerts and subscribe to language changes. |
| [vite-frontend/src/pages/profile.tsx](../vite-frontend/src/pages/profile.tsx) | Translate profile, traffic and subscriptions and subscribe to language changes. |
| [vite-frontend/src/pages/relay.tsx](../vite-frontend/src/pages/relay.tsx) | Add selected Reality port to relay creation/editing and translate relay management. |
| [vite-frontend/src/pages/settings.tsx](../vite-frontend/src/pages/settings.tsx) | Translate personal settings and dialogs and subscribe to language changes. |
| [vite-frontend/src/pages/tunnel.tsx](../vite-frontend/src/pages/tunnel.tsx) | Translate tunnels, transfer ranges, forms and notifications and subscribe to language changes. |
| [vite-frontend/src/pages/user.tsx](../vite-frontend/src/pages/user.tsx) | Translate users, assignment dialogs, quotas and expiry and subscribe to language changes. |
| [vite-frontend/src/provider.tsx](../vite-frontend/src/provider.tsx) | Pass selected language to React Aria for localized component behavior. |
| [vite-frontend/src/styles/themes.css](../vite-frontend/src/styles/themes.css) | Remove decorative skins and keep neutral white/dark backgrounds and toast colors. |
| [vite-frontend/src/utils/auth.ts](../vite-frontend/src/utils/auth.ts) | Translate displayed session/authentication messages. |
| [vite-frontend/src/utils/partial-success.ts](../vite-frontend/src/utils/partial-success.ts) | Translate display fallback while preserving partial-result parsing. |
| [vite-frontend/src/utils/toast.ts](../vite-frontend/src/utils/toast.ts) | Translate user-visible server messages, including dynamic port errors, without mutating API contracts. |
| [vite-frontend/tests/ui.test.mjs](../vite-frontend/tests/ui.test.mjs) | Test language defaults/switches, catalog completeness, notifications, themes and persistence. |

## Key diffs

- New public Reality mode is additive and opt-in for legacy rows through explicit editing. One helper chooses the actual subscription port across URI and Clash/Mihomo exports.
- The node checks port availability by transport and installs sing-box configurations with validation/recovery. Private accounting retains per-user limits, UDP traffic counters and lifecycle operations.
- Installation builds this fork, defaults to panel 2095/API 6365, preserves saved credentials/volumes and centralizes repository identity. Caddy remains on the panel host.
- React localization covers the existing UI, and saved decorative skins migrate to Light/Dark. Layouts remain intact.
- Focused regression tests and CI validation cover the changed paths; live VPS/Docker persistence checks remain outstanding.

## `git diff --stat`

This pre-publication snapshot covers modified tracked files only; the new files listed above were unstaged at the time and therefore absent from this output.

```text
 .github/workflows/docker-build.yml                 |  10 +-
 .github/workflows/release-gost.yml                 |   2 +-
 .gitignore                                         |   4 +-
 README.md                                          |  13 +-
 docker-compose-hybrid.yml                          |   8 +-
 docker-compose-v4.yml                              |   6 +-
 docker-compose-v6.yml                              |   6 +-
 docs/反向代理.md                                   |  16 +-
 go-gost/x/config/parsing/service/parse.go          |   8 +
 go-gost/x/go.mod                                   |   7 +-
 go-gost/x/go.sum                                   |   9 +
 go-gost/x/handler/socks/v5/handler.go              |  20 +-
 go-gost/x/handler/socks/v5/udp.go                  |   3 +
 go-gost/x/service/service.go                       |  43 +-
 go-gost/x/socket/service.go                        |  23 +
 go-gost/x/socket/singbox.go                        |  33 +-
 go-gost/x/socket/websocket_reporter.go             |  13 +-
 gost.sql                                           |   4 +-
 install.sh                                         | 104 +++--
 panel_install.sh                                   | 314 ++++++++-----
 springboot-backend/Dockerfile                      |   4 +-
 springboot-backend/pom.xml                         |   5 +
 .../main/java/com/admin/common/dto/InboundDto.java |   3 +
 .../com/admin/common/task/SchemaMigration.java     |   4 +
 .../main/java/com/admin/common/utils/GostUtil.java |  53 ++-
 .../java/com/admin/common/utils/SingboxUtil.java   |  32 +-
 .../com/admin/controller/InboundController.java    |  18 +-
 .../com/admin/controller/VersionController.java    |   4 +-
 .../src/main/java/com/admin/entity/Inbound.java    |   6 +
 .../main/java/com/admin/entity/InboundUser.java    |   3 +
 .../java/com/admin/service/ForwardService.java     |   1 +
 .../java/com/admin/service/InboundService.java     |   6 +-
 .../com/admin/service/impl/ForwardServiceImpl.java |  23 +-
 .../com/admin/service/impl/InboundServiceImpl.java | 185 +++++++-
 .../com/admin/service/impl/NodeServiceImpl.java    |  23 +-
 .../test/java/com/admin/AdminApplicationTests.java |  50 +--
 librelay-hybrid.sh                                      |   5 +-
 vite-frontend/.gitignore                           |   1 -
 vite-frontend/Dockerfile                           |  10 +-
 vite-frontend/index.html                           |  31 +-
 vite-frontend/package.json                         |  16 +-
 vite-frontend/src/App.tsx                          |   7 +-
 vite-frontend/src/api/index.ts                     |   7 +-
 vite-frontend/src/api/network.ts                   |  15 +-
 vite-frontend/src/components/navbar.tsx            |  13 +-
 vite-frontend/src/components/skin-picker.tsx       |   7 +-
 vite-frontend/src/components/sub-qr.tsx            |   8 +-
 vite-frontend/src/components/theme-provider.tsx    |   2 +-
 vite-frontend/src/config/skins.ts                  |  40 +-
 vite-frontend/src/config/sni.ts                    |   3 +-
 vite-frontend/src/layouts/admin.tsx                | 118 +++--
 vite-frontend/src/layouts/h5-simple.tsx            |   5 +-
 vite-frontend/src/layouts/h5.tsx                   |  20 +-
 vite-frontend/src/pages/change-password.tsx        |  61 +--
 vite-frontend/src/pages/config.tsx                 |  81 ++--
 vite-frontend/src/pages/dashboard.tsx              | 122 +++---
 vite-frontend/src/pages/forward.tsx                | 439 ++++++++-----------
 vite-frontend/src/pages/guide.tsx                  | 194 ++++-----
 vite-frontend/src/pages/inbound.tsx                | 283 ++++++------
 vite-frontend/src/pages/index.tsx                  |  53 ++-
 vite-frontend/src/pages/landing.tsx                | 129 +++---
 vite-frontend/src/pages/limit.tsx                  | 123 +++---
 vite-frontend/src/pages/my-sub.tsx                 | 106 ++---
 vite-frontend/src/pages/node.tsx                   | 223 +++++-----
 vite-frontend/src/pages/profile.tsx                |  83 ++--
 vite-frontend/src/pages/relay.tsx                  | 181 ++++----
 vite-frontend/src/pages/settings.tsx               |  43 +-
 vite-frontend/src/pages/tunnel.tsx                 | 265 ++++++-----
 vite-frontend/src/pages/user.tsx                   | 484 ++++++++-------------
 vite-frontend/src/provider.tsx                     |   4 +-
 vite-frontend/src/styles/themes.css                |  28 +-
 vite-frontend/src/utils/auth.ts                    |   5 +-
 vite-frontend/src/utils/partial-success.ts         |   3 +-
 73 files changed, 2201 insertions(+), 2083 deletions(-)
```

## Database initialization recovery follow-up

- `panel_install.sh`: make SQL readable to MySQL while keeping `.env` private; require all twelve tables before install/update succeeds.
- `DatabaseBootstrap.java`: detect interrupted schemas, add missing tables and finish missing base-table keys without replacing existing rows.
- `db/bootstrap.sql`: provide the complete additive schema and seeds guarded by existing data.
- `SchemaMigration.java`: guard missing certificate/landing columns after interrupted imports.
- `DatabaseBootstrapTest.java` and `DatabaseBootstrapMysqlTest.java`: cover intact schemas, fresh/partial initialization, preserved passwords/limits and legacy Reality ports.
- `tests/installer_test.sh`: regress schema-file permissions under umask 077 and reject incomplete database health.
- `.github/workflows/validate.yml`: run schema regressions against a disposable localhost-only MySQL 5.7 service.
- README/deployment guide: document recovery through nondestructive update.

## Backend readiness follow-up

- Backend Dockerfile adds curl and a database-backed login API HEALTHCHECK.
- Installer checks the configured backend API for code 0 and handles absent legacy health metadata without incorrectly reporting a missing container.
- Installer regressions cover absent health metadata, application-level failures, unreachable APIs and exited containers.
- CI builds/runs the actual backend image beside MySQL and checks both Docker health and the login API.

## Node resource usage follow-up

- `install.sh`: download commit-matched prebuilt binaries by default, verify SHA-256, check disk space, remove temporary downloads on failure and propagate failure status. Source compilation is explicit and uses bounded parallelism/work directories.
- `.github/workflows/node-binaries.yml`: publish Linux amd64/arm64 binaries and checksums for every main commit.
- `.github/workflows/release-gost.yml`: include checksums in manually tagged agent releases too.
- `tests/node_installer_test.sh`: check default download URLs, absence of source downloads, checksums, retained executable on failure, staging cleanup and exit status.
- Validation workflow and deployment/README instructions include these regressions and the new defaults.

## Custom panel HTTPS port follow-up

- `panel_install.sh`: add `--https-port`, preserve/read the configured Caddy port, validate conflicts, generate HTTP-validation-only TLS for nonstandard ports, validate candidates and restore prior bindings on startup failure.
- `tests/domain_test.sh`: cover 2095 with occupied 443, legacy 443, saved ports, frontend/other-service conflicts and rollback.
- Validation workflow: parse the real Caddy config and test HTTPS 2095 while a separate container occupies TCP 443.
- README/deployment guide: explain moving the frontend HTTP backup to 8080 and leaving API 6365/Reality 443 independent.

## Automatic internal port allocation follow-up

- `InboundServiceImpl.java`: check remote socket availability while allocating internal 40000+ ports, skip occupied candidates with bounded retries, stop on operational errors, and retain explicitly selected public ports.
- `RealityPortTest.java`: verify busy gateway recovery, unchanged 443/8443 exports, other automatic protocols, timeout handling and a 25-candidate limit.
- README/deployment guide: explain internal vs public ports and nondestructive backend update.

## All-protocol public port follow-up

All protocol creation and port editing forms now accept ports 1–65535. VLESS alone defaults to 443; others may be left empty for automatic allocation. Newly created protocols use public listeners and private per-user SOCKS metering for traffic, speed limits and lifecycle controls. Existing rows are untouched until explicitly edited. No database migration is needed beyond the existing public_listen/egress_port fields.

SingboxUtil supplies stable named users for Trojan, VMess, Hysteria2, TUIC and AnyTLS; SS-2022 uses a 32-byte identity key derived from the existing random user credential and exports server-key:user-key credentials. URI and supported Clash/Mihomo exports share the actual public port. Existing older-core Clash exports still omit AnyTLS; its URI export remains available.

Focused backend tests cover custom/automatic ports for every protocol, all-protocol edit conversion with credentials/forward IDs retained, network-specific conflicts and exported port/SS-key consistency. Frontend tests cover defaults, blank automatic allocation and invalid integers. CI also validates all seven generated configs using sing-box 1.13.12, matching the node version.

## Prebuilt panel deployment follow-up

- `panel_install.sh`: default exact-commit GHCR downloads, revision verification, staged Compose activation, directory lock, visible/persisted progress, explicit `--source` with RAM/swap check and sequential builds, rollback of the previous configuration on failed readiness. Self-update retains directory/source mode. Removed repeated readiness waits and destructive shell SQL.
- `docker-compose-images.yml`: installer image-only template retaining the hybrid deployment's service names, named volumes, port defaults and network.
- `.github/workflows/docker-build.yml`: cached frontend/backend matrix publishing amd64/arm64 `sha-<full SHA>` plus legacy `latest`; native JAR build and anonymous image-download verification. Removed redundant Go compilation/release mutation (node binaries have their own existing workflow). Existing published version tags/releases remain intact.
- Dockerfiles: bounded source-build heaps, native backend build platform, Maven BuildKit cache and revision labels.
- Backend `SchemaMigration`: additive equivalents of necessary old installer migrations; keeps obsolete columns and existing rows. Legacy node addresses are copied only where server_ip is null. `VersionController` checks successful panel-image workflows instead of unrelated workflow successes.
- `tests/panel_deploy_test.sh`: image default, custom ports and secret/Caddy/SQL preservation, unavailable images, revision mismatch, failed builds, readiness rollback and sequential source build. Existing installer fixtures still cover private env/readable SQL. CI MySQL regression verifies legacy fields/data survive additive migration.

Default update downloads images and does not run local compilers. Pending CI, registry/network failures or private image permissions return a clear failure while retaining the old running deployment. No database downgrade/rollback is attempted. Source mode remains explicit on each command; no implicit compile or automatic swap creation occurs.

## English installer follow-up

`panel_install.sh`, `install.sh` and `librelay-hybrid.sh` now use English terminal text and comments throughout installation, update, status, domain/HTTPS, backup, restore and removal flows. Generated management launcher comments are English too. Shell diagnostics use the C locale; commands, repository variables, ports and database handling are retained. The previous non-English domain-off alias is retained through a portable escaped literal.

The panel menu now routes 8 to domain setup and 9 to restore, fixing duplicated option 8. The node installer routes its advertised exit option 4 to exit and keeps 5 as a compatibility alias, removing the undefined block_protocol call. Installer regression fixtures exercise both routes and both exit options; deployment fixtures use the translated backup section marker.

## Librelay repository and deployment identity

The project repository is `ThatYT/Librelay`; new installations use `/opt/librelay`, branded Docker resource names and `LIBRELAY_*` environment flags. See DEPLOYMENT.md for the compatibility upgrade. Existing data volumes, database names, Caddy certificates and installation paths remain attached to their original names. Legacy TMS identifiers appear only as compatibility paths, stored-address readers, test cases or historical implementation details. Third-party engine/framework names remain unchanged. The Android source display/theme name is Librelay; its existing application ID and historical bundled APK are retained, so this panel rename does not silently change Android application identity.
