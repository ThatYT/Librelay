package com.admin.service;

import com.admin.common.dto.NodeWarpDto;
import com.admin.common.dto.WarpRoutingPolicy;
import com.admin.common.lang.R;
import com.admin.entity.Node;
import com.admin.mapper.NodeMapper;
import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.springframework.stereotype.Service;
import javax.annotation.Resource;

@Service
public class WarpRoutingService {
    @Resource private NodeMapper nodes;
    @Resource private InboundService inbounds;

    public R save(NodeWarpDto request) {
        final WarpRoutingPolicy policy;
        try { policy = request.normalized(); }
        catch (IllegalArgumentException e) { return R.err(e.getMessage()); }
        Node node = nodes.selectById(request.getNodeId());
        if (node == null) return R.err("Node does not exist");
        if (nodes.update(null, new UpdateWrapper<Node>().eq("id", node.getId())
                .set("warp_routing", JSON.toJSONString(policy))) != 1)
            return R.err("Could not save WARP settings");
        // Keep desired policy durable even if the node is offline; a later push retries it.
        R pushed;
        try { pushed = inbounds.pushNodeConfig(node.getId()); }
        catch (RuntimeException e) { pushed = R.err("Node configuration could not be applied"); }
        if (pushed.getCode() != 0)
            return R.err("WARP settings saved, but not applied: " + pushed.getMsg() + ". Retry Push configuration when the node is online.");
        return R.ok(policy);
    }
}
