package com.admin.common.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Positive;

@Data
@EqualsAndHashCode(callSuper = true)
public class NodeWarpDto extends WarpRoutingPolicy {
    @NotNull @Positive
    private Long nodeId;
}
