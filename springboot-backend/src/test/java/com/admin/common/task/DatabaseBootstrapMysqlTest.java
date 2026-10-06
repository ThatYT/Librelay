package com.admin.common.task;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;

/** Runs only against the disposable MySQL service in GitHub Actions. */
@EnabledIfEnvironmentVariable(named = "TMS_SCHEMA_TEST_URL", matches = ".+")
class DatabaseBootstrapMysqlTest {
    @Test void freshAndInterruptedInitializationPreserveExistingData() throws Exception {
        try (Connection connection = DriverManager.getConnection(System.getenv("TMS_SCHEMA_TEST_URL"), "root", "")) {
            // Never run destructive test fixtures against a user's database.
            assertEquals("tms_schema_test", connection.getCatalog());
            try (Statement statement = connection.createStatement()) {
                DatabaseBootstrap.initialize(connection);
                assertEquals("admin_user", scalar(statement, "SELECT user FROM user WHERE id=1"));
                assertEquals("TMS", scalar(statement, "SELECT value FROM vite_config WHERE name='app_name'"));
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
                assertEquals("TMS", scalar(statement, "SELECT value FROM vite_config WHERE name='app_name'"));
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
