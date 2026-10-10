package com.admin.service;

import com.admin.common.dto.InboundUserDto;
import com.admin.common.dto.UserProtocolAccessDto;
import com.admin.common.lang.R;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.stereotype.Service;
import javax.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Desired access is persisted separately from acknowledgement of node configuration. */
@Service
public class UserProtocolAccessService {
    @Resource private InboundService inbounds;
    @Resource private InboundUserMapper assignments;
    @Resource private UserMapper users;
    @Resource private NodeMapper nodes;
    @Resource private LandingMapper landings;
    @Resource private ForwardService forwards;
    @Resource private UserLimitService userLimits;

    private boolean revoking(InboundUser row) {
        return row.getPendingAction() != null && row.getPendingAction().startsWith("revoke");
    }
    private void persist(InboundUser row) {
        if (assignments.updateById(row) != 1) throw new IllegalStateException("Could not persist pending protocol access");
    }
    private List<InboundUser> rows(Long userId) {
        return assignments.selectList(new QueryWrapper<InboundUser>().eq("user_id", userId));
    }
    private String revision(List<Inbound> available, List<InboundUser> rows) {
        List<String> values = new ArrayList<>();
        for (Inbound in : available) values.add("p:" + in.getId() + ":" + in.getUpdatedTime() + ":" + in.getStatus());
        for (InboundUser row : rows) values.add("u:" + row.getId() + ":" + row.getInboundId() + ":" + row.getStatus() + ":" + row.getPendingAction());
        Collections.sort(values);
        try {
            return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256")
                    .digest(String.join("|", values).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    public synchronized R get(Long userId) {
        if (users.selectById(userId) == null) return R.err("User does not exist");
        List<Inbound> available = inbounds.list();
        List<InboundUser> current = rows(userId);
        Map<Long, InboundUser> byId = new HashMap<>();
        for (InboundUser row : current) byId.put(row.getInboundId(), row);
        List<Map<String, Object>> protocols = new ArrayList<>();
        for (Inbound in : available) {
            InboundUser row = byId.get(in.getId());
            Node node = nodes.selectById(in.getNodeId());
            Landing landing = in.getLandingId() == null ? null : landings.selectById(in.getLandingId());
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("id", in.getId()); p.put("nodeId", in.getNodeId());
            p.put("nodeName", node == null ? String.valueOf(in.getNodeId()) : node.getName());
            p.put("landingId", in.getLandingId()); p.put("landingName", landing == null ? null : landing.getName());
            p.put("protocol", in.getProtocol()); p.put("security", in.getSecurity());
            p.put("remark", in.getRemark()); p.put("listenPort", in.getListenPort());
            p.put("enabled", !Integer.valueOf(0).equals(in.getStatus()));
            p.put("selected", row != null && !revoking(row));
            p.put("paused", row != null && Integer.valueOf(0).equals(row.getStatus()) && !revoking(row));
            p.put("pending", row == null ? null : revoking(row) ? "revoke" : row.getPendingAction());
            protocols.add(p);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("protocols", protocols); result.put("revision", revision(available, current));
        return R.ok(result);
    }

    // Serialize saves and reject stale snapshots before making any changes.
    // Node operations cannot be a SQL transaction; retain rows until revocation is acknowledged.
    public synchronized R save(Long userId, UserProtocolAccessDto dto) {
        if (users.selectById(userId) == null) return R.err("User does not exist");
        List<Inbound> available = inbounds.list();
        List<InboundUser> current = rows(userId);
        if (!revision(available, current).equals(dto.getRevision()))
            return R.err("Protocol access changed. Reload before saving.");
        Set<Long> selected = new HashSet<>(dto.getInboundIds());
        if (selected.size() != dto.getInboundIds().size()) return R.err("Duplicate protocol IDs");
        Map<Long, Inbound> byId = new HashMap<>();
        for (Inbound in : available) byId.put(in.getId(), in);
        if (!byId.keySet().containsAll(selected)) return R.err("A selected protocol no longer exists");
        Map<Long, InboundUser> existing = new HashMap<>();
        for (InboundUser row : current) existing.put(row.getInboundId(), row);
        for (Long id : selected) {
            if (!existing.containsKey(id) && Integer.valueOf(0).equals(byId.get(id).getStatus()))
                return R.err("Cannot grant a disabled protocol: " + id);
        }
        List<Map<String, Object>> outcomes = new ArrayList<>();
        for (Inbound in : available) {
            InboundUser row = existing.get(in.getId());
            boolean wanted = selected.contains(in.getId());
            if (wanted && row != null && row.getPendingAction() == null) continue;
            if (!wanted && row == null) continue;
            String error = null;
            try {
                if (wanted) {
                    if (row == null) {
                        InboundUserDto grant = new InboundUserDto();
                        grant.setUserId(userId); grant.setInboundId(in.getId());
                        R result = inbounds.assignUser(grant);
                        row = assignments.selectOne(new QueryWrapper<InboundUser>().eq("user_id", userId).eq("inbound_id", in.getId()));
                        if (result.getCode() != 0) error = result.getMsg();
                    } else {
                        if (row.getGostForwardId() == null || forwards.getById(row.getGostForwardId()) == null)
                            throw new IllegalStateException("Assignment forwarding service is missing. Revoke it, then grant access again.");
                        userLimits.prepare(userId, in.getNodeId());
                        if (revoking(row)) row.setStatus("revoke-paused".equals(row.getPendingAction()) ? 0 : 1);
                        row.setPendingAction("grant"); persist(row);
                        userLimits.enforce(users.selectById(userId));
                        R result = inbounds.pushNodeConfig(in.getNodeId());
                        if (result.getCode() != 0) error = result.getMsg();
                    }
                    if (row != null && error == null) {
                        // MyBatis ignores null fields by default; clear explicitly.
                        if (assignments.update(null, new com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<InboundUser>()
                                .eq("id", row.getId()).set("pending_action", null)) != 1)
                            throw new IllegalStateException("Could not persist node acknowledgement");
                    }
                } else {
                    if (!revoking(row)) {
                        row.setPendingAction(Integer.valueOf(0).equals(row.getStatus()) ? "revoke-paused" : "revoke-active");
                        row.setStatus(0); persist(row);
                    }
                    R pushed = inbounds.pushNodeConfig(in.getNodeId());
                    if (pushed.getCode() != 0) error = pushed.getMsg();
                    if (error == null && row.getGostForwardId() != null && forwards.getById(row.getGostForwardId()) != null) {
                        R deleted = forwards.deleteForward(row.getGostForwardId());
                        if (deleted.getCode() != 0) error = deleted.getMsg();
                    }
                    if (error == null && assignments.deleteById(row.getId()) != 1)
                        throw new IllegalStateException("Could not remove revoked assignment");
                }
            } catch (Exception failure) { error = failure.getMessage() == null ? "Node synchronization failed" : failure.getMessage(); }
            Map<String, Object> outcome = new LinkedHashMap<>();
            outcome.put("inboundId", in.getId()); outcome.put("nodeId", in.getNodeId());
            outcome.put("action", wanted ? "grant" : "revoke"); outcome.put("success", error == null); outcome.put("error", error);
            outcomes.add(outcome);
        }
        R refreshed = get(userId);
        @SuppressWarnings("unchecked") Map<String, Object> data = (Map<String, Object>) refreshed.getData();
        data.put("outcomes", outcomes);
        return refreshed;
    }
}
