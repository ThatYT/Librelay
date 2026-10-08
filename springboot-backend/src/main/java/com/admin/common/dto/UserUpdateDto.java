package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Min;

@Data
public class UserUpdateDto {

    @NotNull(message = "用户ID不能为空")
    private Long id;

    @NotBlank(message = "用户名不能为空")
    private String user;

    private String pwd; // 更新时密码可选

    @NotNull(message = "流量不能为空")
    @Min(value = 0, message = "流量不能小于0")
    @javax.validation.constraints.Max(value = 1000000, message = "Quota must not exceed 1000000 GiB")
    private Long flow;

    @NotNull(message = "转发数量不能为空")
    @Min(value = 0, message = "转发数量不能小于0")
    private Integer num;

    @NotNull(message = "过期时间不能为空")
    private Long expTime;

    @NotNull(message = "流量重置时间不能为空")
    @Min(value = 0, message = "Reset day must be between 0 and 31")
    @javax.validation.constraints.Max(value = 31, message = "Reset day must be between 0 and 31")
    private Long flowResetTime;

    private Integer status;

    private Boolean unifiedLimits;
    @Min(value = 0, message = "Speed must be non-negative")
    @javax.validation.constraints.Max(value = 1000000, message = "Speed must not exceed 1000000 Mbps")
    private Integer speedMbps;
} 