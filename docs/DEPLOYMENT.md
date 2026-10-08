# Librelay deployment and upgrade

The examples below use this fork's `main` branch. Another fork can set `GITHUB_REPO=OWNER/REPO` in one place; `GITHUB_REF` defaults to `main`.

## Architecture and port ownership

The panel is Spring Boot plus a React/Vite frontend, MySQL, and an optional independent Caddy container. The Go agent runs on each proxy node. Caddy owns HTTPS on the **panel machine**; protocol listeners belong to their selected **node**.

| Machine | Service | Default port |
| --- | --- | --- |
| Panel VPS | Public frontend | TCP 2095 |
| Panel VPS | Backend API | TCP 6365 |
| Panel VPS | Optional Caddy | TCP 80/443 |
| Remote proxy node | New VLESS-Reality | TCP 443 |

Panel HTTPS 443 and Reality 443 on a different node are valid together. A TCP service already listening on the same node's 443 blocks Reality 443; a UDP listener on 443 does not. Reality binds all node addresses, so a TCP listener bound to any overlapping local address also conflicts. The panel never probes its own ports on behalf of a remote node.

Previously, sing-box used an internal loopback port starting at 40000 and each user's public gost forward used an automatically allocated port starting at 20000. Existing protocols retain that behavior after upgrade. All new protocols expose their selected sing-box port directly. To retain per-user traffic, limits, expiry and pause/resume, authenticated users route through private loopback gost SOCKS services and a private sing-box SOCKS gateway. Their automatically allocated private ports are separate from both the public Reality listening port and a transfer machine's allowed public port range.

## New installation

Run as root on a supported Linux distribution (Debian/Ubuntu/Raspbian, Fedora, CentOS/RHEL/Rocky/AlmaLinux):

```bash
bash <(curl -Ls https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh)
```

The installer prompts `Panel port [2095]:` in an interactive terminal. Press Enter for 2095. Noninteractive installation uses 2095. If curl is not yet installed, install it through your distribution's package manager to fetch the bootstrap script; the script checks the remaining prerequisites itself.

