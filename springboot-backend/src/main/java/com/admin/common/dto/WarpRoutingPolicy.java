package com.admin.common.dto;

import com.alibaba.fastjson.JSON;
import lombok.Data;
import java.net.IDN;
import java.util.*;

/** Persisted node policy; the WARP proxy always stays on loopback. */
@Data
public class WarpRoutingPolicy {
    private Boolean enabled = false;
    @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = com.admin.common.utils.PortNumberDeserializer.class)
    private Integer port = 31000;
    private List<String> domains = List.of("google.com", "google.com.hk", "googleapis.com",
            "gstatic.com", "googleusercontent.com", "notebook.google");

    public WarpRoutingPolicy normalized() {
        if (enabled == null) throw new IllegalArgumentException("Choose whether WARP routing is enabled");
        if (port == null || port < 1 || port > 65535)
            throw new IllegalArgumentException("WARP proxy port must be between 1 and 65535");
        if (domains == null || domains.isEmpty() || domains.size() > 100)
            throw new IllegalArgumentException("Provide between 1 and 100 domain suffixes");
        Set<String> clean = new LinkedHashSet<>();
        for (String value : domains) {
            if (value == null || value.isBlank()) throw new IllegalArgumentException("Domain suffix cannot be empty");
            String domain;
            try { domain = IDN.toASCII(value.trim(), IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT); }
            catch (IllegalArgumentException e) { throw new IllegalArgumentException("Invalid domain suffix"); }
            if (domain.length() > 253 || !domain.contains(".") || domain.endsWith(".")
                    || !domain.matches("[a-z0-9.-]+") || domain.matches("[0-9.]+"))
                throw new IllegalArgumentException("Enter domain suffixes such as google.com, without URLs or wildcards");
            clean.add(domain);
        }
        WarpRoutingPolicy result = new WarpRoutingPolicy();
        result.setEnabled(enabled); result.setPort(port); result.setDomains(new ArrayList<>(clean));
        return result;
    }

    public static WarpRoutingPolicy fromStored(String json) {
        if (json == null || json.isBlank()) return new WarpRoutingPolicy();
        try {
            WarpRoutingPolicy policy = JSON.parseObject(json, WarpRoutingPolicy.class);
            if (policy == null) throw new IllegalArgumentException();
            return policy.normalized();
        } catch (RuntimeException e) {
            // Refuse to silently drop enabled routing if stored policy is malformed.
            throw new IllegalArgumentException("Stored WARP policy is invalid; save WARP settings again");
        }
    }
}
