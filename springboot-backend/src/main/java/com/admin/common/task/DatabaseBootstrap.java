package com.admin.common.task;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

/** Recover empty or interrupted initial schemas before additive column migrations. */
@Slf4j
@Component
@Order(0)
public class DatabaseBootstrap implements ApplicationRunner {
    static final List<String> TABLES = List.of("forward", "node", "speed_limit", "statistics_flow",
            "tunnel", "user", "user_tunnel", "vite_config", "inbound", "inbound_user", "landing", "inbound_line");
    private static final List<String> BASE_TABLES = TABLES.subList(0, 8);

    @Resource
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            initialize(connection);
        } catch (Exception e) {
            throw new IllegalStateException("Database initialization failed. Check MySQL logs and database grants; "
                    + "preserve the existing .env and MySQL volume when repairing.", e);
        }
    }

    public static void initialize(Connection connection) throws SQLException {
        boolean incomplete = false;
        for (String table : TABLES) {
            if (!tableExists(connection, table)) { incomplete = true; break; }
        }
        if (!incomplete) return;
        log.warn("Incomplete database schema detected; creating missing tables without replacing existing data");
        // The original dump creates primary keys/auto-increment in later ALTERs.
        // If import stopped mid-file, finish those steps for existing base tables
        // before seeding anything. SQL errors stop recovery rather than deleting rows.
        for (String table : BASE_TABLES) {
            if (!tableExists(connection, table)) continue;
            boolean primaryKey;
            try (ResultSet keys = connection.getMetaData().getPrimaryKeys(connection.getCatalog(), null, table)) {
                primaryKey = keys.next();
            }
            try (Statement statement = connection.createStatement()) {
                if (!primaryKey) statement.executeUpdate("ALTER TABLE `" + table + "` ADD PRIMARY KEY (`id`)");
                try (ResultSet columns = connection.getMetaData().getColumns(connection.getCatalog(), null, table, "id")) {
                    if (columns.next() && !"YES".equals(columns.getString("IS_AUTOINCREMENT"))) {
                        statement.executeUpdate("ALTER TABLE `" + table + "` MODIFY `id` INT NOT NULL AUTO_INCREMENT");
                    }
                }
            }
        }
        ScriptUtils.executeSqlScript(connection,
                new EncodedResource(new ClassPathResource("db/bootstrap.sql"), "UTF-8"));
        log.info("Database recovery complete; existing accounts, protocol ports and settings retained");
    }

    private static boolean tableExists(Connection connection, String table) throws SQLException {
        try (ResultSet tables = connection.getMetaData().getTables(connection.getCatalog(), null, table, new String[]{"TABLE"})) {
            while (tables.next()) if (table.equalsIgnoreCase(tables.getString("TABLE_NAME"))) return true;
            return false;
        }
    }
}
