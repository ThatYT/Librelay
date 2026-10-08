package com.admin.service;

import com.admin.common.dto.FlowDto;
import com.admin.common.task.DatabaseBootstrap;
import com.admin.entity.User;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LIBRELAY_SCHEMA_TEST_URL",matches=".+")
class AccountTrafficBillingMysqlTest {
    @Test void directionMultipliersFractionalBytesAndPolicyChangesUseActualMysql() throws Exception {
        try(Connection c=DriverManager.getConnection(System.getenv("LIBRELAY_SCHEMA_TEST_URL"),"root","")) {
            assertEquals("librelay_schema_test",c.getCatalog());
            DatabaseBootstrap.initialize(c);
            // Isolate from the bootstrap test's legacy fixtures and preserve its admin row.
            try(Statement s=c.createStatement()) {
                s.executeUpdate("INSERT INTO user (id,user,pwd,flow,num,exp_time,flow_reset_time,role_id,status,created_time,updated_time,unified_limits) VALUES (98765,'billing-fixture','fixture',0,0,0,1,1,1,1,1,1)");
                try {
                    for(String mode:new String[]{"both","download","upload"}) {
                        reset(s,mode,"2"); report(s,100,50);
                        assertEquals(mode.equals("upload")?0:200,value(s,"in_flow"));
                        assertEquals(mode.equals("download")?0:100,value(s,"out_flow"));
                    }
                    reset(s,"both","0.5");
                    for(int n=0;n<10;n++)report(s,1,1);
                    assertEquals(5,value(s,"in_flow"));assertEquals(5,value(s,"out_flow"));
                    s.executeUpdate("UPDATE user SET traffic_multiplier=2,billing_mode='download' WHERE id=98765");
                    report(s,100,100);assertEquals(205,value(s,"in_flow"));assertEquals(5,value(s,"out_flow"));
                    reset(s,"both","0");report(s,100,100);assertEquals(0,value(s,"in_flow"));assertEquals(0,value(s,"out_flow"));
                    reset(s,"both","0.0001");report(s,5000,5000);report(s,5000,5000);
                    assertEquals(1,value(s,"in_flow"));assertEquals(1,value(s,"out_flow"));
                    reset(s,"both","0.5");
                    java.util.concurrent.ExecutorService workers=java.util.concurrent.Executors.newFixedThreadPool(2);
                    try {
                        java.util.List<java.util.concurrent.Future<?>> jobs=new java.util.ArrayList<>();
                        for(int n=0;n<2;n++) jobs.add(workers.submit(()->{
                            try(Connection other=DriverManager.getConnection(System.getenv("LIBRELAY_SCHEMA_TEST_URL"),"root","");Statement writer=other.createStatement()) {
                                for(int k=0;k<100;k++) report(writer,1,1);
                            } catch(SQLException ex) {throw new RuntimeException(ex);}
                        }));
                        for(var job:jobs)job.get();
                        assertEquals(100,value(s,"in_flow"));assertEquals(100,value(s,"out_flow"));
                    } finally {workers.shutdownNow();}
                } finally {s.executeUpdate("DELETE FROM user WHERE id=98765");}
            }
        }
    }
    private void report(Statement s,long d,long u)throws SQLException {
        FlowDto delta=new FlowDto();delta.setD(d);delta.setU(u);
        UpdateWrapper<User> update=new UpdateWrapper<>();AccountTrafficBilling.addUsage(update,delta);
        s.executeUpdate("UPDATE user SET "+update.getSqlSet()+" WHERE id=98765");
    }
    private void reset(Statement s,String mode,String multiplier)throws SQLException {
        s.executeUpdate("UPDATE user SET in_flow=0,out_flow=0,billing_download_remainder=0,billing_upload_remainder=0,billing_mode='"+mode+"',traffic_multiplier="+multiplier+" WHERE id=98765");
    }
    private long value(Statement s,String field)throws SQLException {
        try(ResultSet r=s.executeQuery("SELECT "+field+" FROM user WHERE id=98765")){assertTrue(r.next());return r.getLong(1);}
    }
}
