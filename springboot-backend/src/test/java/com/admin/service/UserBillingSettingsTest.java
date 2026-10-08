package com.admin.service;

import com.admin.common.dto.UserUpdateDto;
import com.admin.entity.User;
import com.admin.service.impl.UserServiceImpl;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class UserBillingSettingsTest {
    private User previous() {
        User u=new User();u.setId(5L);u.setUser("fixture");u.setRoleId(1);u.setUnifiedLimits(true);
        u.setSpeedMbps(100);u.setFlow(100L);u.setStatus(1);u.setExpTime(0L);
        u.setInFlow(123L);u.setOutFlow(456L);u.setBillingMode("download");u.setTrafficMultiplier(new BigDecimal("0.5"));
        return u;
    }
    private UserUpdateDto dto() {
        UserUpdateDto dto=new UserUpdateDto();dto.setId(5L);dto.setUser("fixture");dto.setUnifiedLimits(true);
        dto.setSpeedMbps(100);dto.setFlow(100L);dto.setStatus(1);dto.setExpTime(0L);dto.setNum(99999);dto.setFlowResetTime(1L);
        return dto;
    }
    private UserServiceImpl service(User old,UserLimitService limits) {
        UserServiceImpl service=spy(new UserServiceImpl());
        doReturn(old).when(service).getById(any());
        doReturn(null).when(service).getOne(any());
        doReturn(true).when(service).updateById(any(User.class));
        ReflectionTestUtils.setField(service,"userLimits",limits);
        return service;
    }
    @Test void billingOnlyEditSavesWithOfflineNodesAndDoesNotRewriteCounters() {
        UserLimitService limits=mock(UserLimitService.class);
        doThrow(new IllegalStateException("offline node")).when(limits).stage(any(),any());
        UserServiceImpl service=service(previous(),limits);
        UserUpdateDto dto=dto();dto.setBillingMode("upload");dto.setTrafficMultiplier(new BigDecimal("2.5"));
        assertEquals(0,service.updateUser(dto).getCode());
        ArgumentCaptor<User> changed=ArgumentCaptor.forClass(User.class);
        verify(service).updateById(changed.capture());
        assertEquals("upload",changed.getValue().getBillingMode());assertEquals(new BigDecimal("2.5"),changed.getValue().getTrafficMultiplier());
        assertNull(changed.getValue().getInFlow());assertNull(changed.getValue().getOutFlow());
        verifyNoInteractions(limits);
    }
    @Test void OlderClientOmittingBillingAndSpeedKeepsExistingPolicy() {
        UserLimitService limits=mock(UserLimitService.class);UserServiceImpl service=service(previous(),limits);
        UserUpdateDto dto=dto();dto.setSpeedMbps(null);
        assertEquals(0,service.updateUser(dto).getCode());
        ArgumentCaptor<User> changed=ArgumentCaptor.forClass(User.class);verify(service).updateById(changed.capture());
        assertEquals(100,changed.getValue().getSpeedMbps());
        assertEquals("download",changed.getValue().getBillingMode());assertEquals(new BigDecimal("0.5"),changed.getValue().getTrafficMultiplier());
        verifyNoInteractions(limits);
    }
    @Test void speedChangeStillRequiresNodeSynchronization() {
        UserLimitService limits=mock(UserLimitService.class);UserServiceImpl service=service(previous(),limits);
        UserUpdateDto dto=dto();dto.setSpeedMbps(200);
        assertEquals(0,service.updateUser(dto).getCode());
        verify(limits).stage(any(),any());verify(limits).apply(any());
    }
}
