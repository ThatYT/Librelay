package com.admin.common.task;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.common.utils.GostUtil;
import com.admin.entity.*;
import com.admin.service.*;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
public class CheckGostConfigAsync {

    /**
     * 「每车友一个」限速器的名字基数(名字 = 该基数 + userId),协议/中转限速用。
     * 这类限速器在 speed_limit 表里没有对应行,配置巡检必须放行、不能当孤儿清理。
     * 与 InboundServiceImpl.perUserLimiterName 必须保持一致。
     */
    public static final long PER_USER_LIMITER_BASE = 900000000L;

    @Resource
    private com.admin.service.UserLimitService userLimits;

    @Resource
    private NodeService nodeService;

    @Resource
    @Lazy
    private ForwardService forwardService;

    @Resource
    @Lazy
    private SpeedLimitService speedLimitService;

    @Resource
    @Lazy
    private TunnelService tunnelService;

    @Resource
    @Lazy
    private UserService userService;



    /**
     * 清理孤立的Gost配置项
     */
    @Async
    public void cleanNodeConfigs(String node_id, GostConfigDto gostConfig) {
        System.out.println(JSONObject.toJSONString(gostConfig));
        Node node = nodeService.getById(node_id);
        if (node != null) {
            cleanOrphanedServices(gostConfig, node);
            cleanOrphanedChains(gostConfig, node);
            cleanOrphanedLimiters(gostConfig, node);
            try { userLimits.syncNode(node.getId(), gostConfig); }
            catch (Exception ex) { log.warn("User limit sync failed: {}", ex.getMessage()); }
        }
    }

    /**
     * 清理孤立的服务
     */
    private void cleanOrphanedServices(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getServices() == null) {
            return;
        }

