package com.admin.common.utils;

import com.admin.common.dto.GostDto;
import com.admin.entity.Inbound;
import com.admin.entity.InboundUser;
import com.alibaba.fastjson.JSONObject;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;

/** Injectable boundary for commands executed on proxy nodes, never the panel host. */
@Component
public class NodeCommandClient {
    public GostDto send(Long nodeId, JSONObject request, String type) {
        return WebSocketServer.send_msg(nodeId, request, type);
    }
    public GostDto realityKeypair(Long nodeId) {
        return SingboxUtil.GenerateRealityKeypair(nodeId, null);
    }
    public GostDto configure(Long nodeId, List<Inbound> inbounds,
            Map<Long, List<InboundUser>> users, Map<Long, String> landings) {
        return SingboxUtil.SetSingboxConfig(nodeId, inbounds, users, landings, null);
    }
}
