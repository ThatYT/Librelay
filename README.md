# TMS EN · 多节点代理面板

> 基于 [Teminuosi/Tms](https://github.com/Teminuosi/Tms) 的 fork，支持多节点管理、自定义 VLESS-Reality 端口、中文/English 界面及浅色/深色主题。

---

## 本 fork 的主要变化

- 新建 VLESS-Reality 默认监听 **443/TCP**，创建和编辑时可以选择 **1–65535** 的端口。
- sing-box、订阅以及 v2rayN / v2rayNG / Clash / Mihomo 导出使用同一个实际监听端口。
- 旧 Reality 条目保留原端口；其他协议继续使用原来的自动分配方式。
- 新装面板默认 **2095/TCP**，后端 API 默认 **6365/TCP**；旧安装保留 `.env` 中的端口。
- 一条命令从本仓库安装，支持端口、域名和安装目录参数；更新保留数据库和配置。
- 界面支持 **中文 / English**，主题仅保留 **浅色 / 深色**，选择会保存到浏览器。

完整架构、升级步骤、数据库迁移和验证范围见 [部署与升级说明](docs/DEPLOYMENT.md)，逐文件改动见 [实现交接说明](docs/IMPLEMENTATION_HANDOFF.md)。

## 能做什么

| | 说明 |
|---|---|
| **协议管理** | 一键搭全套协议(VLESS-Reality / Trojan / VMess / Hysteria2 / TUIC / AnyTLS),出订阅给用户 |
| **中转** | 前置机搭协议 + 落地出口(住宅 socks / 机场节点 / 自己的节点),给用户干净出口 IP,自带在线测落地 |
| **端口转发 / 隧道转发** | 通用端口搬运、两级加密中转 |
| **限速 / 流量 / 到期** | 每个用户独立限速(TCP + UDP 都限)、流量配额、到期时间 |
| **订阅按线路** | 一个用户可以有多条订阅,直连 / 各中转各自独立,互不影响 |
| **中央管理** | 一台面板管所有转发机,节点一条命令上线 |

订阅同时支持两种格式:**通用**(v2rayN / 小火箭 / v2rayNG)和 **Clash / Mihomo**(Clash Verge、ClashMeta)。

<sub>本项目基于 [go-gost/gost](https://github.com/go-gost/gost) 和 [go-gost/x](https://github.com/go-gost/x) 两个开源库。</sub>


## 部署

要装两样东西:

| | 装在哪 | 装什么 | 需要 Docker |
|---|---|---|---|
| **面板端** | 一台机器即可 | 中央管理面板 | 是(脚本自动装) |
| **节点端** | 每台转发机 | gost 裸二进制 | 否 |

<br>

### 第一步 · 装面板端

在面板 VPS 上以 **root** 执行。支持 Debian / Ubuntu / Raspbian、Fedora、CentOS / RHEL / Rocky / AlmaLinux；需要能够访问 GitHub 和构建依赖源。

```bash
bash <(curl -Ls https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh)
```

如果系统尚未安装 curl，先用系统包管理器安装 curl。脚本会检查并安装其他必要工具、Docker 和 Docker Compose 插件，然后从本仓库下载源码并构建面板。默认安装目录为 `/opt/tms`，首次构建需要一定的时间和内存。

交互安装时会提示：

```text
Panel port [2095]:
```

直接回车使用 **2095**，也可以输入其他未被占用的 TCP 端口。安装结束会打印访问地址 `http://服务器IP:面板端口`。默认账号和密码均为 **admin_user**，首次登录后请立即修改密码。

#### 指定端口、域名与目录

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh -o /tmp/tms.sh
bash /tmp/tms.sh --port 8080 --install-dir /opt/tms --domain panel.example.com
```

| 参数 | 作用 | 默认值 |
|---|---|---|
| `--port PORT` / `-p PORT` | 新安装的面板公开端口，范围 1–65535 | `2095` |
| `--domain DOMAIN` | 安装后配置面板 HTTPS 域名 | 不设置 |
| `--install-dir PATH` | 面板安装目录 | `/opt/tms` |

指定域名前，需要将域名解析到面板 VPS，并确保该机器的 TCP 80/443 空闲。面板公开端口和后端 API 端口必须不同；配置 Caddy 时，也不能占用它需要的 80/443。

如果部署自己的另一个 fork，统一设置仓库变量：

```bash
export GITHUB_REPO="OWNER/REPO"
export GITHUB_REF="main"
bash <(curl -Ls "https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/panel_install.sh")
```

仓库信息会保存到 `.env`，并用于后续更新和面板生成的节点安装命令。

<br>

### 第二步 · 装节点端

**不用手敲命令,在面板里生成:**

```
登录面板 → 左侧「转发机监控」→「新增」填这台机器的 IP → 保存
        → 点该机器的「安装」→ 复制弹出的命令 → 到那台机器上执行
```

弹出的命令已经带好了「面板地址 + 该机器专属密钥」,全自动、无需手输。

> [!NOTE]
> 密钥是**新增转发机时才生成的、只有面板知道**,所以节点端命令必须从面板里拿,
> 没法自己拼出来。

<br>

> [!NOTE]
> 节点默认下载 GitHub CI 为所选仓库分支提交构建的 Linux amd64 / arm64 二进制，替换前校验 SHA-256；无需在 VPS 上安装 Go 或编译依赖。刚推送新提交时，请等待「Node binaries」workflow 发布完成再装节点。网络受限时仍需保证 GitHub API 和 Release 文件可以访问。

#### 节点安装提示磁盘不足或编译进程被杀死

旧脚本默认在 VPS 的临时目录编译，可能出现 `no space left on device` 或 `signal: killed`。最新版默认使用预编译文件，检查目标盘至少有 128 MiB 空闲空间；下载或校验失败不会替换现有代理和配置，也不会自动退回源码编译。

先用 `df -h / /tmp /var/tmp` 和 `free -h` 检查资源，再重新执行面板生成的节点安装命令（它会下载最新脚本）。不要删除面板 MySQL 数据卷或节点 `/etc/gost` 来腾空间。

如确需源码编译，在安装命令前设置 `TMS_NODE_SOURCE=1`。默认构建目录为 `/var/tmp`，可用 `TMS_NODE_BUILD_DIR` 指向已有目录；脚本检查至少 3 GiB 空闲，限制编译并发为 1，并把构建缓存和工作文件放在该目录。`TMS_NODE_RELEASE` 可固定到包含校验清单的 Release 标签。

<details>
<summary>手动装节点端(不推荐)</summary>

<br>

也可以直接在机器上跑裸命令,它会**交互式询问**面板地址和密钥
(密钥同样得先在面板「转发机监控」新增该转发机才有):

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/install.sh -o /tmp/tms-node.sh
GITHUB_REPO=ThatYT/Tms_EN bash /tmp/tms-node.sh
```

</details>

<br>

### 装完之后 · tms 命令

面板机上会生成一个 `tms` 命令(类似 x-ui),直接输入打开管理菜单:

```bash
tms
```

也可以带参数直接用:

| 命令 | 作用 |
|---|---|
| `tms` | 打开管理菜单 |
| `tms update` | 更新面板到最新版 |
| `tms status` | 查看运行状态 |
| `tms info` | 查看访问地址 / 账号 |
| `tms domain 域名` | 给面板配域名 + HTTPS |
| `tms domain` | 查看当前域名状态 |
| `tms domain off` | 关闭域名,回到 IP:端口 |
| `tms export` | 导出数据库备份 |
| `tms purge` | 彻底清理(卸载并清空容器 / 镜像 / 卷 / 命令) |

---

## 旧安装升级

先备份数据库，再下载本 fork 的新脚本。将下方 `/PATH/TO/EXISTING/TMS` 替换为原安装目录。第一次切换到本版本时，请不要依赖旧版 `tms update` 脚本。

```bash
tms export
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh -o /tmp/tms.sh
bash /tmp/tms.sh update --install-dir /PATH/TO/EXISTING/TMS
```

- 使用原来的安装目录，保留 `.env` 和 MySQL 数据卷。不要用 `.env.example` 覆盖现有数据库凭据或 JWT 密钥。
- 如果 `.env` 已有 `GITHUB_REPO`，请确认其指向 `ThatYT/Tms_EN` 或你实际使用的 fork。
- 更新不会删除用户、节点、协议、订阅或限额设置，也不会将旧面板端口 6366 自动改成 2095。
- 数据库启动迁移只添加缺失的 `inbound.public_listen` 和 `inbound.egress_port` 列，旧记录保留原来的监听和订阅端口。
- 更新面板后，在面板中重新复制各节点的安装命令，更新远程节点代理，再使用新 Reality 监听功能。
- 后续更新可以直接运行 `tms update`。重复执行安装不会覆盖已有 `.env`，而会提示使用更新命令。

要修改已有面板的公开端口，先确认新端口在面板 VPS 上空闲，再修改原 `.env` 的 `FRONTEND_PORT` 并执行 `tms update`。`--port` / `-p` 仅用于新安装。

创建或转换为新公开监听模式的 Reality 条目依赖新版后端和节点代理；之后直接降级到旧版不受支持。完整备份与兼容性说明见 [部署与升级说明](docs/DEPLOYMENT.md)。

## 登录报错：`vite_config` 表不存在

这说明 MySQL 已启动，但初始化 SQL 没有完成。已修复安装时 SQL 文件权限导致容器无法读取的问题：`.env` 保持仅 root 可读，公开的 `gost.sql` 允许 MySQL 进程读取。安装器还会检查全部必要表，而不是只确认数据库进程存活。

新版后端可自动补齐缺失表；完整数据库不会重新初始化。已有账号、密码、节点、订阅和协议端口保持不变；只有空的用户表才会生成初始管理员。不要通过删除数据库卷来修复。

如果你已遇到此错误，请保留原 `.env` 和 MySQL 卷，下载新脚本并升级（替换下方原安装目录）：

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh -o /tmp/tms.sh
bash /tmp/tms.sh update --install-dir /PATH/TO/EXISTING/TMS
```

若仍然失败，检查 `docker logs gost-mysql --tail 80` 和 `docker logs springboot-backend --tail 80`。不要公开数据库密码或 `.env` 内容。

## 更新报错：后端健康状态 `unknown`

旧源码版镜像没有 Docker `HEALTHCHECK`，旧更新脚本却一直等待 `healthy`，可能误报超时及“容器不存在”。新版镜像已加入健康检查；安装器也会直接调用登录使用的验证码状态 API，确认数据库查询成功后才继续。旧镜像即使没有健康字段，也只在实际 API 可用时通过。

遇到该错误时，保留原目录和数据库，下载最新 `panel_install.sh` 后重新执行上方的更新命令即可。

## VLESS-Reality 自定义端口

在「协议管理」中创建 VLESS-Reality，选择要运行协议的节点。监听端口默认为 **443**，也可以输入 **8443** 等端口。一键创建和中转创建同样提供该字段；点击已有 Reality 条目的端口可以修改。

| 选择的端口 | sing-box 实际监听 | 订阅 / 客户端导出 |
|---|---|---|
| `443` | TCP 443 | `443` |
| `8443` | TCP 8443 | `8443` |

前端和后端都验证整数及范围。端口占用由**所选节点**检查：同节点同端口 TCP/TCP 或 UDP/UDP 冲突，TCP 443 和 UDP 443 可以共存。需要在节点防火墙及安全组放行所选 TCP 端口。

**面板服务器与节点可以是不同机器：**

```text
面板 VPS：443/TCP → Caddy，2095/TCP → 面板，6365/TCP → API
美国节点：443/TCP → VLESS-Reality
香港节点：8443/TCP → VLESS-Reality
```

以上部署合法，面板 Caddy 的 443 不会阻止远程节点使用 Reality 443。Reality 监听端口与转发机端口范围是独立设置；内部计量端口不改变公开订阅端口。单纯升级不会转换旧条目，只有显式修改旧 Reality 端口才会切换到新公开监听模式。

## 语言与主题

界面通过语言选择器切换 **中文 / English**。浏览器语言为中文时默认中文，其他语言默认 English；手动选择保存在 localStorage，刷新后继续生效。主要页面、表单、弹窗、表头、状态、验证和通知使用 React i18next 翻译，资源位于 `vite-frontend/src/locales/`。

主题选择器只提供 **浅色 / Light** 和 **深色 / Dark**。两种主题均为中性背景，保留原组件布局，选择会保存；旧装饰主题自动映射为对应的浅色或深色。原始引擎诊断和外部动态验证内容可能仍使用来源语言。

## 构建与验证

已通过后端 8 项测试、前端 5 项测试、Go socket 4 项测试、后端/前端生产构建、Linux 节点构建、浏览器语言与主题切换、sing-box 配置检查、安装脚本回归及三种 Compose 配置验证。[GitHub Actions](https://github.com/ThatYT/Tms_EN/actions) 会继续执行自动检查。

本地环境没有 Docker daemon，尚未验证真实 VPS 安装、生产 MySQL 升级和 Docker 重启后的数据持久性；ShellCheck 也未在本地运行。建议先在测试 VPS 完成安装和重启验证，再升级生产环境。完整的 12 项场景验证范围见 [部署与升级说明](docs/DEPLOYMENT.md)。

## 域名配置

面板和转发机的域名是**两件独立的事**,解决的问题也不一样。

### 一、给面板套域名(HTTPS)

新安装默认通过 `http://IP:2095` 访问（自定义端口或旧安装使用 `.env` 中的实际端口）,浏览器会标"不安全"。配了域名之后走 HTTPS,**订阅链接也会跟着变成域名**。

```bash
tms domain panel.example.com
```

背后用 Caddy 自动申请和续期 Let's Encrypt 证书,会依次检查:域名解析是否指向本机 → 80/443 有没有被占 → 写配置 → 起 Caddy → 等证书签发(最多 60 秒)。

**前置条件:**
- 域名已经解析(A 记录)到面板服务器
- 80 和 443 端口空闲(装了宝塔的话先停掉它的 nginx)
- 云服务器安全组放行 80、443

> 💡 原来的 `IP:面板端口` 会保留作为备用入口,域名出问题时还能进得去。
>
> ⚠️ 配了域名后,**已经发出去的旧订阅(IP 版)不会自动更新**,要让车友重新拉一次。所以建议装好就配,人越少越好办。

### 面板 HTTPS 用 2095，同机 Reality 用 443

可以把 Caddy 的 HTTPS 改到 **2095**。当前前端 HTTP 入口默认也占用 2095，所以应先将 HTTP 备用入口移到另一个空闲端口（以下示例为 8080）。保持后端 API 为原来的 6365。

在面板 VPS 上执行（示例使用默认目录 `/opt/tms`，自定义目录请替换）：

```bash
cp -p /opt/tms/.env /opt/tms/.env.before-https-port
sed -i 's/^FRONTEND_PORT=.*/FRONTEND_PORT=8080/' /opt/tms/.env
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh -o /tmp/tms.sh
bash /tmp/tms.sh update --install-dir /opt/tms
bash /tmp/tms.sh domain panel.example.com --https-port 2095 --install-dir /opt/tms
```

请将 `panel.example.com` 替换为你的域名，并先确认 TCP 8080/2095 在面板机器上可用。云安全组和防火墙需要放行 **TCP 80、2095**：80 用于证书申请与续期，2095 用于面板 HTTPS。此时 Caddy 不占用 443，你可以在同机创建/编辑 Reality 使用 TCP 443。

| 服务 | 端口 | 访问方式 |
|---|---|---|
| Caddy / 面板 HTTPS | 2095 | `https://panel.example.com:2095` |
| 前端 HTTP 备用入口 | 8080 | `http://服务器IP:8080` |
| 后端 API | 6365 | 保持原节点对接地址 |
| 同机 Reality | 443 | VLESS 客户端连接 |

安装好最新版脚本后，也可以用 `tms domain panel.example.com --https-port 2095`。已有域名时，`tms domain --https-port 2095` 会直接使用原域名。不指定新端口重新配置同一个域名时，会保留已选端口；普通新域名仍默认 HTTPS 443。新安装可以同时指定 `--port 8080 --domain panel.example.com --https-port 2095`。

通过新 HTTPS 地址登录后，面板生成的订阅链接会包含 `:2095`。已分发的旧订阅地址需要更新；订阅下载端口与 Reality 的实际连接端口是两个独立设置。配置通过验证后才重启 Caddy，启动失败时尝试恢复旧配置；已有证书卷和数据库保留。

### 二、给转发机配域名(不让车友看到你的 IP)

车友拿到订阅后,能在客户端里看到每个节点的地址。默认显示的是**转发机的真实 IP**。

在「转发机」→ 编辑 → **连接域名(可选)** 里填一个域名,车友看到的就变成域名了:

```
美国机   us.example.com   →  解析到 203.0.113.10
香港机   hk.example.com   →  解析到 203.0.113.20
国内机   cn.example.com   →  解析到 203.0.113.30
```

**一台转发机一个子域名**(同一个域名下开子域名即可,不用买多个),填之前先去 DNS 加好 A 记录。留空则维持原样显示 IP。

好处除了不暴露 IP,还有:**机器 IP 被墙时改条 DNS 解析就活了,不用通知车友重新拉订阅。**

> ⚠️ **这只是"不直接显示",不是真正的隐藏。** 对方 `ping` 一下域名照样拿到 IP。
> 要做到查都查不到,只有走 CDN(Cloudflare 橙云),而目前一键搭建的六个协议
> (VLESS-Reality / Trojan-Reality / VMess / Hysteria2 / TUIC / AnyTLS)都过不了 CDN
> —— Reality 要跟真实服务端直接握手、Hysteria2 和 TUIC 走 UDP,CF 都不转发。
> 挡普通车友足够,防封锁不行。

## 卸载

**先分清两种机器,卸载方式完全不同:**

| 角色 | 装了什么 | 有 `tms` 命令吗 |
|---|---|---|
| **面板机**(只有一台) | Docker:MySQL + 后端 + 前端 | ✅ 有 |
| **节点机 / 转发机**(每台) | gost + sing-box(systemd 服务) | ❌ 没有 |

> ⚠️ `tms purge` 和 `panel_install.sh purge` **只清面板**,对节点机上的 gost 一点作用都没有。反过来,清节点也不会影响面板。两边要分别执行。

### 一、卸载面板机

在面板安装目录下执行:

```bash
tms purge
```

删除所有容器、镜像、数据卷、网络、配置文件和 `tms` 管理命令。也可以直接输入 `tms` 打开菜单选「彻底清理」。

如果 `tms` 命令不在了(比如当初就没装成功)，下载本 fork 的脚本，并将 `/PATH/TO/EXISTING/TMS` 替换为原安装目录：

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/panel_install.sh -o /tmp/tms.sh
bash /tmp/tms.sh purge --install-dir /PATH/TO/EXISTING/TMS
```

> 💡 最好 **cd 到当初安装面板的目录**再执行。不在那个目录时,脚本会从 `/usr/local/bin/tms` 里读回安装目录并自动切过去;
> 那个文件也没了的话,容器和镜像照样按名字清掉,只是安装目录里的 `docker-compose.yml` / `.env` 要你自己删。
> 脚本会检查当前目录的 `docker-compose.yml` 是不是 TMS 的,不是就跳过 compose 清理,避免误删你其它项目的容器和 `.env`。

#### 源码编译版(合体部署)怎么卸

用 `git clone` + `docker-compose-hybrid.yml` 本地构建起来的面板,管理命令同样是 `tms`:

```bash
tms purge
```

或者输入 `tms` 打开菜单选择对应的「彻底清理」操作。它会删掉容器、**本地构建的镜像**、数据卷(含数据库数据)、
网络和 `tms` 命令;**源码目录会保留**,确认不要了自己 `rm -rf` 即可。

### 二、卸载节点机(转发机)

> 🚨 **面板机同时也当转发机用的话,千万别在它上面跑这段。**
> 很多人把面板和第一台转发机装在同一台机器上,这段命令会把**本机的节点服务一起停掉并 disable**
> —— 所有协议瞬间全部失效,而面板里节点还显示「在线」(gost 是另一个服务,它还活着),
> 极难联想到是刚才那条命令干的。只想卸载**其它**转发机时,请 SSH 到那台机器上执行。
>
> 万一误跑了,恢复:`systemctl enable --now sing-box`
> ——必须带 `enable`,因为它被 `disable` 过,只 `start` 的话重启机器又会消失。

**每台转发机都要单独执行**,直接复制这段:

```bash
systemctl stop gost sing-box 2>/dev/null
systemctl disable gost sing-box 2>/dev/null
rm -rf /etc/systemd/system/sing-box.service.d /etc/gost
find /etc/systemd /run/systemd \( -name 'gost.service' -o -name 'sing-box.service' \) -delete 2>/dev/null
systemctl daemon-reload
systemctl reset-failed 2>/dev/null
echo "✅ 节点已卸载(gost + sing-box + 配置 + 证书)"
```

> ⚠️ **别只删 `/etc/gost`**。搭过协议的机器上还有 sing-box,它的服务文件在 `/etc/systemd/system/`,只删安装目录的话二进制没了、服务还注册着,systemd 会一直重启失败刷满日志。

> 💡 上面用 `find ... -delete` 而不是直接 `rm` 服务文件,是为了连 `multi-user.target.wants/` 里的**软链接**一起清掉。正常情况 `systemctl disable` 会删它们,但服务已经异常时可能残留,结果 `systemctl list-units --all` 里一直挂着一条 `not-found`,看着像没卸干净。

也可以重新下节点脚本走菜单(选 `3` 卸载):

```bash
curl -fLsS https://raw.githubusercontent.com/ThatYT/Tms_EN/main/install.sh -o /tmp/n.sh
GITHUB_REPO=ThatYT/Tms_EN bash /tmp/n.sh
```

> 💡 **国内机器**(阿里云等)大概率下不动 GitHub,直接用上面那段命令。

### 三、验证是否清干净

**面板机:**
```bash
docker ps -a | grep -E 'gost-mysql|springboot-backend|vite-frontend'
command -v tms
```

**节点机:**
```bash
systemctl list-units --all | grep -E 'gost|sing-box'
ls /etc/gost
```

都没有输出就说明干净了。

### 四、顺手清理防火墙(可选)

卸载不会动防火墙规则,之前给转发开的端口还留着。不打算再装的话:

```bash
ufw status numbered      # 看编号
ufw delete <编号>        # 逐条删
```

云服务器还要去控制台把**安全组**里对应的入方向规则删掉(阿里云、腾讯云、evoxt 等)。端口后面没服务在听,留着也不影响安全,看个人习惯。


## 免责声明

本项目仅供个人学习与研究使用，基于开源项目进行二次开发。  

使用本项目所带来的任何风险均由使用者自行承担，包括但不限于：  

- 配置不当或使用错误导致的服务异常或不可用；  
- 使用本项目引发的网络攻击、封禁、滥用等行为；  
- 服务器因使用本项目被入侵、渗透、滥用导致的数据泄露、资源消耗或损失；  
- 因违反当地法律法规所产生的任何法律责任。  

本项目为开源的流量转发工具，仅限合法、合规用途。  
使用者必须确保其使用行为符合所在国家或地区的法律法规。  

**作者不对因使用本项目导致的任何法律责任、经济损失或其他后果承担责任。**  
**禁止将本项目用于任何违法或未经授权的行为，包括但不限于网络攻击、数据窃取、非法访问等。**  

如不同意上述条款，请立即停止使用本项目。  

作者对因使用本项目所造成的任何直接或间接损失概不负责，亦不提供任何形式的担保、承诺或技术支持。  


请务必在合法、合规、安全的前提下使用本项目。  

---

