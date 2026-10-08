package com.admin.common.task;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;

/** Runs only against the disposable MySQL service in GitHub Actions. */
@EnabledIfEnvironmentVariable(named = "LIBRELAY_SCHEMA_TEST_URL", matches = ".+")
class DatabaseBootstrapMysqlTest {
    @Test void freshAndInterruptedInitializationPreserveExistingData() throws Exception {
        try (Connection connection = DriverManager.getConnection(System.getenv("LIBRELAY_SCHEMA_TEST_URL"), "root", "")) {
            // Never run destructive test fixtures against a user's database.
            assertEquals("librelay_schema_test", connection.getCatalog());
            try (Statement statement = connection.createStatement()) {
                DatabaseBootstrap.initialize(connection);
                assertEquals("admin_user", scalar(statement, "SELECT user FROM user WHERE id=1"));
                assertEquals("Librelay", scalar(statement, "SELECT value FROM vite_config WHERE name='app_name'"));
                assertEquals("12", scalar(statement, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"));
                statement.executeUpdate("UPDATE user SET pwd='existing-password-hash', flow=123 WHERE id=1");
                statement.executeUpdate("INSERT INTO inbound (node_id,tag,protocol,listen_port,created_time) VALUES (7,'legacy','vless',20000,1)");
                statement.executeUpdate("UPDATE vite_config SET value='Custom panel' WHERE name='app_name'");
                DatabaseBootstrap.initialize(connection);
                assertEquals("Custom panel", scalar(statement, "SELECT value FROM vite_config WHERE name='app_name'"));
                // Simulate the reported missing-table failure, while retaining user/protocol data.
                statement.executeUpdate("DROP TABLE vite_config");
                DatabaseBootstrap.initialize(connection);
                assertEquals("existing-password-hash", scalar(statement, "SELECT pwd FROM user WHERE id=1"));
                assertEquals("123", scalar(statement, "SELECT flow FROM user WHERE id=1"));
                assertEquals("20000", scalar(statement, "SELECT listen_port FROM inbound WHERE tag='legacy'"));
                assertEquals("0", scalar(statement, "SELECT public_listen FROM inbound WHERE tag='legacy'"));
                assertEquals("Librelay", scalar(statement, "SELECT value FROM vite_config WHERE name='app_name'"));
                // Old installer columns must survive updates, while missing fields are added.
                statement.executeUpdate("ALTER TABLE user ADD COLUMN name VARCHAR(100) DEFAULT 'legacy-name'");
                statement.executeUpdate("ALTER TABLE node ADD COLUMN port INT DEFAULT 1234");
                statement.executeUpdate("ALTER TABLE tunnel ADD COLUMN in_port_sta INT DEFAULT 2222");
                statement.executeUpdate("ALTER TABLE forward ADD COLUMN proxy_protocol INT DEFAULT 1");
                statement.executeUpdate("INSERT INTO node (id,name,secret,ip,server_ip,port_sta,port_end,created_time,updated_time,status) VALUES (7,'legacy-node','fixture','192.0.2.7','192.0.2.7',1000,65535,1,1,0)");
                statement.executeUpdate("ALTER TABLE node DROP COLUMN server_ip");
                statement.executeUpdate("ALTER TABLE node DROP COLUMN port_sta");
                statement.executeUpdate("ALTER TABLE user DROP COLUMN unified_limits, DROP COLUMN speed_mbps, DROP COLUMN limit_nodes");
                statement.executeUpdate("ALTER TABLE forward DROP COLUMN quota_paused");
                SchemaMigration migration = new SchemaMigration();
                org.springframework.test.util.ReflectionTestUtils.setField(migration, "dataSource",
                        new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("LIBRELAY_SCHEMA_TEST_URL"), "root", ""));
                migration.run(null); migration.run(null);
                assertEquals("legacy-name", scalar(statement, "SELECT name FROM user WHERE id=1"));
                assertEquals("1234", scalar(statement, "SELECT port FROM node WHERE id=7"));
                assertEquals("192.0.2.7", scalar(statement, "SELECT server_ip FROM node WHERE id=7"));
                assertEquals("1000", scalar(statement, "SELECT port_sta FROM node WHERE id=7"));
                assertEquals("20000", scalar(statement, "SELECT listen_port FROM inbound WHERE tag='legacy'"));
                assertEquals("4", scalar(statement, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='user' AND column_name='name') OR (table_name='node' AND column_name='port') OR (table_name='tunnel' AND column_name='in_port_sta') OR (table_name='forward' AND column_name='proxy_protocol'))"));
                assertEquals("0", scalar(statement, "SELECT unified_limits FROM user WHERE id=1"));
                assertEquals("0", scalar(statement, "SELECT speed_mbps FROM user WHERE id=1"));
                statement.executeUpdate("UPDATE user SET unified_limits=1,speed_mbps=100,limit_nodes='[7,8]' WHERE id=1");
                migration.run(null);
                DatabaseBootstrap.initialize(connection);
                assertEquals("1", scalar(statement, "SELECT unified_limits FROM user WHERE id=1"));
                assertEquals("100", scalar(statement, "SELECT speed_mbps FROM user WHERE id=1"));
                assertEquals("[7,8]", scalar(statement, "SELECT limit_nodes FROM user WHERE id=1"));
                assertEquals("123", scalar(statement, "SELECT flow FROM user WHERE id=1"));
                // Simulate import interruption before the old dump's PK/AUTO_INCREMENT ALTERs.
                statement.executeUpdate("DROP TABLE vite_config");
                statement.executeUpdate("ALTER TABLE user MODIFY id INT NOT NULL");
                statement.executeUpdate("ALTER TABLE user DROP PRIMARY KEY");
                DatabaseBootstrap.initialize(connection);
                assertEquals("existing-password-hash", scalar(statement, "SELECT pwd FROM user WHERE id=1"));
                assertEquals("YES", scalar(statement, "SELECT IF(EXTRA LIKE '%auto_increment%', 'YES', 'NO') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user' AND column_name='id'"));
                assertEquals("12", scalar(statement, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"));
            }
        }
    }

    private String scalar(Statement statement, String sql) throws SQLException {
        try (ResultSet result = statement.executeQuery(sql)) {
            assertTrue(result.next()); return result.getString(1);
        }
    }
}