        for (ConfigItem service : gostConfig.getServices()) {
            safeExecute(() -> {

                if (!Objects.equals(service.getName(), "web_api")){
                    String[] serviceIds = parseServiceName(service.getName());
                    if (serviceIds.length == 4) {
                        String forwardId = serviceIds[0];
                        String userId = serviceIds[1];
                        String userTunnelId = serviceIds[2];
                        String type = serviceIds[3];

                        if (Objects.equals(type, "tcp")) { // 只处理TCP，避免重复处理
                            Forward forward = forwardService.getById(forwardId);
                            if (forward == null) {
                                log.info("删除孤立的服务: {} (节点: {})", service.getName(), node.getId());
                                GostDto gostDto = GostUtil.DeleteService(node.getId(), forwardId + "_" + userId + "_" + userTunnelId);
                                System.out.println(gostDto);
                            }
                        }


                        if (Objects.equals(type, "tls")) {
                            Forward forward = forwardService.getById(forwardId);
                            if (forward == null) {
                                log.info("删除孤立的服务: {} (节点: {})", service.getName(), node.getId());
                                GostUtil.DeleteRemoteService(node.getId(), forwardId+"_"+userId+"_"+userTunnelId);
                            }
                        }

                    }
                }


            }, "清理服务 " + service.getName());
        }

    }

    /**
     * 清理孤立的链
     */
    private void cleanOrphanedChains(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getChains() == null) {
            return;
        }
        

        for (ConfigItem chain : gostConfig.getChains()) {
            safeExecute(() -> {
                String[] serviceIds = parseServiceName(chain.getName());
                if (serviceIds.length == 4) {
                    String forwardId = serviceIds[0];
                    String userId = serviceIds[1];
                    String userTunnelId = serviceIds[2];
                    String type = serviceIds[3];
                    
                    if (Objects.equals(type, "chains")) {
                        Forward forward = forwardService.getById(forwardId);
                        if (forward == null) {
                            log.info("删除孤立的链: {} (节点: {})", chain.getName(), node.getId());
                            GostUtil.DeleteChains(node.getId(), forwardId+"_"+userId+"_"+userTunnelId);
                        }
                    }
                }
            }, "清理链 " + chain.getName());
        }
    }

    /**
     * 清理孤立的限流器
     */
    private void cleanOrphanedLimiters(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getLimiters() == null) {
            return;
        }
        

        for (ConfigItem limiter : gostConfig.getLimiters()) {
            safeExecute(() -> {
                // 协议/中转用的是「每车友一个」限速器,名字 = 900000000 + userId,
                // speed_limit 表里当然查不到 —— 不能拿"表里没有"当孤儿判据:
                // 一删,转发引用的限速器就不存在了,gost 会静默忽略,等于完全不限速。
                // 但也不能无条件放行,否则车友删号后限速器永远留在节点上。
                // 判据换成「这个 userId 还在不在」:人还在就留着,人没了才清。
                long limiterId = Long.parseLong(limiter.getName());
                if (limiterId >= com.admin.service.UserLimitService.LIMITER_BASE && limiterId < PER_USER_LIMITER_BASE) {
                    if (userService.getById(limiterId - com.admin.service.UserLimitService.LIMITER_BASE) == null)
                        GostUtil.DeleteLimiters(node.getId(), limiterId);
                    return;
                }
                if (limiterId >= PER_USER_LIMITER_BASE) {
                    long ownerId = limiterId - PER_USER_LIMITER_BASE;
                    if (userService.getById(ownerId) != null) {
                        return;
                    }
                    log.info("删除已删用户的限速器: {} (节点: {})", limiter.getName(), node.getId());
                    GostUtil.DeleteLimiters(node.getId(), limiterId);
                    return;
                }
                SpeedLimit speedLimit = speedLimitService.getById(limiter.getName());
                if (speedLimit == null) {
                    log.info("删除孤立的限流器: {} (节点: {})", limiter.getName(), node.getId());
                    GostUtil.DeleteLimiters(node.getId(), limiterId);
                }
            }, "清理限流器 " + limiter.getName());
        }
    }

    /**
     * 同步限流器
     */
    private void syncLimiters(GostConfigDto gostConfig, Node node) {
        List<Tunnel> tunnelList = tunnelService.list(new QueryWrapper<Tunnel>().eq("in_node_id", node.getId()));
        if (tunnelList == null || tunnelList.isEmpty()) return;
        safeExecute(() -> {
            StringBuilder tunnelIds = new StringBuilder();
            for (Tunnel tunnel : tunnelList) {
                tunnelIds.append(tunnel.getId()).append(",");
            }
            String ids = tunnelIds.deleteCharAt(tunnelIds.length() - 1).toString();
            List<SpeedLimit> speedLimits = speedLimitService.list(new QueryWrapper<SpeedLimit>().in("tunnel_id", ids));
            if (speedLimits != null && !speedLimits.isEmpty()) {
                List<ConfigItem> limiters = gostConfig.getLimiters();
                List<Long> limiters_ids = new ArrayList<>();
                List<Long>  speedLimits_ids = new ArrayList<>();
                if (limiters != null){
                    for (ConfigItem limiter : limiters) {
                        limiters_ids.add(Long.valueOf(limiter.getName()));
                    }
                }
                for (SpeedLimit speedLimit : speedLimits) {
                    speedLimits_ids.add(speedLimit.getId());
                }
                List<Long> diff = new ArrayList<>(speedLimits_ids);
                diff.removeAll(limiters_ids);
                System.out.println(diff);
                if (!diff.isEmpty()) {

                    for (Long speed_id : diff) {
                        SpeedLimit speedLimit = speedLimitService.getById(speed_id);
                        if (speedLimit != null) {
                            SpeedLimitUpdateDto speedLimitUpdateDto = new SpeedLimitUpdateDto();
                            speedLimitUpdateDto.setId(speed_id);
                            speedLimitUpdateDto.setName(speedLimit.getName());
                            speedLimitUpdateDto.setSpeed(speedLimit.getSpeed());
                            speedLimitUpdateDto.setTunnelId(speedLimit.getTunnelId());
                            speedLimitUpdateDto.setTunnelName(speedLimit.getTunnelName());
                            speedLimitService.updateSpeedLimit(speedLimitUpdateDto);
                        }
                    }
                }
            }
        }, "同步限流器 ");
    }

    /**
     * 安全执行操作，捕获异常
     */
    private void safeExecute(Runnable operation, String operationDesc) {
        try {
            operation.run();
        } catch (Exception e) {
            log.info("执行操作失败: {}", operationDesc, e);
        }
    }


    /**
     * 解析服务名称
     */
    private String[] parseServiceName(String serviceName) {
        return serviceName.split("_");
    }
}
