package com.admin.service;

import com.admin.common.dto.UserProtocolAccessDto;
import com.admin.common.lang.R;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UserProtocolAccessTest {
    UserProtocolAccessService service;
    InboundService protocols;
    InboundUserMapper assignments;
    UserMapper users;
    ForwardService forwards;
    UserLimitService limits;
    List<Inbound> available;
    List<InboundUser> rows;
    long sequence;

    @BeforeEach void setup() {
        service = new UserProtocolAccessService();
        protocols = mock(InboundService.class); assignments = mock(InboundUserMapper.class);
        users = mock(UserMapper.class); forwards = mock(ForwardService.class); limits = mock(UserLimitService.class);
        ReflectionTestUtils.setField(service, "inbounds", protocols);
        ReflectionTestUtils.setField(service, "assignments", assignments);
        ReflectionTestUtils.setField(service, "users", users);
        ReflectionTestUtils.setField(service, "forwards", forwards);
        ReflectionTestUtils.setField(service, "userLimits", limits);
        NodeMapper nodes = mock(NodeMapper.class); LandingMapper landings = mock(LandingMapper.class);
        ReflectionTestUtils.setField(service, "nodes", nodes); ReflectionTestUtils.setField(service, "landings", landings);
        User user = new User(); user.setId(4L); user.setSpeedMbps(100); user.setFlow(10L);
        when(users.selectById(4L)).thenReturn(user);
        available = new ArrayList<>(); rows = new ArrayList<>(); sequence = 1;
        available.add(protocol(101, 1, null)); available.add(protocol(102, 2, 7L));
        when(protocols.list()).thenAnswer(call -> new ArrayList<>(available));
        when(assignments.selectList(any())).thenAnswer(call -> new ArrayList<>(rows));
        when(assignments.selectOne(any())).thenAnswer(call -> {
            QueryWrapper<InboundUser> q = call.getArgument(0); q.getSqlSegment();
            return rows.stream().filter(row -> q.getParamNameValuePairs().containsValue(row.getInboundId())).findFirst().orElse(null);
        });
        when(assignments.updateById(any())).thenReturn(1);
        when(assignments.deleteById(any(java.io.Serializable.class))).thenAnswer(call -> {
            Object id = call.getArgument(0); rows.removeIf(row -> row.getId().equals(id)); return 1;
        });
        when(assignments.update(isNull(), any())).thenAnswer(call -> {
            UpdateWrapper<InboundUser> update = call.getArgument(1); update.getSqlSegment();
            rows.stream().filter(row -> update.getParamNameValuePairs().containsValue(row.getId())).forEach(row -> row.setPendingAction(null)); return 1;
        });
        when(forwards.getById(any(java.io.Serializable.class))).thenReturn(new Forward());
        when(forwards.deleteForward(any())).thenReturn(R.ok());
        when(protocols.pushNodeConfig(any())).thenReturn(R.ok());
        when(protocols.assignUser(any())).thenAnswer(call -> {
            com.admin.common.dto.InboundUserDto dto = call.getArgument(0);
            assertNull(dto.getFlow()); assertNull(dto.getExpTime()); assertNull(dto.getSpeedId());
            add(dto.getInboundId()).setPendingAction("grant"); return R.ok();
        });
    }
    private Inbound protocol(long id, long node, Long landing) {
        Inbound p = new Inbound(); p.setId(id); p.setNodeId(node); p.setLandingId(landing);
        p.setProtocol("vless"); p.setListenPort(443); p.setStatus(1); return p;
    }
    private InboundUser add(long inboundId) {
        InboundUser row = new InboundUser(); row.setId(sequence++); row.setInboundId(inboundId); row.setUserId(4L);
        row.setStatus(1); row.setUuid("unchanged-" + inboundId); row.setSubToken("stable-subscription");
        row.setGostForwardId(inboundId + 1000); rows.add(row); return row;
    }
    @SuppressWarnings("unchecked") private Map<String, Object> data(R result) {
        assertEquals(0, result.getCode(), result.getMsg()); return (Map<String, Object>) result.getData();
    }
    private UserProtocolAccessDto selection(Long... ids) {
        UserProtocolAccessDto dto = new UserProtocolAccessDto(); dto.setUserId(4L); dto.setInboundIds(Arrays.asList(ids));
        dto.setRevision((String) data(service.get(4L)).get("revision")); return dto;
    }
    @SuppressWarnings("unchecked") private boolean lastSucceeded(R result) {
        List<Map<String, Object>> outcomes = (List<Map<String, Object>>) data(result).get("outcomes");
        return (Boolean) outcomes.get(outcomes.size() - 1).get("success");
    }
    @Test void unchangedAccessPreservesCredentialsPortsTokensAndAccountPolicy() {
        InboundUser original = add(101);
        assertTrue(((List<?>) data(service.save(4L, selection(101L))).get("outcomes")).isEmpty());
        assertEquals("unchanged-101", original.getUuid()); assertEquals("stable-subscription", original.getSubToken());
        assertEquals(443, available.get(0).getListenPort());
        verify(protocols, never()).assignUser(any()); verify(protocols, never()).pushNodeConfig(any());
        verifyNoInteractions(forwards, limits); verify(users, never()).updateById(any());
    }
    @Test void selectiveMultiNodeGrantDoesNotSelectFutureProtocols() {
        assertTrue(lastSucceeded(service.save(4L, selection(101L, 102L)))); assertEquals(2, rows.size());
        available.add(protocol(103, 2, null));
        data(service.save(4L, selection(101L, 102L)));
        assertEquals(2, rows.size()); verify(protocols, times(2)).assignUser(any());
        assertTrue(rows.stream().allMatch(row -> row.getPendingAction() == null));
    }
    @Test void offlineRevokeRemainsPendingAndCanBeRetriedWithoutRemovingOtherNode() {
        InboundUser keep = add(102); InboundUser revoke = add(101);
        when(protocols.pushNodeConfig(1L)).thenReturn(R.err("Node offline"));
        assertFalse(lastSucceeded(service.save(4L, selection(102L))));
        assertEquals("revoke-active", revoke.getPendingAction()); assertEquals(0, revoke.getStatus());
        assertEquals(2, rows.size()); verify(forwards, never()).deleteForward(any());
        when(protocols.pushNodeConfig(1L)).thenReturn(R.ok());
        assertTrue(lastSucceeded(service.save(4L, selection(102L))));
        assertEquals(List.of(keep), rows); assertEquals("unchanged-102", keep.getUuid());
    }
    @Test void failedForwardDeletionDoesNotReportRevocationAsComplete() {
        InboundUser revoke = add(101);
        when(forwards.deleteForward(1101L)).thenReturn(R.err("Gost unavailable"));
        assertFalse(lastSucceeded(service.save(4L, selection()))); assertEquals("revoke-active", revoke.getPendingAction());
        when(forwards.deleteForward(1101L)).thenReturn(R.ok());
        assertTrue(lastSucceeded(service.save(4L, selection()))); assertTrue(rows.isEmpty());
    }
    @Test void cancellingPendingRevokePreservesPausedCredentials() {
        InboundUser original = add(101); original.setStatus(0);
        when(protocols.pushNodeConfig(1L)).thenReturn(R.err("Offline"));
        data(service.save(4L, selection())); assertEquals("revoke-paused", original.getPendingAction());
        when(protocols.pushNodeConfig(1L)).thenReturn(R.ok());
        assertTrue(lastSucceeded(service.save(4L, selection(101L))));
        assertEquals(0, original.getStatus()); assertNull(original.getPendingAction()); assertEquals("unchanged-101", original.getUuid());
        verify(limits).prepare(4L, 1L);
    }
    @Test void retryPendingGrantUsesSameCredentialsAndChecksAccountLimits() {
        InboundUser original = add(101); original.setPendingAction("grant");
        doThrow(new IllegalStateException("Account quota exhausted")).when(limits).prepare(4L, 1L);
        assertFalse(lastSucceeded(service.save(4L, selection(101L)))); assertEquals("grant", original.getPendingAction());
        doReturn(null).when(limits).prepare(4L, 1L);
        assertTrue(lastSucceeded(service.save(4L, selection(101L)))); assertNull(original.getPendingAction());
        assertEquals("unchanged-101", original.getUuid()); verify(protocols, never()).assignUser(any());
    }
    @Test void validatesEntireSelectionAndRejectsStaleEditsBeforeMutation() {
        assertNotEquals(0, service.save(4L, selection(101L, 999L)).getCode());
        assertNotEquals(0, service.save(4L, selection(101L, 101L)).getCode());
        UserProtocolAccessDto stale = selection(); add(101);
        assertNotEquals(0, service.save(4L, stale).getCode());
        verify(protocols, never()).assignUser(any()); verify(protocols, never()).pushNodeConfig(any());
        verify(assignments, never()).updateById(any()); assertEquals(1, rows.size());
    }
    @Test void failedNewGrantIsVisibleAndRetryDoesNotRegenerateCredentials() {
        doAnswer(call -> { add(101).setPendingAction("grant"); return R.err("Sing-box offline"); }).when(protocols).assignUser(any());
        assertFalse(lastSucceeded(service.save(4L, selection(101L)))); InboundUser original = rows.get(0);
        assertTrue(lastSucceeded(service.save(4L, selection(101L)))); assertEquals(1, rows.size());
        assertEquals("unchanged-101", original.getUuid()); verify(protocols, times(1)).assignUser(any());
    }
    @Test void disabledProtocolsCannotBeGrantedButExistingAccessCanBeRevoked() {
        available.get(0).setStatus(0);
        assertNotEquals(0, service.save(4L, selection(101L)).getCode());
        add(101); assertTrue(lastSucceeded(service.save(4L, selection())));
    }
    @Test void accessRequestsRequireAdminAndValidateIdsIncludingExplicitEmptySelection() throws Exception {
        assertNotNull(com.admin.controller.UserController.class.getMethod("protocolAccess", Map.class)
                .getAnnotation(com.admin.common.annotation.RequireRole.class));
        assertNotNull(com.admin.controller.UserController.class.getMethod("saveProtocolAccess", UserProtocolAccessDto.class)
                .getAnnotation(com.admin.common.annotation.RequireRole.class));
        try (javax.validation.ValidatorFactory factory = javax.validation.Validation.buildDefaultValidatorFactory()) {
            javax.validation.Validator validator = factory.getValidator();
            UserProtocolAccessDto dto = selection();
            assertTrue(validator.validate(dto).isEmpty()); // empty is revoke-all, never grant-all
            dto.setInboundIds(null); assertFalse(validator.validate(dto).isEmpty());
            dto.setInboundIds(Arrays.asList(0L, null)); assertFalse(validator.validate(dto).isEmpty());
            dto.setInboundIds(List.of(101L)); dto.setRevision(""); assertFalse(validator.validate(dto).isEmpty());
        }
    }
    @Test void nodeConfigExcludesRevokingCredentialWhileKeepingAnotherUser() {
        Inbound p = available.get(0); p.setTag("reality"); p.setSecurity("reality"); p.setSni("www.apple.com");
        p.setPrivateKey("fixture"); p.setShortId("abcd");
        InboundUser revoked = add(101); revoked.setStatus(0); revoked.setPendingAction("revoke-active");
        InboundUser active = new InboundUser(); active.setUuid("other-user"); active.setStatus(1);
        com.alibaba.fastjson.JSONObject config = com.admin.common.utils.SingboxUtil.buildInbound(p, List.of(revoked, active));
        assertEquals(1, config.getJSONArray("users").size());
        assertEquals("other-user", config.getJSONArray("users").getJSONObject(0).getString("uuid"));
        assertEquals(443, config.getIntValue("listen_port"));
    }

}
