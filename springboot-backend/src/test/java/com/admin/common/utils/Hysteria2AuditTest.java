package com.admin.common.utils;

import com.admin.entity.Inbound;
import com.admin.entity.InboundUser;
import com.alibaba.fastjson.JSONObject;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class Hysteria2AuditTest {
    private static final String UUID = "016b97eb-a739-4e29-bc9e-cb5848eecf5e";
    private static final String PASSWORD = "p@ss:/?#[]%+ &='\"密碼~*";

    @Test void uriComponentsRoundTripForIpv4Ipv6AndDns() {
        for (String host : List.of("192.0.2.1", "2001:db8::1", "[2001:db8::1]", "node.example")) {
            String sni = "sni.example&insecure=0#?+ 空";
            String remark = "HY2 + 测试/#";
            String link = SingboxUtil.buildHysteria2Link(PASSWORD, host, 443, sni, remark);
            URI uri = URI.create(link);
            assertEquals(PASSWORD, uri.getUserInfo());
            assertEquals(443, uri.getPort());
            assertEquals(host.contains(":") ? "[2001:db8::1]" : host, uri.getHost());
            assertEquals(remark, uri.getFragment());
            String[] query = uri.getRawQuery().split("&");
            assertEquals(2, query.length);
            assertEquals(sni, URLDecoder.decode(query[0].substring(4), StandardCharsets.UTF_8));
            assertEquals("insecure=1", query[1]);
            assertFalse(link.contains("+"));
            JSONObject imported = LandingUtil.parse(link).outbound;
            assertEquals(PASSWORD, imported.getString("password"));
            assertEquals(host.replace("[", "").replace("]", ""), imported.getString("server"));
            assertEquals(sni, imported.getJSONObject("tls").getString("server_name"));
        }
    }

    @Test void ordinarySubscriptionsKeepTheirFormat() {
        assertEquals("hysteria2://abc123@192.0.2.1:443?sni=www.bing.com&insecure=1#HY2",
                SingboxUtil.buildHysteria2Link("abc123", "192.0.2.1", 443, "www.bing.com", "HY2"));
        assertEquals("hysteria2://abc@node.example:443?sni=&insecure=1#",
                SingboxUtil.buildHysteria2Link("abc", "node.example", 443, null, null));
    }

    private Inbound inbound(String protocol, boolean publicListen) {
        Inbound in = new Inbound();
        in.setId(1L); in.setProtocol(protocol); in.setTag("audit-in");
        in.setListenPort(40000); in.setEgressPort(40001);
        in.setPublicListen(publicListen); in.setStatus(1); in.setSni("www.bing.com");
        return in;
    }

    private InboundUser user() {
        InboundUser user = new InboundUser();
        user.setId(3L); user.setUuid(UUID); user.setPassword(PASSWORD);
        user.setEgressPort(20000); user.setStatus(1);
        return user;
    }

    @Test void configExportsAndCredentialLifecycleStayConsistent() {
        for (boolean publicListen : List.of(true, false)) {
            Inbound in = inbound("hysteria2", publicListen);
            InboundUser active = user(), disabled = user(), empty = user();
            disabled.setStatus(0); empty.setPassword("");
            JSONObject config = SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L, List.of(active, disabled, empty)), Map.of());
            JSONObject listener = config.getJSONArray("inbounds").getJSONObject(0);
            assertEquals(publicListen ? "::" : "127.0.0.1", listener.getString("listen"));
            assertEquals(40000, listener.getIntValue("listen_port"));
            assertEquals(1, listener.getJSONArray("users").size());
            assertEquals(PASSWORD, listener.getJSONArray("users").getJSONObject(0).getString("password"));
            assertEquals(publicListen ? UUID : null, listener.getJSONArray("users").getJSONObject(0).getString("name"));
            assertEquals("/etc/gost/certs/self.crt", listener.getJSONObject("tls").getString("certificate_path"));
            assertFalse(listener.containsKey("obfs"));
            assertEquals(config, SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L, List.of(active, disabled, empty)), Map.of()));
            assertEquals(PASSWORD, active.getPassword());
            assertEquals(UUID, active.getUuid());
            Map<String, Object> proxy = ClashUtil.toProxy("hysteria2", "audit", "2001:db8::1", 40000,
                    UUID, SingboxUtil.clientPassword(in, active), in.getSni(), null, null, null);
            Map<?, ?> yaml = new Yaml().load(new Yaml().dump(proxy));
            assertEquals("hysteria2", yaml.get("type"));
            assertEquals(PASSWORD, yaml.get("password"));
            assertEquals("2001:db8::1", yaml.get("server"));
            assertEquals(40000, yaml.get("port"));
            assertEquals(in.getSni(), yaml.get("sni"));
            assertEquals(true, yaml.get("skip-cert-verify"));
            assertFalse(yaml.containsKey("obfs"));
            active.setStatus(0);
            assertTrue(SingboxUtil.buildInbound(in, List.of(active)).getJSONArray("users").isEmpty());
        }
    }

    // Optional fixtures consumed by TestQUICProtocolPaths with the real node sing-box release.
    @Test void emitRuntimeFixturesWhenRequested() throws Exception {
        String directory = System.getProperty("librelay.quic.fixtures");
        if (directory == null) return;
        Files.createDirectories(Path.of(directory));
        Map<String, Object> proxy = ClashUtil.toProxy("hysteria2", "audit", "127.0.0.1", 40000,
                UUID, PASSWORD, "www.bing.com", null, null, null);
        Files.writeString(Path.of(directory, "mihomo.yaml"), new Yaml().dump(Map.of(
                "mixed-port", 17890, "mode", "rule", "log-level", "silent",
                "proxies", List.of(proxy), "rules", List.of("MATCH,audit"))));
        for (String protocol : List.of("hysteria2", "tuic")) {
            for (boolean publicListen : List.of(true, false)) {
                Inbound in = inbound(protocol, publicListen);
                JSONObject config = SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L, List.of(user())), Map.of());
                JSONObject tls = config.getJSONArray("inbounds").getJSONObject(0).getJSONObject("tls");
                tls.put("certificate_path", System.getProperty("tms.singbox.cert"));
                tls.put("key_path", System.getProperty("tms.singbox.key"));
                Files.writeString(Path.of(directory, protocol + (publicListen ? "-public.json" : "-legacy.json")), config.toJSONString());
            }
        }
    }
}
