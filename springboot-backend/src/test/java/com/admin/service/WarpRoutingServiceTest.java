package com.admin.service;

import com.admin.common.dto.NodeWarpDto;
import com.admin.common.dto.WarpRoutingPolicy;
import com.admin.common.lang.R;
import com.admin.controller.InboundController;
import com.admin.entity.Node;
import com.admin.mapper.NodeMapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class WarpRoutingServiceTest {
    @Test void savesOnlyPolicyBeforePushingAndKeepsItWhenNodeIsOffline() {
        for (boolean offline : new boolean[]{true,false}) {
            NodeMapper nodes = mock(NodeMapper.class); InboundService inbounds = mock(InboundService.class);
            WarpRoutingService service = new WarpRoutingService();
            ReflectionTestUtils.setField(service,"nodes",nodes); ReflectionTestUtils.setField(service,"inbounds",inbounds);
            Node node = new Node(); node.setId(7L); when(nodes.selectById(7L)).thenReturn(node);
            when(nodes.update(isNull(),any())).thenReturn(1);
            when(inbounds.pushNodeConfig(7L)).thenReturn(offline ? R.err("Offline") : R.ok());
            NodeWarpDto request = new NodeWarpDto(); request.setNodeId(7L); request.setEnabled(true);
            R result = service.save(request);
            assertEquals(offline,result.getCode()!=0);
            if (offline) assertTrue(result.getMsg().contains("saved, but not applied"));
            ArgumentCaptor<UpdateWrapper<Node>> update = ArgumentCaptor.forClass(UpdateWrapper.class);
            var order = inOrder(nodes,inbounds);
            order.verify(nodes).selectById(7L); order.verify(nodes).update(isNull(),update.capture());
            order.verify(inbounds).pushNodeConfig(7L);
            assertTrue(update.getValue().getSqlSet().startsWith("warp_routing="));
            assertEquals(1,update.getValue().getSqlSet().split(",").length);
            String json = update.getValue().getParamNameValuePairs().values().stream()
                    .filter(String.class::isInstance).map(String.class::cast).filter(s->s.startsWith("{")).findFirst().orElseThrow();
            assertTrue(WarpRoutingPolicy.fromStored(json).getEnabled());
        }
    }
    @Test void validationAndMissingNodesDoNotWriteOrPush() {
        WarpRoutingService service = new WarpRoutingService(); NodeMapper nodes = mock(NodeMapper.class);
        InboundService inbounds = mock(InboundService.class);
        ReflectionTestUtils.setField(service,"nodes",nodes); ReflectionTestUtils.setField(service,"inbounds",inbounds);
        NodeWarpDto request = new NodeWarpDto(); request.setNodeId(7L); request.setPort(0);
        assertNotEquals(0,service.save(request).getCode()); verifyNoInteractions(nodes,inbounds);
        request.setPort(31000); assertNotEquals(0,service.save(request).getCode());
        verify(nodes,never()).update(any(),any()); verifyNoInteractions(inbounds);
    }
    @Test void endpointRequiresAdministratorAndValidNodeId() throws Exception {
        assertNotNull(InboundController.class.getMethod("warp",NodeWarpDto.class)
                .getAnnotation(com.admin.common.annotation.RequireRole.class));
        try (var factory = javax.validation.Validation.buildDefaultValidatorFactory()) {
            NodeWarpDto request = new NodeWarpDto(); assertFalse(factory.getValidator().validate(request).isEmpty());
            request.setNodeId(-1L); assertFalse(factory.getValidator().validate(request).isEmpty());
            request.setNodeId(7L); assertTrue(factory.getValidator().validate(request).isEmpty());
        }
    }
}
