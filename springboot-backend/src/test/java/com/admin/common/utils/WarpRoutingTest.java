package com.admin.common.utils;

import com.admin.common.dto.*;
import com.admin.entity.*;
import com.admin.mapper.NodeMapper;
import com.alibaba.fastjson.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WarpRoutingTest {
    private Inbound inbound(String protocol, boolean publicListen) {
        Inbound in = new Inbound(); in.setId(1L); in.setNodeId(7L); in.setTag("audit-in");
        in.setProtocol(protocol); in.setPublicListen(publicListen); in.setListenPort(40000);
        in.setEgressPort(40001); in.setSni("www.bing.com"); in.setStatus(1); in.setLandingId(9L);
        return in;
    }
    private InboundUser user() {
        InboundUser user = new InboundUser(); user.setId(3L); user.setUuid("016b97eb-a739-4e29-bc9e-cb5848eecf5e");
        user.setPassword("stored-credential"); user.setEgressPort(20000); user.setStatus(1); return user;
    }
    private WarpRoutingPolicy enabled() { WarpRoutingPolicy policy = new WarpRoutingPolicy(); policy.setEnabled(true); return policy; }

    @Test void privateMeterUsesStandardSocksUdpWithSingboxGateway() {
        JSONObject chain = GostUtil.buildSocksChain("meter", "127.0.0.1:40001");
        JSONObject metadata = chain.getJSONArray("hops").getJSONObject(0).getJSONArray("nodes")
                .getJSONObject(0).getJSONObject("connector").getJSONObject("metadata");
        assertEquals("udp",metadata.getString("relay"));
        assertTrue(metadata.getBooleanValue("notls"));
    }
    @Test void disabledAndUnconfiguredNodesHaveIdenticalConfigurations() {
        for (boolean publicListen : List.of(true, false)) {
            Inbound in = inbound("hysteria2", publicListen);
            assertEquals(SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L,List.of(user())), Map.of()),
                    SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L,List.of(user())), Map.of(), new WarpRoutingPolicy()));
        }
    }
    @Test void warpRulesRunAfterMeteringAndBeforeLandingForPublicAndLegacyProtocols() {
        for (String protocol : List.of("hysteria2", "tuic", "vmess")) for (boolean publicListen : List.of(true, false)) {
            Inbound in = inbound(protocol, publicListen); InboundUser user = user();
            Map<Long,String> landings = Map.of(9L,"{\"type\":\"socks\",\"server\":\"127.0.0.1\",\"server_port\":1080}");
            JSONObject base = SingboxUtil.buildNodeConfig(List.of(in),Map.of(1L,List.of(user)),landings);
            JSONObject config = SingboxUtil.buildNodeConfig(List.of(in),Map.of(1L,List.of(user)),landings,enabled());
            assertEquals(base.getJSONArray("inbounds"),config.getJSONArray("inbounds"));
            JSONArray rules = config.getJSONObject("route").getJSONArray("rules");
            int start = publicListen ? 3 : 0;
            if (publicListen) {
                assertEquals("udp",rules.getJSONObject(0).getString("network"));
                assertEquals("reject",rules.getJSONObject(0).getString("action"));
                assertEquals("meter-3",rules.getJSONObject(1).getString("outbound"));
                assertEquals(user.getUuid(),rules.getJSONObject(1).getJSONArray("auth_user").getString(0));
                assertEquals("reject",rules.getJSONObject(2).getString("action"));
            }
            JSONObject reject = rules.getJSONObject(start), route = rules.getJSONObject(start+1);
            assertEquals(publicListen ? "egress-1" : "audit-in", route.getJSONArray("inbound").getString(0));
            assertEquals("udp",reject.getString("network")); assertEquals("reject",reject.getString("action"));
            assertEquals("tcp",route.getString("network")); assertEquals("warp-google",route.getString("outbound"));
            assertEquals(enabled().getDomains(), route.getJSONArray("domain_suffix").toJavaList(String.class));
            assertEquals("landing-9",rules.getJSONObject(start+2).getString("outbound"));
            assertEquals("direct",config.getJSONObject("route").getString("final"));
            assertEquals(config,SingboxUtil.buildNodeConfig(List.of(in),Map.of(1L,List.of(user)),landings,enabled()));
            assertEquals("stored-credential",user.getPassword());
        }
    }
    @Test void persistedPolicyIsReloadedOnEveryNodePush() {
        NodeMapper nodes = mock(NodeMapper.class);
        Node node = new Node(); node.setId(7L); node.setWarpRouting(JSON.toJSONString(enabled()));
        when(nodes.selectById(7L)).thenReturn(node);
        List<JSONObject> sent = new ArrayList<>();
        NodeCommandClient commands = new NodeCommandClient() {
            @Override public GostDto send(Long id, JSONObject request, String type) {
                assertEquals("SetSingboxConfig",type); sent.add(request); GostDto result = new GostDto(); result.setMsg("OK"); return result;
            }
        };
        ReflectionTestUtils.setField(commands,"nodes",nodes);
        for (int port : List.of(8443, 9443)) {
            Inbound in = inbound("hysteria2",true); in.setListenPort(port);
            commands.configure(7L,List.of(in),Map.of(1L,List.of(user())),Map.of());
        }
        for (JSONObject payload : sent) assertTrue(payload.getJSONObject("config").getJSONArray("outbounds").stream()
                .anyMatch(value -> "warp-google".equals(((JSONObject)value).getString("tag"))));
        node.setWarpRouting(null);
        commands.configure(7L,List.of(inbound("tuic",true)),Map.of(1L,List.of(user())),Map.of());
        assertFalse(sent.get(2).toJSONString().contains("warp-google"));
        node.setWarpRouting("invalid-json");
        assertThrows(IllegalArgumentException.class,() -> commands.configure(7L,List.of(),Map.of(),Map.of()));
        assertEquals(3,sent.size());
    }
    @Test void invalidPolicyCannotGenerateABroadOrUnintendedRoute() {
        for (String domain : List.of("", "*", "*.google.com", ".google.com", "com", "127.0.0.1", "https://google.com", "google.com/path", "a..com")) {
            WarpRoutingPolicy policy = enabled(); policy.setDomains(List.of(domain));
            assertThrows(IllegalArgumentException.class,policy::normalized,domain);
        }
        for (Integer port : Arrays.asList(null,0,65536)) {
            WarpRoutingPolicy policy = enabled(); policy.setPort(port);
            assertThrows(IllegalArgumentException.class,policy::normalized);
        }
        WarpRoutingPolicy policy = enabled(); policy.setDomains(List.of(" GOOGLE.COM ","google.com","例子.测试"));
        assertEquals(List.of("google.com","xn--fsqu00a.xn--0zwm56d"),policy.normalized().getDomains());
        assertEquals(false,WarpRoutingPolicy.fromStored(null).getEnabled());
    }
    @Test void emitRealRuntimeFixturesWhenRequested() throws Exception {
        String directory = System.getProperty("librelay.warp.fixtures"); if (directory == null) return;
        Files.createDirectories(Path.of(directory));
        for (String protocol : List.of("hysteria2","tuic")) for (boolean publicListen : List.of(true,false)) {
            Inbound in = inbound(protocol,publicListen);
            WarpRoutingPolicy policy = enabled(); policy.setDomains(List.of("warp.test"));
            JSONObject config = SingboxUtil.buildNodeConfig(List.of(in),Map.of(1L,List.of(user())),Map.of(),policy);
            JSONObject tls = config.getJSONArray("inbounds").getJSONObject(0).getJSONObject("tls");
            tls.put("certificate_path",System.getProperty("tms.singbox.cert"));
            tls.put("key_path",System.getProperty("tms.singbox.key"));
            Files.writeString(Path.of(directory,protocol+(publicListen ? "-public.json" : "-legacy.json")),config.toJSONString());
        }
    }
}