Custom port, directory and optional HTTPS domain:

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh -o /tmp/tms.sh
bash /tmp/tms.sh --port 8080 --install-dir /opt/tms --domain panel.example.com
```

`-p 8080` is equivalent to `--port 8080`. A domain must point to the panel VPS and Caddy needs that machine's TCP 80/443. Choose a distinct frontend/API port when using Caddy. The default directory is `/opt/tms`.

For another fork, export `GITHUB_REPO=OWNER/REPO` before running its downloaded installer. The repository and ref are saved in `.env` and propagated to the backend and generated node installation commands. Node agents default to CI-built Linux binaries for the selected branch's exact commit, published under `node-<full commit SHA>`. The installer checks SHA-256 before replacement. Wait for the Node binaries workflow after a new push; it never silently falls back to compiling on the VPS. `TMS_NODE_RELEASE` can pin an explicit release with a checksum manifest, and `TMS_NODE_SOURCE=1` explicitly opts into source compilation.

The installer checks root, distribution, prerequisites, Docker, the Compose plugin and available ports. It generates database/JWT secrets with OpenSSL and creates a private `.env`. It resolves the repository/ref to one commit and downloads the matching CI-built frontend/backend images, checking their revision labels before replacing any running container. Default installation downloads only the Compose template and initialization SQL; Java/frontend compilation occurs in GitHub Actions. It prints the access URL, initial account and management commands. Change the displayed initial account password after first login.

Useful commands:

```bash
librelay
librelay status
librelay info
librelay update
librelay domain panel.example.com
```

## Upgrade an existing installation

Keep the original installation directory, `.env` and MySQL volume. Do not copy a new `.env.example` over existing credentials. Download the updated bootstrap script and use `update`, rather than the old installed script's update implementation:

```bash
tms export
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh -o /tmp/tms.sh
bash /tmp/tms.sh update --install-dir /YOUR/EXISTING/INSTALL/DIRECTORY
```

If `.env` already contains a different `GITHUB_REPO`, change that repository setting to the intended fork before updating. The update preserves database credentials, JWT secret, frontend/API ports, SQL initialization file and named data volumes. It adds repository settings when absent and pulls both commit-pinned images before replacing running services. Failed downloads or mismatched revisions leave the running Compose configuration untouched. Startup/readiness failures attempt to restore the previous configuration/containers; additive database changes are not rolled back. A repeated `install` with an existing `.env` leaves it intact and directs you to update. A preexisting MySQL volume without its original `.env` causes installation to stop, preventing a new password from being applied to an old database.

Update **every proxy node agent** using the installation command generated by the updated panel before creating or converting public Reality listeners. Existing node configuration and certificate files are preserved. Older agents do not implement the remote port check; public Reality creation will fail until they are updated.

An existing frontend port such as 6366 stays 6366. To change it, verify the new port is free on the panel VPS, edit `FRONTEND_PORT` in its original `.env`, then run `librelay update`. The `--port` option applies to new installations and rejects attempts to silently change an existing installation's port.

Normal install/update paths never remove the MySQL volume. Existing explicit destructive management commands such as `purge` remain destructive and are not part of this upgrade procedure.

The panel installer, node installer and source-deployment manager use English prompts, menus, diagnostics and comments. External shell tools run with the C locale. Frontend Chinese/English language support is independent.

## Panel deployment resources

Wait for **Build and publish panel images** to finish for the selected commit. Images are published for amd64/arm64 under `ghcr.io/<lowercase repository owner>/springboot-backend:sha-<full SHA>` and `vite-frontend:sha-<full SHA>`. Existing public packages support anonymous pulls; private packages require registry login. The bundled MySQL 5.7 image is native amd64 only, so standard full-panel installation uses an amd64 host; dual-architecture frontend/backend images alone do not make the database ARM-native. No automatic database-version upgrade is attempted. Pending CI or network failures never trigger implicit local compilation.

`--source` (or `TMS_PANEL_SOURCE=1`) opts into local builds. The installer checks at least 2.5 GiB available RAM plus free swap, builds backend then frontend with concurrency one, uses a 512 MiB Maven heap target and 1536 MiB Node heap limit, and reuses Maven's BuildKit cache. This reduces resource pressure without guaranteeing a build on every small host. It never creates swap automatically.

Progress appears in the terminal and `.tms-last-deploy.log`. `librelay info` displays `.tms-deployment` metadata. An exclusive directory lock blocks simultaneous installation/update. If an old installer is already compiling, interrupt that build before starting the new script. Existing `.env`, SQL init file, named volumes and Caddy configuration are preserved. No `down -v`, pruning or destructive legacy SQL runs during update; backward-compatible additions are performed by backend startup migrations.

## Node installation resource exhaustion

Old node scripts compiled the entire Go agent on the VPS. `no space left on device` indicates the build filesystem is full; `compile: signal: killed` can also indicate memory pressure. The default install now downloads matching amd64/arm64 binaries from the repository's Node binaries workflow and verifies the published SHA-256 checksum. Temporary downloads are removed on failure, and the existing executable/configuration is retained. Install failure now returns a failing exit status.

Use `df -h / /tmp /var/tmp` and `free -h` to inspect resources. Do not delete MySQL volumes or node settings to make room. Rerun the generated installation command after the latest Node binaries workflow succeeds. Default downloads require at least 128 MiB free on the target filesystem.

Source compilation is optional with `TMS_NODE_SOURCE=1`, requiring at least 3 GiB free in an existing `TMS_NODE_BUILD_DIR` (default `/var/tmp`). It uses one compiler worker, a 256 MiB Go memory target, and confines Go build/cache files to its temporary directory for cleanup. These limits reduce resource pressure but cannot guarantee success on every small VPS. Each published commit release includes `gost-amd64`, `gost-arm64`, and `checksums.sha256`.

## Recover a missing login configuration table

`Table 'gost.vite_config' doesn't exist` means the database server is reachable but its initial schema is incomplete. The installer previously copied `gost.sql` under its secret-protecting `umask 077`, leaving the SQL file unreadable by MySQL's unprivileged container process. Schema files now receive mode 0644 while `.env` remains private. Installation/update also checks for all twelve required tables before reporting success.

Do not delete the MySQL volume. Download the latest panel installer and run `update` against the original installation directory, keeping `.env`. The updated backend runs an additive bootstrap before column migrations: it creates missing tables, completes primary keys/auto-increment if an old import stopped before those ALTERs, and retains existing rows. Complete databases are left alone. The default administrator is seeded only when the user table is empty; existing account credentials, quotas, protocol ports and configuration values are never replaced. Missing node certificate fields and inbound landing fields are added through guarded column migrations.

MySQL's container entrypoint does not retry initial SQL against an already initialized volume; restarting the old backend alone will not fix the missing table. If update still fails, inspect both MySQL and backend logs. The bundled recovery schema is `springboot-backend/src/main/resources/db/bootstrap.sql` and is covered by an isolated MySQL 5.7 CI regression.

