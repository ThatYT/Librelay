-- ============================================================
-- Librelay 面板 · 阶段4 数据库 schema(把「线路」正式建模,支持每条线路独立配额)
-- 加法式迁移:只新增表,不动现有数据。可在现有库上直接执行。
-- 目标库:MySQL 5.7 / utf8mb4。
-- ============================================================

-- ------------------------------------------------------------
-- inbound_line:一条「线路」= 车友 × 机器 × 落地组
--   landing_id 为空 = 该机器的直连线路;非空 = 该落地的中转线路。
--   同一台机器的直连和每个中转,各算一条线路、各一条订阅、各一份配额。
--
--   sub_token : 这条线路的订阅 token(该线路所有协议共享)
--   flow      : 这条线路的流量配额(GB);0 或 NULL = 不单独限,只受账号总流量约束
--   exp_time  : 这条线路的到期时间(epoch ms);空 = 不单独限
--   已用流量不在这里存,实时汇总该线路各协议对应转发的 in_flow+out_flow。
-- ------------------------------------------------------------
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
