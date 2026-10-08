package com.admin.service;

import com.admin.common.dto.GostDto;
import com.admin.common.utils.GostUtil;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import javax.annotation.Resource;
import java.util.*;

/** One account policy; durable node reservations bound the aggregate sustained rate. */
@Service
public class UserLimitService {
    public static final long LIMITER_BASE = 800000000L;
    private final Set<Long> pending = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private static final long GB = 1024L * 1024 * 1024;
    @Resource private com.admin.common.utils.NodeCommandClient commands;
    @Resource private InboundUserMapper inboundUsers;
    @Resource private InboundMapper inbounds;
    @Resource private InboundLineMapper lines;
    @Resource private UserMapper users;
    @Resource private ForwardMapper forwards;
    @Resource private TunnelMapper tunnels;
    @Resource private UserTunnelMapper permissions;

    public static boolean unified(User u) { return u != null && Boolean.TRUE.equals(u.getUnifiedLimits()); }
    public static String blockedReason(User u) {
        if (u == null) return "User does not exist";
        if (u.getStatus() != null && u.getStatus() != 1) return "User is disabled";
        if (u.getExpTime() != null && u.getExpTime() > 0 && u.getExpTime() <= System.currentTimeMillis()) return "User has expired";
        if (u.getFlow() != null && u.getFlow() > 0) {
            long used = (u.getInFlow() == null ? 0 : u.getInFlow()) + (u.getOutFlow() == null ? 0 : u.getOutFlow());
            if (used / GB >= u.getFlow()) return "User's total traffic quota is exhausted";
        }
        return null;
    }
    public static long shareBytes(Integer speedMbps, int count) {
        if (speedMbps == null || speedMbps == 0) return 0;
        if (speedMbps < 0 || speedMbps > 1000000 || count <= 0) throw new IllegalArgumentException("Invalid speed or node count");
        long share = speedMbps.longValue() * 125000L / count;
        if (share <= 0) throw new IllegalArgumentException("Speed budget is too small for the reserved nodes");
        return share;
    }
    private SortedSet<Long> nodes(User u) {
        SortedSet<Long> ids = new TreeSet<>();
        if (u.getLimitNodes() != null) ids.addAll(JSON.parseArray(u.getLimitNodes(), Long.class));
        for (Forward f : owned(u)) {
            Tunnel t = tunnels.selectById(f.getTunnelId());
            if (t != null && t.getInNodeId() != null) ids.add(t.getInNodeId());
        }
        return ids;
    }
    private List<Forward> owned(User u) { return forwards.selectList(new QueryWrapper<Forward>().eq("user_id", u.getId())); }
    private void ok(GostDto r, Long node) {
        if (r == null || !"OK".equals(r.getMsg())) throw new IllegalStateException("Cannot apply user limits on node " + node + ": " + (r == null ? "no response" : r.getMsg()) + ". Update the node agent and ensure it is online; then retry.");
    }
    private void push(User u, Long node, long share) {
        JSONObject request = new JSONObject();
        request.put("name", String.valueOf(LIMITER_BASE + u.getId()));
        request.put("userBytesPerSecond", share);
        ok(commands.send(node, request, "SetUserLimit"), node);
    }
    /** Reduce every old reservation before allowing any new node to carry traffic. */
    public synchronized Integer prepare(Long userId, Long node) {
        User u = users.selectById(userId);
        if (!unified(u)) return null;
        String reason = blockedReason(u);
        if (reason != null) throw new IllegalStateException(reason);
        SortedSet<Long> previous = nodes(u);
        if (u.getLimitNodes() != null && JSON.parseArray(u.getLimitNodes(), Long.class).contains(node)) {
            return Math.toIntExact(LIMITER_BASE + u.getId());
        }
        SortedSet<Long> next = new TreeSet<>(previous);
        next.add(node);
        long share = shareBytes(u.getSpeedMbps(), next.size());
        for (Long id : previous) push(u, id, share);
        if (!previous.contains(node)) push(u, node, share);
        if (users.update(null, new UpdateWrapper<User>().eq("id", userId).set("limit_nodes", JSON.toJSONString(next))) != 1)
            throw new IllegalStateException("Could not persist node bandwidth reservations; assignment was stopped");
        return Math.toIntExact(LIMITER_BASE + u.getId());
    }
    /** Stage with min(old,new) so failures cannot increase a previously capped account. */
    public synchronized void stage(User desired, User old) {
        if (!unified(desired)) return;
        SortedSet<Long> ids = nodes(old);
        desired.setLimitNodes(JSON.toJSONString(ids));
        int speed = desired.getSpeedMbps() == null ? 0 : desired.getSpeedMbps();
        if (unified(old) && old.getSpeedMbps() != null && old.getSpeedMbps() > 0)
            speed = speed == 0 ? old.getSpeedMbps() : Math.min(speed, old.getSpeedMbps());
        for (Long node : ids) push(desired, node, shareBytes(speed, ids.size()));
        for (Forward f : owned(old)) attach(desired, f);
    }
    private String serviceName(Forward f) {
        UserTunnel p = permissions.selectOne(new QueryWrapper<UserTunnel>().eq("user_id", f.getUserId()).eq("tunnel_id", f.getTunnelId()).last("limit 1"));
        return f.getId() + "_" + f.getUserId() + "_" + (p == null ? 0 : p.getId());
    }
    protected void attach(User u, Forward f) {
        Tunnel t = tunnels.selectById(f.getTunnelId());
        if (t == null) return;
        ok(GostUtil.UpdateService(t.getInNodeId(), serviceName(f), f.getInPort(), Math.toIntExact(LIMITER_BASE + u.getId()), f.getRemoteAddr(), t.getType(), t, f.getStrategy(), f.getInterfaceName()), t.getInNodeId());
        if (f.getStatus() != null && f.getStatus() == 0) ok(GostUtil.PauseService(t.getInNodeId(), serviceName(f)), t.getInNodeId());
    }
    public synchronized void apply(User u) {
        if (!unified(u)) return;
        pending.add(u.getId());
        SortedSet<Long> ids = nodes(u);
        enforce(u);
        IllegalStateException failure = null;
        for (Long node : ids) {
            try { push(u, node, shareBytes(u.getSpeedMbps(), ids.size())); }
            catch (IllegalStateException ex) { failure = ex; }
        }
        if (failure != null) throw failure;
        pending.remove(u.getId());
    }
    public synchronized void syncNode(Long node, com.admin.common.dto.GostConfigDto reported) {
        Map<String, Long> rates = new HashMap<>();
        if (reported.getLimiters() != null) for (com.admin.common.dto.ConfigItem item : reported.getLimiters())
            if (item.getUserBytesPerSecond() != null) rates.put(item.getName(), item.getUserBytesPerSecond());
        for (User u : users.selectList(new QueryWrapper<User>().eq("unified_limits", 1))) {
            SortedSet<Long> ids = nodes(u);
            if (!ids.contains(node)) continue;
            long rate = shareBytes(u.getSpeedMbps(), ids.size());
            if (Objects.equals(rates.get(String.valueOf(LIMITER_BASE + u.getId())), rate)) continue;
            try { push(u, node, rate); }
            catch (IllegalStateException ex) { pending.add(u.getId()); }
        }
    }
    public synchronized void enforce(User u) {
        if (!unified(u)) return;
        boolean blocked = blockedReason(u) != null;
        IllegalStateException failure = null;
        for (Forward f : owned(u)) {
            boolean quotaPause = Boolean.TRUE.equals(f.getQuotaPaused());
            if (!blocked && !quotaPause || blocked && Objects.equals(f.getStatus(), 0)) continue;
            Tunnel t = tunnels.selectById(f.getTunnelId());
            if (t == null) continue;
            String name = serviceName(f);
            try {
                if (blocked) {
                    control(t, name, true);
                } else {
                    if (!Objects.equals(t.getStatus(), 1) || !lineEnabled(f)) continue;
                    UserTunnel p = permissions.selectOne(new QueryWrapper<UserTunnel>().eq("user_id", f.getUserId()).eq("tunnel_id", f.getTunnelId()).last("limit 1"));
                    if (p != null && !Objects.equals(p.getStatus(), 1)) continue;
                    control(t, name, false);
                }
                if (forwards.update(null, new UpdateWrapper<Forward>().eq("id", f.getId()).set("status", blocked ? 0 : 1).set("quota_paused", blocked)) != 1)
                    throw new IllegalStateException("Could not persist quota pause state for forward " + f.getId());
            } catch (IllegalStateException ex) { failure = ex; }
        }
        if (failure != null) throw failure;
    }
    private boolean lineEnabled(Forward f) {
        InboundUser iu = inboundUsers.selectOne(new QueryWrapper<InboundUser>().eq("gost_forward_id", f.getId()).last("limit 1"));
        if (iu == null) return true;
        if (Objects.equals(iu.getStatus(), 0)) return false;
        Inbound in = inbounds.selectById(iu.getInboundId());
        if (in == null) return false;
        QueryWrapper<InboundLine> query = new QueryWrapper<InboundLine>().eq("user_id", iu.getUserId()).eq("node_id", in.getNodeId());
        if (in.getLandingId() == null) query.isNull("landing_id"); else query.eq("landing_id", in.getLandingId());
        InboundLine line = lines.selectOne(query.last("limit 1"));
        return line == null || !Objects.equals(line.getStatus(), 0);
    }
    protected void control(Tunnel t, String name, boolean pause) {
        ok(pause ? GostUtil.PauseService(t.getInNodeId(), name) : GostUtil.ResumeService(t.getInNodeId(), name), t.getInNodeId());
        if (Objects.equals(t.getType(), 2))
            ok(pause ? GostUtil.PauseRemoteService(t.getOutNodeId(), name) : GostUtil.ResumeRemoteService(t.getOutNodeId(), name), t.getOutNodeId());
    }
    public String subscriptionHeader(String token) {
        User u = users.selectOne(new QueryWrapper<User>().eq("all_sub_token", token).last("limit 1"));
        if (u == null) {
            InboundUser iu = inboundUsers.selectOne(new QueryWrapper<InboundUser>().eq("sub_token", token).last("limit 1"));
            if (iu != null) u = users.selectById(iu.getUserId());
        }
        if (!unified(u)) return null;
        return "upload=" + (u.getOutFlow() == null ? 0 : u.getOutFlow())
                + "; download=" + (u.getInFlow() == null ? 0 : u.getInFlow())
                + "; total=" + (u.getFlow() == null ? 0 : u.getFlow() * GB)
                + "; expire=" + (u.getExpTime() == null ? 0 : u.getExpTime() / 1000);
    }
    @Scheduled(fixedDelay = 30000, initialDelay = 45000)
    public void check() {
        for (User u : users.selectList(new QueryWrapper<User>().eq("unified_limits", 1))) {
            try { if (pending.contains(u.getId())) apply(u); else enforce(u); } catch (Exception e) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("User {} limit sync failed: {}", u.getId(), e.getMessage()); }
        }
    }
}