## Update reports backend health `unknown`

Older source-built backend images had no Docker `HEALTHCHECK`, while the old update script required `.State.Health.Status` to become `healthy`. This could report a timeout even when the backend was running; the later "container does not exist" message came from inspecting the absent health field, not necessarily an absent container.

The backend image now defines a healthcheck against the database-backed login CAPTCHA status API. Fresh installs and updates additionally verify that this API returns application `code: 0` on the configured local backend port. Legacy images without health metadata are accepted only if that actual API works. A running container alone is not enough. Download the latest installer and rerun update against the original directory; volumes and `.env` remain preserved.

The CI smoke test builds the production backend Docker image, runs it alongside the disposable MySQL service, and requires healthy status plus a successful login readiness API response.

## Custom Caddy HTTPS port, including 2095

Use `librelay domain panel.example.com --https-port 2095` to move the panel's HTTPS listener off 443. For an existing configured domain, `librelay domain --https-port 2095` reuses its hostname. The original standalone installer can also run `domain ... --https-port 2095 --install-dir /opt/tms`. The saved Caddy site address preserves its HTTPS port through panel updates and repeated domain setup; a new domain still defaults to 443. `librelay info` and domain status show the full HTTPS URL.

Frontend HTTP 2095 and Caddy HTTPS 2095 cannot bind the same panel-host socket. To keep public HTTPS on 2095, change `FRONTEND_PORT` in the original `.env` to an unused HTTP backup port such as 8080, run the latest installer `update`, then configure Caddy with `--https-port 2095`. Keep the original API port and credentials. New installations can use `--port 8080 --domain panel.example.com --https-port 2095` directly. HTTPS ports 80/2019 are reserved for Caddy's HTTP validation/admin listeners.

Caddy publishes TCP 80 and the selected HTTPS port only. For nonstandard HTTPS ports, TLS-ALPN validation is disabled and certificates use HTTP validation on TCP 80; keep port 80 externally accessible for issuance/renewal. Reality may then use TCP 443 on the same host. Browser access must include `https://panel.example.com:2095`; DNS alone does not remove the need for that port suffix. Subscription links generated through this origin include 2095, while proxy connection ports retain their independent Reality setting.

Existing Caddy bindings are distinguished from other occupied Docker/service ports. Conflicts fail before replacing configuration. The candidate is validated by Caddy before the old container is removed; startup failure attempts to restore the previous file/container binding. Certificate/data volumes remain retained. Regression checks cover legacy/default 443, custom 2095, conflicts, persistence and rollback. CI validates the actual Caddyfile and serves HTTPS 2095 with a separate TCP service occupying 443, using local test certificates instead of issuing public certificates.

## Occupied automatic internal port (40000+)

For VLESS-Reality, TCP 40000 usually refers to the automatically chosen private gateway, not its selected public port. Other new protocols may also use 40000+ as their automatically selected public listener. Earlier code chose the first database-unreserved port and stopped when the remote OS probe found a conflict. Allocation now skips real TCP/UDP bind conflicts and forwarding reservations, trying at most 25 unreserved candidates. Timeout, permission and unsupported-command errors stop immediately instead of repeatedly contacting an unavailable node.

This applies to new internal Reality gateways, explicit legacy Reality conversion and other automatically allocated protocol listeners. Existing ports/credentials stay intact, and explicitly selected public Reality ports are never silently changed. Update the panel backend and retry creation; no agent/schema migration is required for this fix. Regression tests cover multiple busy internal ports, unchanged public 443/8443, automatic VMess allocation, retry limits and timeout handling.

## Configure Reality

In protocol management, create VLESS-Reality and choose its node. The listening port field starts at **443**. Enter **8443** if desired. One-click and relay creation also expose the field. Submit the form; frontend and backend both enforce integer ports 1–65535. The backend checks database reservations and asks the selected remote node to probe TCP availability before applying the configuration.

Click any existing protocol's port to edit it. Credentials and existing user-forward identifiers are retained. Explicitly editing a legacy entry converts it to the public listener architecture; merely upgrading does not convert it or change its current port.

