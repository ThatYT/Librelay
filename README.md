# Librelay

**Liberty + relay · 自由连接，多节点管理 · Multi-node proxy management**

[中文](#中文) · [English](#english) · [GitHub Actions](https://github.com/ThatYT/Librelay/actions) · [Releases](https://github.com/ThatYT/Librelay/releases)

## 中文

Librelay 是基于 [Teminuosi/Tms](https://github.com/Teminuosi/Tms) 的多节点代理管理面板。一台面板 VPS 可以管理多台远程节点，提供协议管理、中转、端口转发、用户订阅、流量配额、限速和到期控制。

### 主要功能

- 支持 VLESS-Reality、Trojan、VMess（TCP / WebSocket）、Shadowsocks、Hysteria2、TUIC、AnyTLS。
- 所有协议均可设置监听端口，范围 **1–65535**；新 VLESS-Reality 默认 **443/TCP**，其他协议留空时自动分配。升级保留已有协议端口。
- sing-box 实际监听端口与订阅、兼容客户端导出的端口保持一致。通用订阅与 Clash / Mihomo 导出按协议和客户端支持情况使用；当前 Clash 导出不包含 AnyTLS。
- 面板默认 **2095/TCP**，后端 API 默认 **6365/TCP**。面板和代理节点可以部署在不同服务器。
- 前端支持 **中文 / English**，主题仅提供 **浅色 / 深色**，手动选择会保存。
- 安装、更新默认使用 GitHub CI 预构建镜像与节点二进制，VPS 无需本机编译。

版本采用数字格式，如 **1.1.0**。根目录 `VERSION` 是统一版本来源，面板界面不再追加提交哈希。发布记录见 [GitHub Releases](https://github.com/ThatYT/Librelay/releases)。后续功能版本更新第二位，修复版本更新第三位；构建提交仅用于内部镜像匹配和回滚。手工 Docker 构建时传入 `--build-arg APP_VERSION=$(cat VERSION)`；安装器和 CI 会自动传入。

### 一键安装面板

在面板 VPS 上以 **root** 执行。支持 Debian / Ubuntu / Raspbian、Fedora、CentOS / RHEL / Rocky / AlmaLinux。当前默认 MySQL 5.7 完整部署使用 **amd64 VPS**；节点二进制支持 amd64 和 arm64。如果没有 `curl`，先通过系统包管理器安装。

```bash
bash <(curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh)
```

默认安装目录为 `/opt/librelay`。交互提示 `Panel port [2095]:`，回车使用 2095；安装完成后访问 `http://服务器IP:2095`。初始账号和密码均为 `admin_user`，首次登录后请立即修改密码。

自定义面板端口，例如 8080（`-p 8080` 与 `--port 8080` 等效）：

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh --port 8080 --install-dir /opt/librelay
```

可用参数：`--port` / `-p`、`--domain`、`--https-port`、`--install-dir`、`--source`。`--port` 只用于新安装；已有安装修改原 `.env` 的 `FRONTEND_PORT` 后再更新。`--source` 显式启用本机编译，要求至少 2.5 GiB 可用内存加空闲 Swap，默认安装不需要这一步。

### 如何更新面板

安装或更新前，先在 [GitHub Actions](https://github.com/ThatYT/Librelay/actions) 确认 **Build and publish panel images** 已成功。节点安装或更新还需等待 **Node binaries** 成功。更新使用原 `.env` 保存的仓库和分支／提交设置。

已安装新版管理命令时，执行：

```bash
librelay export
librelay update
librelay status
librelay info
```

`export` 将数据库备份写入原安装目录；它是备份操作，不会删除数据库。旧版只有 `tms` 命令时，可以先使用 `tms export`。

**新版默认目录 `/opt/librelay`：** 下载最新脚本并更新，适用于尚未安装管理命令或需要刷新旧脚本的情况。

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh update --install-dir /opt/librelay
```

**旧安装目录 `/opt/tms`：** 保持原目录执行，不要重新安装到 `/opt/librelay`。

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh update --install-dir /opt/tms
```

如果使用了自定义目录，将 `--install-dir` 后的路径替换为原来的安装目录。更新保留用户、节点、协议、订阅、流量设置、限速、`.env`、数据库卷和 Caddy 证书；旧面板端口也不会自动改为 2095。已知旧仓库地址会迁移到 `ThatYT/Librelay`，迁移前保存私有备份 `.env.before-librelay`。`tms` 和旧 `TMS_*` 变量仍作为兼容入口保留。

更新日志位于原安装目录的 `.librelay-last-deploy.log`。镜像下载失败时保留当前服务；启动检查失败会尝试恢复上一个 Compose 配置和容器。更新不要使用 `purge`、`docker compose down -v`，也不要删除 MySQL 卷或覆盖现有 `.env`。

### 安装与更新节点

在面板中新增节点，填写节点 IP，然后点击该节点的「安装」，将生成的命令复制到对应节点 VPS，以 root 执行。命令包含面板地址和该节点的专属密钥；节点不需要 Docker。

更新节点时，在已更新的面板中重新复制该节点的安装命令，并在原节点上重新执行。默认下载对应提交的预构建文件并校验 SHA-256，保留已有节点配置和证书。升级面板不会自动升级远程节点；使用新公开监听功能前也要更新节点代理。

节点安装/更新会同步准备 sing-box、验证配置、修复 systemd 服务，并确认 gost 与 sing-box 都已启动且开机自启后才报告成功。首次安装使用不开放任何代理监听端口的空配置；已有协议、端口、密钥和证书保持不变。若已有配置无效或端口被占用，安装器报错并保留配置，请按输出的日志命令排查，不会用空配置覆盖旧协议。

面板地址支持 `https://panel.example.com:2095`，节点 WebSocket 使用 WSS，流量和配置上报使用 HTTPS。安装时未写协议的 `host:port` 会先检测 HTTPS，再检查兼容的 HTTP；显式 URL 保留原协议，TLS 证书正常校验。遇到连接失败，请在网站配置中填写完整公开面板 URL，重新生成节点安装命令后执行。

### 用户限速与流量

在「用户管理 → 新增/编辑」设置账号总限速（Mbps）、账号总流量（GiB）和每月重置日。速度和流量填 `0` 表示不限制，重置日 `0` 表示不自动重置。协议、线路和隧道分配只控制访问权限。

所有节点、协议的上传与下载共用账号速度和流量额度。速度固定平分到该用户已预留的节点：100 Mbps / 两台节点 = 每台 50 Mbps，节点上的多个协议共享这 50 Mbps。空闲或离线节点的预算不会自动借给其他节点；删除线路也不会自动回收节点预留，以免离线旧节点继续使用时突破总上限。限速是令牌桶的持续速度上限，允许少量短时突发。

升级后，**先更新远程节点代理，再编辑旧用户并保存统一设置**。迁移只增加字段；已有用量、凭据、端口和订阅地址保留，旧线路/隧道/转发套餐不再叠加。旧用户在保存前仍按原套餐运行，界面会提示迁移。修改限速或增加节点需要已有预留节点在线；失败时会报出节点，先前完成的收紧可能已生效，恢复节点后重试。

账号流量耗尽后暂停该用户的服务。重置用量或增加额度后，只恢复因账号额度暂停的服务，手动停用的服务保持停用。管理员在用户管理中选择双向（上传＋下载）、单向仅下载或单向仅上传，并设置计费倍率（0–1000，最多 4 位小数；0 不扣流量）。账号计费用量＝选定方向流量 × 倍率，不叠加旧隧道倍率。旧账号默认双向 ×1，参数仅影响之后上报的流量；保留的历史计费用量不重算。普通用户界面不显示限速，管理员仍可设置账号限速。小数倍率的不足 1 字节部分会持久累计，重置用量时一起清零。流量由节点批量上报，断连期间或上报间隔内可能超额，恢复连接后重新检查。

### 端口与域名

| 服务 | 默认端口 | 所属服务器 |
| --- | --- | --- |
| 面板 Web UI | TCP 2095 | 面板 VPS |
| 后端 API | TCP 6365 | 面板 VPS |
| Caddy HTTPS | TCP 443（另需 TCP 80） | 面板 VPS |
| 新 VLESS-Reality | TCP 443 | 选中的代理节点 |

在协议管理中选择目标节点并设置监听端口，例如 443 或 8443。TCP/TCP 或 UDP/UDP 在同节点同端口会冲突；TCP 443 与 UDP 443 可以共存。面板 Caddy 使用 443 不影响另一台 VPS 上的 Reality 443。Reality 监听端口与转发机端口范围是独立设置。

普通面板 HTTPS 域名：先将域名解析到面板 VPS，并确保 TCP 80/443 可用。

```bash
librelay domain panel.example.com
```

如果同一台 VPS 需要将 TCP 443 留给 Reality，新安装可让前端 HTTP 用 8080、Caddy HTTPS 用 2095：

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh --port 8080 --domain panel.example.com --https-port 2095 --install-dir /opt/librelay
```

访问地址为 `https://panel.example.com:2095`。已有安装的迁移步骤与反向代理配置见 [中文详细指南](docs/GUIDE.zh-CN.md) 和 [反向代理说明](docs/反向代理.md)。非标准 HTTPS 端口的证书签发仍需要 TCP 80；Cloudflare 的 2095 端口不支持代理 HTTPS，应使用仅 DNS 模式。

### 常用命令与手机端

| 命令 | 作用 |
| --- | --- |
| `librelay` | 打开管理菜单 |
| `librelay status` / `librelay info` | 查看状态、地址和部署信息 |
| `librelay update` | 更新面板 |
| `librelay export` | 导出数据库备份 |
| `librelay domain 域名` / `librelay domain off` | 配置或关闭面板 HTTPS 域名 |
| `librelay purge` | 卸载并删除数据库等数据，属于破坏性操作 |

Android / iOS 工程用于手机管理面板，保存和切换面板地址，不提供 VPN 代理核心。浏览器也可以直接使用面板。Android 已有测试 APK 和未签名 Release APK；iOS 尚未完成构建与发布验证。见 [Android 构建及签名说明](android-app/README.md) 和 [Releases](https://github.com/ThatYT/Librelay/releases)。

### 文档与验证

- [中文详细指南：故障排查、域名、备份与卸载](docs/GUIDE.zh-CN.md)
- [英文部署与升级说明](docs/DEPLOYMENT.md)
- [实现和兼容性说明](docs/IMPLEMENTATION_HANDOFF.md)

GitHub Actions 检查后端、前端、节点、安装脚本、Compose、sing-box 配置及 Caddy；镜像工作流验证新安装、重启和旧安装更新的数据保留。Android 工作流检查单元测试、lint 和 APK 打包，尚未运行真机或模拟器测试。

## English

Librelay is a multi-node proxy management panel forked from [Teminuosi/Tms](https://github.com/Teminuosi/Tms). One panel VPS can manage multiple remote proxy nodes, with protocol management, relay routing, port forwarding, user subscriptions, traffic quotas, rate limits and expiry controls.

### Features

- VLESS-Reality, Trojan, VMess (TCP / WebSocket), Shadowsocks, Hysteria2, TUIC and AnyTLS.
- Custom listening ports for all protocols, from **1 to 65535**. New VLESS-Reality entries default to **TCP 443**; other protocols allocate a port automatically when left blank. Upgrades preserve existing ports.
- sing-box listening ports match subscriptions and supported client exports. Use generic subscriptions or Clash / Mihomo exports according to protocol/client compatibility; current Clash exports omit AnyTLS.
- Default panel port **TCP 2095**, backend API **TCP 6365**. The panel and proxy nodes can run on separate servers.
- **Chinese / English** UI and **Light / Dark** themes, with saved manual selections.
- Installation and updates use CI-built images and node binaries by default, without compiling on your VPS.

Versions use numeric identifiers such as **1.1.0**. The root `VERSION` file is the single version source; the panel no longer appends commit hashes. See [GitHub Releases](https://github.com/ThatYT/Librelay/releases) for release history. Increment the minor number for features and the patch number for fixes; commit identifiers remain internal for matching images and rollback. Manual Docker builds should pass `--build-arg APP_VERSION=$(cat VERSION)`; the installer and CI supply it automatically.

### Install the panel

Run as **root** on the panel VPS. Supported distributions: Debian / Ubuntu / Raspbian, Fedora, CentOS / RHEL / Rocky / AlmaLinux. The default full deployment uses an **amd64 VPS** because bundled MySQL 5.7 is amd64-only; node binaries support amd64 and arm64. Install `curl` through your package manager first if needed.

```bash
bash <(curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh)
```

The default directory is `/opt/librelay`. At `Panel port [2095]:`, press Enter for 2095. After installation, open `http://SERVER_IP:2095`. The initial username and password are both `admin_user`; change the password after signing in.

Choose a custom panel port, such as 8080 (`-p 8080` is equivalent to `--port 8080`):

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh --port 8080 --install-dir /opt/librelay
```

Options: `--port` / `-p`, `--domain`, `--https-port`, `--install-dir`, `--source`. `--port` applies only to new installations; existing installations should edit `FRONTEND_PORT` in their original `.env` before updating. `--source` explicitly enables local compilation and requires at least 2.5 GiB available RAM plus free swap. Default installation does not require local compilation.

### Update the panel

Before installing or updating, confirm that **Build and publish panel images** succeeded in [GitHub Actions](https://github.com/ThatYT/Librelay/actions). Node installation/updates also require **Node binaries** to succeed. Updates follow the repository and branch/commit settings stored in the original `.env`.

If the current management command is installed:

```bash
librelay export
librelay update
librelay status
librelay info
```

`export` writes a database backup into the original installation directory without deleting the database. If an older installation only has `tms`, use `tms export` to back up first.

**Current default directory `/opt/librelay`:** download the latest installer and run its update action when the management command is unavailable or its installed script needs refreshing.

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh update --install-dir /opt/librelay
```

**Legacy directory `/opt/tms`:** update in place; do not perform a fresh installation in `/opt/librelay`.

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh update --install-dir /opt/tms
```

For custom directories, replace the `--install-dir` path with the original directory. Updates preserve users, nodes, protocols, subscriptions, traffic settings, rate limits, `.env`, database volumes and Caddy certificates. Existing panel ports do not automatically change to 2095. The known old repository identity is migrated to `ThatYT/Librelay` after saving a private `.env.before-librelay` backup. The `tms` command and legacy `TMS_*` variables remain compatibility aliases.

Progress is logged to `.librelay-last-deploy.log` in the installation directory. Failed image downloads leave current services running; failed startup checks attempt to restore the previous Compose configuration and containers. Do not use `purge`, `docker compose down -v`, delete MySQL volumes or replace existing `.env` credentials as part of an update.

### Install and update nodes

Add a node in the panel, enter its IP, then click its installation action. Copy the generated command and run it as root on that specific node VPS. It contains the panel address and the node's own secret. Nodes do not require Docker.

To update a node, copy its installation command again from the updated panel and rerun it on the original node. The installer downloads the matching prebuilt binary, verifies SHA-256 and preserves node configuration/certificates. Updating the panel does not automatically upgrade remote agents; update agents before using new public listening features.

Panel addresses support `https://panel.example.com:2095`: the node uses WSS for its connection and HTTPS for traffic/config reports, with certificate verification enabled. For a scheme-less `host:port`, installation probes HTTPS first, then compatible HTTP; explicit URLs preserve their scheme. If connection fails, set the complete public panel URL in site settings, regenerate the node installation command, and rerun it.

Node installation/update prepares sing-box synchronously, validates its configuration, repairs its systemd service, and reports success only when both gost and sing-box are running and enabled at boot. Fresh nodes start with an empty config that opens no proxy listening ports. Existing protocols, ports, credentials and certificates are retained. Invalid existing configs or occupied ports produce an error with log instructions; existing protocols are never replaced with an empty config.

### Per-user speed and traffic limits

Use **User Management → Add/Edit** to set the account speed (Mbps), traffic quota (GiB), and monthly reset day. `0` means unlimited for speed/quota and no automatic reset for the reset day. Assigning protocols, lines or tunnels grants access without creating another plan.

Upload and download across all nodes and protocols share the account budget. Speed is evenly reserved across the user's assigned nodes: 100 Mbps across two nodes gives each node a shared 50 Mbps budget for all its protocols. Idle/offline reservations are not borrowed; deleting a line does not reclaim its node's reservation, since an offline agent might still be serving traffic. The token bucket caps sustained throughput with a small burst allowance.

After upgrading, **update remote agents, then edit each legacy user and save the unified policy**. Additive migrations retain usage, credentials, ports, subscription URLs and legacy records. Legacy line/tunnel/forward plans stop applying once enabled; existing users keep their old behavior until that save, with a visible migration notice. Changing speed or adding a node requires the existing reserved nodes to be online. Errors identify the node; reductions already acknowledged can remain in effect until you retry.

Exhausting the account quota pauses that user's services. Resetting usage or increasing the quota resumes quota-paused services while preserving manual pauses. Administrators select both directions, download only, or upload only in User Management and set a multiplier (0–1000, up to 4 decimal places; 0 means no quota charge). Account billed usage equals selected traffic × multiplier, without legacy tunnel multipliers. Existing accounts default to both directions ×1; policy changes apply to future reports and retain historical billed counters. Ordinary users do not see speed caps; administrators can still configure them. Fractional bytes persist across reports and are cleared with usage resets. Batched node reporting and disconnections can allow quota overshoot; enforcement retries after reconnect.

### Ports and domains

| Service | Default port | Server |
| --- | --- | --- |
| Panel Web UI | TCP 2095 | Panel VPS |
| Backend API | TCP 6365 | Panel VPS |
| Caddy HTTPS | TCP 443 (also needs TCP 80) | Panel VPS |
| New VLESS-Reality | TCP 443 | Selected proxy node |

Choose the target node and listening port, such as 443 or 8443, in protocol management. TCP/TCP or UDP/UDP listeners conflict on the same node/port; TCP 443 and UDP 443 can coexist. Caddy on the panel's 443 does not block Reality 443 on another VPS. Reality listening ports are separate from transfer-machine port ranges.

For standard panel HTTPS, point the domain at the panel VPS and make TCP 80/443 available:

```bash
librelay domain panel.example.com
```

To reserve TCP 443 for Reality on the same VPS, a new installation can use HTTP frontend 8080 and Caddy HTTPS 2095:

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Librelay/main/panel_install.sh -o /tmp/librelay.sh
bash /tmp/librelay.sh --port 8080 --domain panel.example.com --https-port 2095 --install-dir /opt/librelay
```

Open `https://panel.example.com:2095`. See the [deployment guide](docs/DEPLOYMENT.md) for changing an existing installation and configuring reverse proxies. Certificate issuance on a nonstandard HTTPS port still needs TCP 80. Cloudflare does not proxy HTTPS on 2095; use DNS-only mode for that HTTPS port.

### Commands and mobile apps

| Command | Purpose |
| --- | --- |
| `librelay` | Open the management menu |
| `librelay status` / `librelay info` | Show status, access URLs and deployment information |
| `librelay update` | Update the panel |
| `librelay export` | Export a database backup |
| `librelay domain DOMAIN` / `librelay domain off` | Configure or disable panel HTTPS |
| `librelay purge` | Uninstall and delete data, including the database; destructive |

The Android / iOS projects are mobile panel-management wrappers that store and switch panel addresses. They do not contain a VPN proxy core, and you can also use a browser. Android test APKs and unsigned release APKs are available; the iOS build/release has not been verified. See the [Android build/signing guide](android-app/README.md) and [Releases](https://github.com/ThatYT/Librelay/releases).

### Documentation and validation

- [Deployment and upgrade guide](docs/DEPLOYMENT.md)
- [Detailed Chinese guide: troubleshooting, domains, backups and removal](docs/GUIDE.zh-CN.md)
- [Implementation and compatibility notes](docs/IMPLEMENTATION_HANDOFF.md)

GitHub Actions checks the backend, frontend, node agent, installer scripts, Compose, sing-box configurations and Caddy. Image workflows verify fresh installation, restart and data-preserving legacy updates. Android checks include unit tests, lint and APK packaging; physical-device/emulator testing is not included.

## Attribution / 开源署名

Based on [Teminuosi/Tms](https://github.com/Teminuosi/Tms), [go-gost/gost](https://github.com/go-gost/gost), [go-gost/x](https://github.com/go-gost/x) and [sing-box](https://github.com/SagerNet/sing-box). See [LICENSE](LICENSE) and the respective third-party licenses. Use only for authorized purposes. / 请仅用于合法、获授权的用途。
