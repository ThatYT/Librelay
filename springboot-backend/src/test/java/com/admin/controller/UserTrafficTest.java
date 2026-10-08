package com.admin.controller;

import com.admin.common.dto.FlowDto;
import com.admin.entity.*;
import com.admin.service.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class UserTrafficTest {
    @Test void protocolTrafficUsesAccountPolicyAndIgnoresLegacyBillingMultipliers() {
        FlowController c=new FlowController();
        UserService users=mock(UserService.class); ForwardService forwards=mock(ForwardService.class);
        TunnelService tunnels=mock(TunnelService.class); UserLimitService limits=mock(UserLimitService.class);
        ReflectionTestUtils.setField(c,"userService",users); ReflectionTestUtils.setField(c,"forwardService",forwards);
        ReflectionTestUtils.setField(c,"tunnelService",tunnels); ReflectionTestUtils.setField(c,"userLimits",limits);
        User u=new User();u.setId(5L);u.setUnifiedLimits(true);
        Forward f=new Forward();f.setId(10L);f.setUserId(5);f.setTunnelId(1);
        Tunnel t=new Tunnel();t.setFlow(2);t.setTrafficRatio(new BigDecimal("3"));
        when(users.getById("5")).thenReturn(u);when(forwards.getById("10")).thenReturn(f);when(tunnels.getById(1)).thenReturn(t);
        FlowDto stats=new FlowDto();stats.setN("10_5_0_tcp");stats.setD(1000L);stats.setU(2000L);
        ReflectionTestUtils.invokeMethod(c,"processFlowData",stats);
        assertEquals(1000L,stats.getD());assertEquals(2000L,stats.getU());
        ArgumentCaptor<UpdateWrapper<User>> update=ArgumentCaptor.forClass(UpdateWrapper.class);
        verify(users).update(isNull(),update.capture());
        assertTrue(update.getValue().getSqlSet().contains("in_flow = in_flow + 1000"));
        assertTrue(update.getValue().getSqlSet().contains("out_flow = out_flow + 2000"));
        verify(limits).enforce(u);
    }
}
