# Librelay releases / 版本记录

## 1.1.0

English:

- Numeric release versions shared by the panel, installer and Android build.
- Custom proxy listening ports, including VLESS-Reality default TCP 443.
- Panel default port 2095, configurable Caddy HTTPS port, and HTTPS/WSS node connections.
- One-command GitHub installation with prebuilt images/agents and data-preserving updates.
- Node installation prepares and checks both gost and sing-box before reporting success.
- English/Chinese UI and persistent Light/Dark themes.
- Unified per-user speed/quota limits with account billing direction and multiplier settings; speed caps hidden from ordinary users.
- Initial credentials displayed only after a fresh installation.

中文：

- 面板、安装器与 Android 构建采用统一数字版本。
- 代理协议可自定义监听端口，新建 VLESS-Reality 默认 TCP 443。
- 面板默认端口 2095，可配置 Caddy HTTPS 端口；节点支持 HTTPS/WSS 连接。
- GitHub 一键安装、预构建镜像/节点程序，更新保留数据。
- 节点安装同步准备并检查 gost 与 sing-box，服务未就绪不会报告成功。
- 中英文界面与持久保存的浅色/深色主题。
- 按用户统一限速与流量额度，支持计费方向和倍率；普通用户不显示限速。
- 初始账号信息仅在首次安装完成后显示。

Upgrade / 更新：

```bash
librelay update
```

Update existing node agents using their panel-generated installation command to use the current protocol and account-limit features. Database migrations are additive and retain existing protocol ports, accounts and traffic counters.

现有节点通过面板生成的安装命令更新代理程序。数据库自动补充字段，保留原协议端口、账号与历史计费用量。