Generated sing-box `listen_port`, VLESS URI subscriptions consumed by v2rayN/v2rayNG, and Clash/Mihomo proxy exports use the same public port. Existing legacy subscriptions continue using their original per-user public forward ports. All protocol forms accept a custom public port; leaving it empty keeps automatic allocation (VLESS defaults to 443). New non-VLESS automatic listeners use an available 40000+ port. Allow TCP for VLESS/Trojan/VMess/AnyTLS, UDP for Hysteria2/TUIC, and both for Shadowsocks. SS-2022 public listeners use per-user identity keys with server-key:user-key client credentials, preserving individual metering. Existing AnyTLS URI export is supported; legacy Clash exports still omit AnyTLS for older-core compatibility.

## Database compatibility

Startup migration adds missing columns individually:

```sql
ALTER TABLE inbound ADD COLUMN public_listen TINYINT NOT NULL DEFAULT 0;
ALTER TABLE inbound ADD COLUMN egress_port INT NULL;
```

Fresh installations receive the same columns through `gost.sql`. There is no table recreation, drop, bulk port replacement or rewrite of existing rows. Existing rows default to legacy mode and retain listening ports, user ports, credentials, subscriptions, traffic settings and rate limits. `InboundUser.egressPort` is a transient configuration field and adds no database column.

New public Reality entries require the updated backend and agent. Downgrading after creating or converting such entries is unsupported by the old configuration generator; retain a pre-upgrade backup if rollback to old software is needed.

## Language and themes

The frontend is React, so localization uses **i18next + react-i18next**. `src/locales/zh-CN.json` and `en-US.json` cover pages, forms, menus, validation, dialogs, table columns, status labels, notifications and common backend errors. Browser locales starting with `zh` default to Chinese; all others default to English. The language picker persists `tms.language` in localStorage, updates the document locale and rerenders translated components without a refresh. React Aria receives the selected locale too.

Only **Light/浅色** and **Dark/深色** remain. Theme selection persists across refreshes, with neutral white/dark backgrounds and the original layouts. Old decorative skin selections map to their former light/dark base. An early startup script applies the saved theme before React renders.

Raw upstream engine diagnostics and dynamic external challenge content may retain their source language; protocol identifiers and API error sentinels are intentionally unchanged.

## Validation and practical limits

| Requested scenario | Verification |
| --- | --- |
| New Reality with omitted port → TCP 443 | Backend regression; browser default field |
| Explicit 8443 in listener/subscription/client export | Backend config, URI and Clash regression; browser field |
| Existing 20000 preserved | Legacy mode regression and additive migration inspection |
| TCP conflict on selected node rejected | Backend mocked command failure plus real node socket probe test |
| UDP occupied, same TCP port available | Real Go TCP/UDP probe regression |
| Default panel 2095 | Installer regression and all Compose renderings |
| `--port 8080` / `-p` custom port | Installer CLI regression |
| Chinese → English | Catalog unit test and real browser smoke test |
| English → Chinese | Catalog unit test and real browser smoke test |
| Light/Dark and persistence | Unit test and real browser reload test |
| Docker restart preserves all data/settings | Persistent-volume/config inspection; live restart **not run** |
| Subscription matches selected Reality port | Backend URI/Clash regression |

Backend: **8 JUnit tests**, successful Maven package. Frontend: **5 tests**, TypeScript check and successful production Vite build. Go: **4 socket tests**, SOCKS/config package compilation, successful Linux agent cross-build. The real private SOCKS regression sends TCP and UDP traffic through the chain, verifies counters, and exercises pause/resume/delete with node protocol blocking enabled. A generated Reality configuration passes the real `sing-box check` command.

All three Compose variants render successfully. Installer regression and Bash syntax checks pass. `git diff --check` passes. ShellCheck is unavailable in the local environment. No live Docker daemon, Linux VPS installation, MySQL restart/upgrade against production data, or interactive v2rayN/v2rayNG client was available; these scenarios are not claimed as end-to-end tested. The frontend build still reports its large bundle warning.

The remote availability probe cannot reserve a port indefinitely against unrelated processes. Configuration installation checks sing-box syntax and service startup, and restores the previous config if startup fails. A final operational check on actual panel/node VPS machines remains necessary before production rollout.

See [IMPLEMENTATION_HANDOFF.md](IMPLEMENTATION_HANDOFF.md) for the complete changed-file inventory and diff summary.

## Branding compatibility

Librelay is the project name and `librelay` is the primary management command. Installation and update also retain `tms` as a compatibility alias. Repository URLs, `/opt/tms`, legacy `TMS_*` environment variables, language storage, database names, container names and volumes remain unchanged. No database migration is required. New databases seed the panel name as Librelay; the frontend displays the previous default TMS as Librelay while preserving other administrator-defined names.
