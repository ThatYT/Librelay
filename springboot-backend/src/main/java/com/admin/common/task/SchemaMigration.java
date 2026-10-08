package com.admin.common.task;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 启动时的表结构自动迁移。
 *
 * gost.sql 只在【新装】时执行一次,已经装好的面板 tms update 只换镜像、不动表结构。
 * 所以往实体里加字段必须配一次 ALTER,否则老用户一查就 Unknown column,面板直接崩。
 *
 * 这里只做「列不存在就加」这一种最安全的迁移:先查 information_schema 确认列缺失,
 * 再执行 ADD COLUMN。幂等、可重复执行,失败也只记日志不影响启动 ——
 * 迁移挂了顶多是新功能不可用,不能连带把整个面板拖死。
 */
@Slf4j
@Component
@Order(1)
public class SchemaMigration implements ApplicationRunner {

    @Resource
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        // Retain old columns/data; the installer no longer runs destructive legacy SQL.
        addColumnIfMissing("node", "server_ip", "ALTER TABLE `node` ADD COLUMN `server_ip` VARCHAR(100) NULL");
        addColumnIfMissing("node", "version", "ALTER TABLE `node` ADD COLUMN `version` VARCHAR(100) NULL");
        addColumnIfMissing("node", "port_sta", "ALTER TABLE `node` ADD COLUMN `port_sta` INT DEFAULT 1000");
        addColumnIfMissing("node", "port_end", "ALTER TABLE `node` ADD COLUMN `port_end` INT DEFAULT 65535");
        for (String column : new String[]{"http", "tls", "socks"})
            addColumnIfMissing("node", column, "ALTER TABLE `node` ADD COLUMN `" + column + "` INT DEFAULT 0");
        for (String column : new String[]{"tcp_listen_addr", "udp_listen_addr"})
            addColumnIfMissing("tunnel", column, "ALTER TABLE `tunnel` ADD COLUMN `" + column + "` VARCHAR(100) DEFAULT '0.0.0.0'");
        addColumnIfMissing("tunnel", "protocol", "ALTER TABLE `tunnel` ADD COLUMN `protocol` VARCHAR(10) DEFAULT 'tls'");
        addColumnIfMissing("tunnel", "traffic_ratio", "ALTER TABLE `tunnel` ADD COLUMN `traffic_ratio` DECIMAL(5,1) DEFAULT 1.0");
        addColumnIfMissing("forward", "strategy", "ALTER TABLE `forward` ADD COLUMN `strategy` VARCHAR(100) DEFAULT 'fifo'");
        addColumnIfMissing("forward", "inx", "ALTER TABLE `forward` ADD COLUMN `inx` INT DEFAULT 0");
        for (String table : new String[]{"tunnel", "forward"})
            addColumnIfMissing(table, "interface_name", "ALTER TABLE `" + table + "` ADD COLUMN `interface_name` VARCHAR(200) NULL");
        addColumnIfMissing("statistics_flow", "created_time", "ALTER TABLE `statistics_flow` ADD COLUMN `created_time` BIGINT NOT NULL DEFAULT 0");
        backfillLegacyServerIp();
        addColumnIfMissing("inbound", "public_listen",
                "ALTER TABLE `inbound` ADD COLUMN `public_listen` TINYINT(1) NOT NULL DEFAULT 0");
        addColumnIfMissing("inbound", "egress_port",
                "ALTER TABLE `inbound` ADD COLUMN `egress_port` INT NULL");
        // 转发机的「连接域名」:填了就用它生成节点链接,车友看到的是域名而不是车主的 IP
        addColumnIfMissing("node", "domain",
                "ALTER TABLE `node` ADD COLUMN `domain` VARCHAR(255) NULL COMMENT '连接域名(可选,留空用 server_ip)'");
        addColumnIfMissing("node", "cert_mode", "ALTER TABLE `node` ADD COLUMN `cert_mode` INT NOT NULL DEFAULT 0");
        addColumnIfMissing("node", "cert_path", "ALTER TABLE `node` ADD COLUMN `cert_path` VARCHAR(500) NULL");
        addColumnIfMissing("node", "key_path", "ALTER TABLE `node` ADD COLUMN `key_path` VARCHAR(500) NULL");
        addColumnIfMissing("inbound", "landing_id", "ALTER TABLE `inbound` ADD COLUMN `landing_id` INT NULL");

        // 「全部线路」聚合订阅 token:一条链接包含该车友所有未停用线路的节点
        addColumnIfMissing("user", "all_sub_token",
                "ALTER TABLE `user` ADD COLUMN `all_sub_token` VARCHAR(64) NULL COMMENT '全部线路聚合订阅token'");

        // 分给车友的转发要能进订阅,面板就得持有一条可直接导入客户端的链接。
        // 落地的账号密码本来只存在车主本机(gost 只搬字节,凭据不上传)——
        // 这是三月明确权衡后选的:用"凭据落在面板 DB"换"车友一条 URL、增删自动同步"。
        // 只存分配给车友的那些;车主自己的转发不写这一列。
        addColumnIfMissing("forward", "client_link",
                "ALTER TABLE `forward` ADD COLUMN `client_link` VARCHAR(1024) NULL COMMENT '给车友的客户端链接(进聚合订阅用)'");
    }

    private void backfillLegacyServerIp() {
        try (Connection conn = dataSource.getConnection()) {
            if (columnExists(conn, "node", "ip") && columnExists(conn, "node", "server_ip")) {
                try (Statement statement = conn.createStatement()) {
                    statement.executeUpdate("UPDATE `node` SET `server_ip`=`ip` WHERE `server_ip` IS NULL");
                }
            }
        } catch (Exception e) {
            log.warn("Legacy node address backfill failed: {}", e.getMessage());
        }
    }

    /** 列不存在才执行 ddl;任何异常都吞掉(只记日志),不能因为迁移失败导致面板起不来 */
    private void addColumnIfMissing(String table, String column, String ddl) {
        try (Connection conn = dataSource.getConnection()) {
            if (columnExists(conn, table, column)) {
                return;
            }
            try (Statement st = conn.createStatement()) {
                st.executeUpdate(ddl);
                log.info("表结构迁移: {}.{} 已添加", table, column);
            }
        } catch (Exception e) {
            // 并发启动时另一个实例可能刚好加完(1060 Duplicate column),这属于正常情况
            String msg = e.getMessage() == null ? "" : e.getMessage();
            if (msg.contains("Duplicate column") || msg.contains("1060")) {
                log.debug("表结构迁移: {}.{} 已存在,跳过", table, column);
            } else {
                log.warn("表结构迁移失败 {}.{}: {}", table, column, msg);
            }
        }
    }

    private boolean columnExists(Connection conn, String table, String column) throws Exception {
        DatabaseMetaData meta = conn.getMetaData();
        try (ResultSet rs = meta.getColumns(conn.getCatalog(), null, table, column)) {
            return rs.next();
        }
    }
}
