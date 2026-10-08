package com.admin.entity;


import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class User extends BaseEntity {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 创建时间（时间戳）
     */
    private Long createdTime;

    /**
     * 更新时间（时间戳）
     */
    private Long updatedTime;

    /**
     * 状态（0：正常，1：删除）
     */
    private Integer status;

    private String user;

    private String pwd;

    private Integer roleId;

    private Long expTime;

    private Long flow;

    private Long inFlow;

    private Long outFlow;

    private Integer num;

    private Long flowResetTime;

    /**
     * 「全部线路」聚合订阅的 token(可空,第一次取订阅时才生成)。
     * 车友有几条线路就有几条独立订阅,发起来麻烦;这条一次包含他所有未停用的线路,
     * 以后给他新开线路也不用重发链接 —— 客户端更新订阅就自动出现。
     */
    private String allSubToken;

    /** Opt-in replacement for legacy line/tunnel/forward plans. */
    private Boolean unifiedLimits;
    private Integer speedMbps;
    /** Durable node reservations; never silently reclaim an offline node's budget. */
    private String limitNodes;


}
