-- Additive recovery schema: creates missing tables without replacing existing rows.
-- Keep these definitions aligned with gost.sql and SchemaMigration.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `forward` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `user_id` int(10) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `tunnel_id` int(10) NOT NULL,
  `in_port` int(10) NOT NULL,
  `out_port` int(10) DEFAULT NULL,
  `remote_addr` longtext NOT NULL,
  `strategy` varchar(100) NOT NULL DEFAULT 'fifo',
  `interface_name` varchar(200) DEFAULT NULL,
  `in_flow` bigint(20) NOT NULL DEFAULT '0',
  `out_flow` bigint(20) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) NOT NULL,
  `status` int(10) NOT NULL,
  `inx` int(10) NOT NULL DEFAULT '0',
  `speed_id` int(10) DEFAULT NULL,
  `exp_time` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  `client_link` varchar(1024) DEFAULT NULL,
  `quota_paused` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `node` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `secret` varchar(100) NOT NULL,
  `ip` longtext,
  `server_ip` varchar(100) NOT NULL,
  `port_sta` int(10) NOT NULL,
  `port_end` int(10) NOT NULL,
  `version` varchar(100) DEFAULT NULL,
  `http` int(10) NOT NULL DEFAULT '0',
  `tls` int(10) NOT NULL DEFAULT '0',
  `socks` int(10) NOT NULL DEFAULT '0',
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL,
  PRIMARY KEY (`id`),
  `domain` varchar(255) DEFAULT NULL,
  `cert_mode` int NOT NULL DEFAULT 0,
  `cert_path` varchar(500) DEFAULT NULL,
  `key_path` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `speed_limit` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `speed` int(10) NOT NULL,
  `mode` tinyint(4) NOT NULL DEFAULT '0',
  `total` int(10) NOT NULL DEFAULT '0',
  `tunnel_id` bigint(20) NULL DEFAULT NULL,
  `tunnel_name` varchar(100) NOT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `statistics_flow` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `user_id` int(10) NOT NULL,
  `flow` bigint(20) NOT NULL,
  `total_flow` bigint(20) NOT NULL,
  `time` varchar(100) NOT NULL,
  `created_time` bigint(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tunnel` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `traffic_ratio` decimal(10,1) NOT NULL DEFAULT '1.0',
  `in_node_id` int(10) NOT NULL,
  `in_ip` varchar(100) NOT NULL,
  `out_node_id` int(10) NOT NULL,
  `out_ip` varchar(100) NOT NULL,
  `type` int(10) NOT NULL,
  `protocol` varchar(10) NOT NULL DEFAULT 'tls',
  `flow` int(10) NOT NULL,
  `tcp_listen_addr` varchar(100) NOT NULL DEFAULT '[::]',
  `udp_listen_addr` varchar(100) NOT NULL DEFAULT '[::]',
  `interface_name` varchar(200) DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) NOT NULL,
  `status` int(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `user` varchar(100) NOT NULL,
  `pwd` varchar(100) NOT NULL,
  `role_id` int(10) NOT NULL,
  `exp_time` bigint(20) NOT NULL,
  `flow` bigint(20) NOT NULL,
  `in_flow` bigint(20) NOT NULL DEFAULT '0',
  `out_flow` bigint(20) NOT NULL DEFAULT '0',
  `flow_reset_time` bigint(20) NOT NULL,
  `num` int(10) NOT NULL,
  `all_sub_token` varchar(64) DEFAULT NULL COMMENT '全部线路聚合订阅token',
  `unified_limits` tinyint(1) NOT NULL DEFAULT 0,
  `speed_mbps` int NOT NULL DEFAULT 0,
  `limit_nodes` text DEFAULT NULL,
  `created_time` bigint(20) NOT NULL,
  `updated_time` bigint(20) DEFAULT NULL,
  `status` int(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_tunnel` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `user_id` int(10) NOT NULL,
  `tunnel_id` int(10) NOT NULL,
  `speed_id` int(10) DEFAULT NULL,
  `num` int(10) NOT NULL,
  `flow` bigint(20) NOT NULL,
  `in_flow` bigint(20) NOT NULL DEFAULT '0',
  `out_flow` bigint(20) NOT NULL DEFAULT '0',
  `flow_reset_time` bigint(20) NOT NULL,
  `exp_time` bigint(20) NOT NULL,
  `status` int(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vite_config` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `value` varchar(200) NOT NULL,
  `time` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inbound` (
  `id`           int(10)      NOT NULL AUTO_INCREMENT,
  `node_id`      int(10)      NOT NULL COMMENT '落在哪台节点',
  `tag`          varchar(100) NOT NULL COMMENT 'sing-box inbound tag',
  `protocol`     varchar(50)  NOT NULL COMMENT 'vless/vmess/trojan/shadowsocks/hysteria2',
  `listen_port`  int(10)      NOT NULL COMMENT 'sing-box listener port',
  `public_listen` tinyint(1) NOT NULL DEFAULT 0,
  `egress_port` int DEFAULT NULL,
  `security`     varchar(20)  NOT NULL DEFAULT 'reality' COMMENT 'none/tls/reality',
  `sni`          varchar(255) DEFAULT NULL COMMENT 'TLS/Reality 的 SNI',
  `dest`         varchar(255) DEFAULT NULL COMMENT 'Reality 借用的目标站点',
  `public_key`   varchar(255) DEFAULT NULL COMMENT 'Reality 公钥',
  `private_key`  varchar(255) DEFAULT NULL COMMENT 'Reality 私钥',
  `short_id`     varchar(100) DEFAULT NULL COMMENT 'Reality shortId',
  `config_json`  longtext              COMMENT '该入站完整 sing-box JSON(后端生成、下发节点)',
  `remark`       varchar(255) DEFAULT NULL,
  `status`       int(10)      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `created_time` bigint(20)   NOT NULL,
  `updated_time` bigint(20)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inbound_node` (`node_id`),
  `landing_id` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inbound_user` (
  `id`              int(10)      NOT NULL AUTO_INCREMENT,
  `inbound_id`      int(10)      NOT NULL,
  `user_id`         int(10)      NOT NULL COMMENT '关联 user 表(子账号)',
  `uuid`            varchar(100) DEFAULT NULL COMMENT 'vless/vmess 用',
  `password`        varchar(255) DEFAULT NULL COMMENT 'trojan/ss/hysteria2 用',
  `gost_forward_id` int(10)      DEFAULT NULL COMMENT '对应的 gost 前置转发(带限速/流量/到期)',
  `sub_token`       varchar(100) DEFAULT NULL COMMENT '订阅链接 token',
  `status`          int(10)      NOT NULL DEFAULT 1,
  `created_time`    bigint(20)   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_iu_inbound` (`inbound_id`),
  KEY `idx_iu_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `landing` (
  `id`            int(10)      NOT NULL AUTO_INCREMENT,
  `name`          varchar(100) NOT NULL COMMENT '落地名称(自己起,如 泰国住宅)',
  `type`          varchar(30)  NOT NULL COMMENT 'socks5/shadowsocks/vmess/vless/trojan/hysteria2',
  `link`          longtext              COMMENT '原始分享链接',
  `outbound_json` longtext              COMMENT '解析后的 sing-box outbound JSON',
  `remark`        varchar(255) DEFAULT NULL,
  `status`        int(10)      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `created_time`  bigint(20)   NOT NULL,
  `updated_time`  bigint(20)   DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inbound_line` (
  `id`           int(10)      NOT NULL AUTO_INCREMENT,
  `user_id`      int(10)      NOT NULL COMMENT '车友(user 表)',
  `node_id`      int(10)      NOT NULL COMMENT '机器',
  `landing_id`   int(10)      DEFAULT NULL COMMENT '落地ID:空=直连线路,非空=该落地的中转线路',
  `sub_token`    varchar(100) DEFAULT NULL COMMENT '该线路的订阅 token',
  `flow`         bigint(20)   DEFAULT NULL COMMENT '该线路流量配额(GB);0/NULL=不单独限',
  `exp_time`     bigint(20)   DEFAULT NULL COMMENT '该线路到期时间(epoch ms);空=不单独限',
  `status`       int(10)      NOT NULL DEFAULT 1 COMMENT '1=正常 0=已停(超额/到期)',
  `created_time` bigint(20)   NOT NULL,
  `updated_time` bigint(20)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_line_user` (`user_id`),
  KEY `idx_line_user_node` (`user_id`, `node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed only an empty user table; existing accounts/passwords are never changed.
INSERT IGNORE INTO `user` (`id`, `user`, `pwd`, `role_id`, `exp_time`, `flow`, `in_flow`, `out_flow`, `flow_reset_time`, `num`, `created_time`, `updated_time`, `status`)
SELECT 1, 'admin_user', '3c85cdebade1c51cf64ca9f3c09d182d', 0, 2727251700000, 99999, 0, 0, 1, 99999, 1748914865000, 1754011744252, 1
WHERE NOT EXISTS (SELECT 1 FROM `user`);

INSERT IGNORE INTO `vite_config` (`name`, `value`, `time`)
SELECT 'app_name', 'Librelay', 1755147963000
WHERE NOT EXISTS (SELECT 1 FROM `vite_config` WHERE `name` = 'app_name');
