package com.admin.service;

import com.admin.common.dto.GostDto;
import com.admin.common.utils.NodeCommandClient;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class UserLimitServiceTest {
    static class Policy extends UserLimitService {
        final List<String> controls = new ArrayList<>();
        final List<Long> attachments = new ArrayList<>();
        @Override protected void control(Tunnel t, String name, boolean pause) { controls.add(name + ":" + pause); }
        @Override protected void attach(User u, Forward f) { attachments.add(f.getId()); }
    }
    final Policy policy = new Policy();
    final UserMapper users = mock(UserMapper.class);
    final ForwardMapper forwards = mock(ForwardMapper.class);
    final TunnelMapper tunnels = mock(TunnelMapper.class);
    final UserTunnelMapper permissions = mock(UserTunnelMapper.class);
    final NodeCommandClient commands = mock(NodeCommandClient.class);
    UserLimitServiceTest() {
        ReflectionTestUtils.setField(policy,"users",users);
        ReflectionTestUtils.setField(policy,"inboundUsers",mock(InboundUserMapper.class));
        ReflectionTestUtils.setField(policy,"forwards",forwards);
        ReflectionTestUtils.setField(policy,"tunnels",tunnels);
        ReflectionTestUtils.setField(policy,"permissions",permissions);
        ReflectionTestUtils.setField(policy,"commands",commands);
        when(forwards.selectList(any())).thenReturn(List.of());
        when(users.update(any(),any())).thenReturn(1);
        when(forwards.update(any(),any())).thenReturn(1);
        GostDto ok = new GostDto(); ok.setMsg("OK");
        when(commands.send(anyLong(),any(),eq("SetUserLimit"))).thenReturn(ok);
    }
    User user() {
        User u = new User(); u.setId(5L); u.setStatus(1); u.setUnifiedLimits(true);
        u.setSpeedMbps(100); u.setFlow(1L); u.setInFlow(0L); u.setOutFlow(0L); u.setLimitNodes("[1]");
        when(users.selectById(5L)).thenReturn(u); return u;
    }
    @Test void twoNodesShareOneGlobalBudgetWithReductionsBeforeNewAllocation() {
        User u = user(); u.setLimitNodes("[7]");
        assertEquals(800000005,policy.prepare(5L,2L));
        var order = inOrder(commands);
        order.verify(commands).send(eq(7L),argThat(r -> r.getLongValue("userBytesPerSecond") == 6250000L),eq("SetUserLimit"));
        order.verify(commands).send(eq(2L),argThat(r -> r.getLongValue("userBytesPerSecond") == 6250000L),eq("SetUserLimit"));
        assertTrue(UserLimitService.shareBytes(101,3)*3 <= 101L*125000);
    }
    @Test void offlineReservationPreventsActivatingAdditionalNode() {
        user(); GostDto failed = new GostDto(); failed.setMsg("Node offline");
        when(commands.send(eq(1L),any(),anyString())).thenReturn(failed);
        var error = assertThrows(IllegalStateException.class,() -> policy.prepare(5L,2L));
        assertTrue(error.getMessage().contains("node 1"));
        verify(commands,never()).send(eq(2L),any(),anyString());
        verify(users,never()).update(any(),any());
    }
    @Test void disconnectedReservationIsRetainedEvenWithoutForwards() {
        User u = user(); u.setLimitNodes("[1,2]");
        policy.apply(u);
        verify(commands).send(eq(1L),argThat(r -> r.getLongValue("userBytesPerSecond") == 6250000L),anyString());
        verify(commands).send(eq(2L),argThat(r -> r.getLongValue("userBytesPerSecond") == 6250000L),anyString());
    }
    @Test void raisingLimitStagesOldBudgetUntilDatabaseCommit() {
        User old = user(); User next = new User(); next.setId(5L); next.setUnifiedLimits(true); next.setSpeedMbps(200);
        policy.stage(next,old);
        verify(commands).send(eq(1L),argThat(r -> r.getLongValue("userBytesPerSecond") == 12500000L),anyString());
        assertEquals("[1]",next.getLimitNodes());
        policy.apply(next);
        verify(commands).send(eq(1L),argThat(r -> r.getLongValue("userBytesPerSecond") == 25000000L),anyString());
    }
    Forward forward(long id, int tunnel, int status, boolean quotaPause) {
        Forward f = new Forward(); f.setId(id); f.setUserId(5); f.setTunnelId(tunnel); f.setStatus(status); f.setQuotaPaused(quotaPause);
        Tunnel t = new Tunnel(); t.setId((long)tunnel); t.setInNodeId((long)tunnel); t.setStatus(1); t.setType(1);
        when(tunnels.selectById(tunnel)).thenReturn(t); return f;
    }
    @Test void exhaustedAccountStopsAllProtocolsAndResetResumesOnlyQuotaPauses() {
        User u=user(); u.setInFlow(700L*1024*1024); u.setOutFlow(324L*1024*1024);
        var running = List.of(forward(10,1,1,false),forward(20,2,1,false),forward(30,2,0,false));
        when(forwards.selectList(any())).thenReturn(running);
        policy.enforce(u);
        assertEquals(List.of("10_5_0:true","20_5_0:true"),policy.controls);
        policy.controls.clear(); u.setInFlow(0L); u.setOutFlow(0L);
        var paused = List.of(forward(10,1,0,true),forward(20,2,0,true),forward(30,2,0,false));
        when(forwards.selectList(any())).thenReturn(paused);
        policy.enforce(u);
        assertEquals(List.of("10_5_0:false","20_5_0:false"),policy.controls);
    }
    @Test void unlimitedMeansZeroAndLegacyPoliciesDoNotChangeOnUpgrade() {
        User u=user(); u.setFlow(0L); u.setInFlow(Long.MAX_VALUE/2); u.setOutFlow(0L);
        assertNull(UserLimitService.blockedReason(u));
        u.setUnifiedLimits(false); policy.apply(u); policy.prepare(5L,2L);
        verifyNoInteractions(commands);
        assertEquals(0,UserLimitService.shareBytes(0,2));
        assertThrows(IllegalArgumentException.class,() -> UserLimitService.shareBytes(-1,2));
    }
    @Test void aggregateAndLineSubscriptionHeadersReportTheSameAccountQuota() {
        User u=user();u.setInFlow(100L);u.setOutFlow(200L);u.setExpTime(10000L);
        when(users.selectOne(any())).thenReturn(u);
        String expected="upload=200; download=100; total=1073741824; expire=10";
        assertEquals(expected,policy.subscriptionHeader("aggregate-token"));
        InboundUserMapper inboundUsers=mock(InboundUserMapper.class);
        ReflectionTestUtils.setField(policy,"inboundUsers",inboundUsers);
        InboundUser iu=new InboundUser();iu.setUserId(5L);
        when(users.selectOne(any())).thenReturn(null);when(inboundUsers.selectOne(any())).thenReturn(iu);
        assertEquals(expected,policy.subscriptionHeader("line-token"));
    }
    @Test void expirationAndDisabledAccountsStayBlockedAfterReset() {
        User u=user(); u.setExpTime(1L); assertEquals("User has expired",UserLimitService.blockedReason(u));
        u.setExpTime(0L); u.setStatus(0); assertEquals("User is disabled",UserLimitService.blockedReason(u));
    }
}
