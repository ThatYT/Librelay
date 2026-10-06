package com.admin.common.task;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DatabaseBootstrapTest {
    @Test void completeDatabasesAreNotReinitialized() throws Exception {
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getTables(any(), any(), anyString(), any())).thenAnswer(call -> {
            ResultSet rows = mock(ResultSet.class);
            when(rows.next()).thenReturn(true, false);
            when(rows.getString("TABLE_NAME")).thenReturn(call.getArgument(2));
            return rows;
        });
        DatabaseBootstrap.initialize(connection);
        verify(connection, never()).createStatement();
    }

    @Test void recoveryScriptCoversEveryTableAndNeverReplacesRows() throws Exception {
        String sql = new String(new ClassPathResource("db/bootstrap.sql").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        for (String table : DatabaseBootstrap.TABLES)
            assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS `" + table + "`"), table);
        assertFalse(sql.matches("(?is).*\\b(DROP|TRUNCATE|REPLACE|DELETE|UPDATE)\\s+(TABLE|INTO|FROM|`).*"));
        assertTrue(sql.contains("WHERE NOT EXISTS (SELECT 1 FROM `user`)"));
        assertTrue(sql.contains("WHERE NOT EXISTS (SELECT 1 FROM `vite_config` WHERE `name` = 'app_name')"));
    }
}
