package com.admin.common.dto;

import lombok.Data;
import javax.validation.constraints.*;
import java.util.List;

@Data
public class UserProtocolAccessDto {
    @Min(1) private Long userId; // null = current administrator
    @NotNull @Size(max = 10000)
    private List<@NotNull @Min(1) Long> inboundIds;
    @NotBlank @Size(max = 128) private String revision;
}
