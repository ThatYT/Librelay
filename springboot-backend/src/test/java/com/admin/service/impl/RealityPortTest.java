package com.admin.service.impl;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.common.utils.*;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.alibaba.fastjson.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RealityPortTest {
    @Test
    void privateSocksBrandingRetainsLegacyForwards() {
        assertTrue(com.admin.common.utils.GostUtil.isPrivateSocksRemote("librelay-socks://127.0.0.1:40000"));
        assertTrue(com.admin.common.utils.GostUtil.isPrivateSocksRemote("tms-socks://127.0.0.1:40000"));
        assertFalse(com.admin.common.utils.GostUtil.isPrivateSocksRemote("socks://127.0.0.1:40000"));
        assertFalse(com.admin.common.utils.GostUtil.isPrivateSocksRemote(null));
    }

    private void emptyTunnelReservations(InboundServiceImpl service) {
        TunnelMapper tunnels = mock(TunnelMapper.class);
        when(tunnels.selectList(any())).thenReturn(List.of());
        ReflectionTestUtils.setField(service, "tunnelMapper", tunnels);
    }
    private Inbound inbound(int port, boolean publicListen) {
        Inbound in = new Inbound(); in.setId(1L); in.setNodeId(7L);
        in.setProtocol("vless"); in.setTag("test"); in.setListenPort(port);
        in.setPublicListen(publicListen); in.setEgressPort(40001);
        in.setSni("www.apple.com"); in.setPrivateKey("private"); in.setPublicKey("public"); in.setShortId("abcd");
        return in;
    }
    @Test void customConfigAndAllExportsUse8443() {
        Inbound in = inbound(8443, true);
        InboundUser user = new InboundUser(); user.setId(3L); user.setUuid("test-uuid"); user.setEgressPort(20000);
        JSONObject config = SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L,List.of(user)), Map.of());
        JSONObject listener = config.getJSONArray("inbounds").getJSONObject(0);
        assertEquals(8443, listener.getIntValue("listen_port")); assertEquals("::",listener.getString("listen"));
        assertEquals(40001, config.getJSONArray("inbounds").getJSONObject(1).getIntValue("listen_port"));
        assertEquals(20000, config.getJSONArray("outbounds").getJSONObject(1).getIntValue("server_port"));
        assertEquals("test-uuid",config.getJSONObject("route").getJSONArray("rules").getJSONObject(0).getJSONArray("auth_user").getString(0));
        Forward f = new Forward(); f.setInPort(20000);
        int port = InboundServiceImpl.clientPort(in, f); assertEquals(8443,port);
        assertTrue(SingboxUtil.buildVlessRealityLink("uuid","node.example",port,"sni","key","sid","name").contains("node.example:8443"));
        assertEquals(8443,ClashUtil.toProxy("vless","name","node.example",port,"uuid","password","sni","key","sid",null,null,null).get("port"));
    }
    @Test void legacyPortsAndLoopbackArePreserved() {
        Inbound in=inbound(40000,false); Forward forward=new Forward(); forward.setInPort(20000);
        assertEquals(20000,InboundServiceImpl.clientPort(in,forward));
        JSONObject listener=SingboxUtil.buildInbound(in,List.of());
        assertEquals(40000,listener.getIntValue("listen_port")); assertEquals("127.0.0.1",listener.getString("listen"));
        Inbound old=inbound(20000,false); assertEquals(20000,SingboxUtil.buildInbound(old,List.of()).getIntValue("listen_port"));
    }
    @Test void defaultAndExplicitPortsAreStoredAndPushed() {
        createAndAssert(null,443); createAndAssert(8443,8443);
    }
    private void createAndAssert(Integer selected,int expected) {
        createAndAssert(selected, expected, Set.of(), "vless");
    }
    @Test void busyPrivateGatewayDoesNotChangeSelectedRealityPort() {
        createAndAssert(null, 443, Set.of(40000, 40001), "vless");
        createAndAssert(8443, 8443, Set.of(40000), "vless");
    }
    @Test void otherAutomaticProtocolsSkipBusyOsPorts() {
        createAndAssert(null, 40002, Set.of(40000, 40001), "vmess");
    }
    private void createAndAssert(Integer selected,int expected,Set<Integer> busyPorts,String protocol) {
        InboundServiceImpl service=new InboundServiceImpl();
        emptyTunnelReservations(service);
        InboundMapper mapper=mock(InboundMapper.class); NodeMapper nodes=mock(NodeMapper.class);
        InboundUserMapper users=mock(InboundUserMapper.class);
        ReflectionTestUtils.setField(service,"baseMapper",mapper); ReflectionTestUtils.setField(service,"nodeMapper",nodes);
        ReflectionTestUtils.setField(service,"inboundUserMapper",users);
        Node node=new Node();node.setId(7L);when(nodes.selectById(7L)).thenReturn(node);
        when(mapper.selectList(any())).thenReturn(List.of()); when(mapper.insert(any())).thenAnswer(call->{((Inbound)call.getArgument(0)).setId(1L);return 1;});
        InboundDto dto=new InboundDto();dto.setNodeId(7L);dto.setProtocol(protocol);dto.setSni("www.apple.com");dto.setListenPort(selected);
        GostDto ok=new GostDto();ok.setMsg("OK");ok.setData(Map.of("privateKey","private","publicKey","public"));
        NodeCommandClient commands=mock(NodeCommandClient.class);
        ReflectionTestUtils.setField(service,"nodeCommands",commands);
        when(commands.send(anyLong(),any(),anyString())).thenAnswer(call -> {
            JSONObject request = call.getArgument(1);
            if (!busyPorts.contains(request.getInteger("port"))) return ok;
            GostDto busy = new GostDto();
            busy.setMsg("TCP port " + request.getInteger("port") + " is unavailable on this node: bind: address already in use");
            return busy;
        });
        when(commands.realityKeypair(anyLong())).thenReturn(ok);
        when(commands.configure(anyLong(),any(),any(),any())).thenReturn(ok);
        {
            R result=service.createInbound(dto);assertEquals(0,result.getCode());
            Inbound stored=(Inbound)result.getData();assertEquals(expected,stored.getListenPort());
            assertTrue(stored.getPublicListen());
            {
                int gateway = 40000;
                while (busyPorts.contains(gateway) || gateway == expected) gateway++;
                assertEquals(gateway,stored.getEgressPort());
            }
        }
    }
    @Test void allProtocolsStoreCustomPublicPortsAndKeepAutomaticAllocation() {
        for (String protocol : List.of("trojan", "vmess", "shadowsocks", "hysteria2", "tuic", "anytls")) {
            createAndAssert(8443, 8443, Set.of(), protocol);
            createAndAssert(null, 40000, Set.of(), protocol);
        }
    }
    @Test void allPublicConfigsAndExportsKeepPortAndMeterIdentity() {
        for (String protocol : List.of("vless", "trojan", "vmess", "shadowsocks", "hysteria2", "tuic", "anytls")) {
            Inbound in = inbound(8443, true); in.setProtocol(protocol);
            in.setConfigJson("{\"method\":\"2022-blake3-aes-256-gcm\",\"password\":\"" + Base64.getEncoder().encodeToString(new byte[32]) + "\"}");
            InboundUser user = new InboundUser();user.setId(3L);user.setUuid(UUID.randomUUID().toString());
            user.setPassword("stored-random-credential");user.setEgressPort(20000);
            JSONObject config = SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L, List.of(user)), Map.of());
            JSONObject listener = config.getJSONArray("inbounds").getJSONObject(0);
            assertEquals(8443, listener.getIntValue("listen_port"), protocol);
            assertEquals("::", listener.getString("listen"), protocol);
            assertEquals(user.getUuid(), listener.getJSONArray("users").getJSONObject(0).getString("name"), protocol);
            assertEquals(user.getUuid(), config.getJSONObject("route").getJSONArray("rules").getJSONObject(0).getJSONArray("auth_user").getString(0));
            Forward forward = new Forward();forward.setInPort(20000);
            String password = SingboxUtil.clientPassword(in, user);
            if (!"anytls".equals(protocol)) assertEquals(8443, ClashUtil.toProxy(protocol, "test", "node.example", InboundServiceImpl.clientPort(in, forward), user.getUuid(), password, "sni", "key", "sid", "2022-blake3-aes-256-gcm").get("port"));
            else assertTrue(SingboxUtil.buildAnyTlsLink(password, "node.example", 8443, "sni", "test").contains("node.example:8443"));
            Node node = new Node();node.setServerIp("node.example");
            String link = ReflectionTestUtils.invokeMethod(new InboundServiceImpl(), "buildClientLink", in, user, node, forward);
            if ("vmess".equals(protocol)) {
                JSONObject exported = JSON.parseObject(new String(Base64.getDecoder().decode(link.substring(8)), java.nio.charset.StandardCharsets.UTF_8));
                assertEquals(8443, exported.getIntValue("port"));
            } else assertTrue(link.contains("node.example:8443"), protocol);
            if ("shadowsocks".equals(protocol)) {
                String[] keys = password.split(":");assertEquals(2, keys.length);
                assertEquals(32, Base64.getDecoder().decode(keys[1]).length);
                assertEquals(keys[1], listener.getJSONArray("users").getJSONObject(0).getString("password"));
                in.setPublicListen(false); assertEquals(keys[0], SingboxUtil.clientPassword(in, user));
            }
        }
    }
    @Test void conflictValidationUsesEachProtocolsActualTransport() {
        for (String protocol : List.of("vless", "trojan", "vmess", "shadowsocks", "hysteria2", "tuic", "anytls")) {
            InboundServiceImpl service = new InboundServiceImpl();emptyTunnelReservations(service);
            InboundMapper mapper = mock(InboundMapper.class);NodeCommandClient commands = mock(NodeCommandClient.class);
            ReflectionTestUtils.setField(service, "baseMapper", mapper);ReflectionTestUtils.setField(service, "nodeCommands", commands);
            when(mapper.selectList(any())).thenReturn(List.of());
            GostDto ok = new GostDto();ok.setMsg("OK");
            when(commands.send(anyLong(),any(),anyString())).thenReturn(ok);
            R result = (R) ReflectionTestUtils.invokeMethod(service, "validateListener", 7L, protocol, 443, null);
            assertEquals(0,result.getCode());
            org.mockito.ArgumentCaptor<JSONObject> requests = org.mockito.ArgumentCaptor.forClass(JSONObject.class);
            int count = "shadowsocks".equals(protocol) ? 2 : 1;
            verify(commands,times(count)).send(eq(7L),requests.capture(),eq("CheckListenPort"));
            Set<String> networks = new HashSet<>();for(JSONObject request:requests.getAllValues())networks.add(request.getString("network"));
            assertEquals("shadowsocks".equals(protocol) ? Set.of("tcp","udp") : Set.of(List.of("hysteria2","tuic").contains(protocol) ? "udp" : "tcp"), networks);
            Inbound udp = inbound(443,true);udp.setId(2L);udp.setProtocol("hysteria2");
            when(mapper.selectList(any())).thenReturn(List.of(udp));
            result = (R) ReflectionTestUtils.invokeMethod(service,"validateListener",7L,protocol,443,null);
            assertEquals(networks.contains("udp"), result.getCode()!=0);
        }
    }
    @Test void internalAllocationStopsOnTimeoutAndBoundsBusyRetries() {
        for (boolean timedOut : List.of(true, false)) {
            InboundServiceImpl service = new InboundServiceImpl();
            emptyTunnelReservations(service);
            InboundMapper mapper = mock(InboundMapper.class); NodeMapper nodes = mock(NodeMapper.class);
            ReflectionTestUtils.setField(service,"baseMapper",mapper);ReflectionTestUtils.setField(service,"nodeMapper",nodes);
            Node node = new Node();node.setId(7L);when(nodes.selectById(7L)).thenReturn(node);
            when(mapper.selectList(any())).thenReturn(List.of());
            NodeCommandClient commands = mock(NodeCommandClient.class);
            ReflectionTestUtils.setField(service,"nodeCommands",commands);
            when(commands.send(anyLong(),any(),anyString())).thenAnswer(call -> {
                JSONObject request = call.getArgument(1); GostDto response = new GostDto();
                response.setMsg(request.getIntValue("port") == 443 ? "OK" : timedOut ? "node connection timed out" : "bind: address already in use");
                return response;
            });
            InboundDto dto = new InboundDto();dto.setNodeId(7L);dto.setProtocol("vless");
            R result = service.createInbound(dto); assertNotEquals(0,result.getCode());
            verify(mapper,never()).insert(any());
            verify(commands,times(timedOut ? 2 : 26)).send(eq(7L),any(),eq("CheckListenPort"));
            if (timedOut) assertTrue(result.getMsg().contains("timed out"));
            else assertTrue(result.getMsg().contains("25 candidates"));
        }
    }
    @Test void invalidAndOccupiedPortsFailClearly() {
        InboundServiceImpl service=new InboundServiceImpl();
        emptyTunnelReservations(service);InboundMapper mapper=mock(InboundMapper.class);NodeMapper nodes=mock(NodeMapper.class);
        ReflectionTestUtils.setField(service,"baseMapper",mapper);ReflectionTestUtils.setField(service,"nodeMapper",nodes);
        Node node=new Node();node.setId(7L);when(nodes.selectById(7L)).thenReturn(node);when(mapper.selectList(any())).thenReturn(List.of());
        InboundDto dto=new InboundDto();dto.setNodeId(7L);dto.setProtocol("vless");dto.setListenPort(65536);
        assertNotEquals(0,service.createInbound(dto).getCode());verify(mapper,never()).insert(any());
        dto.setListenPort(443);GostDto busy=new GostDto();busy.setMsg("TCP port 443 is already occupied on this node");
        NodeCommandClient commands=mock(NodeCommandClient.class);
        ReflectionTestUtils.setField(service,"nodeCommands",commands);
        when(commands.send(eq(7L),any(),eq("CheckListenPort"))).thenReturn(busy);
        {
            R result=service.createInbound(dto);assertNotEquals(0,result.getCode());assertTrue(result.getMsg().contains("TCP port 443"));
            verify(mapper,never()).insert(any());
        }
    }
    @Test void emitRealSingboxFixtureWhenRequested() throws Exception {
        String file = System.getProperty("tms.singbox.fixture");
        if (file == null) return;
        Inbound in = inbound(8443, true);
        byte[] key = new byte[32]; new java.security.SecureRandom().nextBytes(key);
        in.setPrivateKey(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(key));
        InboundUser user = new InboundUser(); user.setId(3L); user.setUuid(UUID.randomUUID().toString()); user.setEgressPort(20000);
        JSONObject config = SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L, List.of(user)), Map.of());
        java.nio.file.Files.writeString(java.nio.file.Path.of(file), config.toJSONString());
        for (String protocol : List.of("trojan", "vmess", "shadowsocks", "hysteria2", "tuic", "anytls")) {
            in.setProtocol(protocol); user.setPassword("stored-random-credential");
            in.setConfigJson("{\"method\":\"2022-blake3-aes-256-gcm\",\"password\":\"" + Base64.getEncoder().encodeToString(new byte[32]) + "\"}");
            config = SingboxUtil.buildNodeConfig(List.of(in), Map.of(1L, List.of(user)), Map.of());
            JSONObject tls = config.getJSONArray("inbounds").getJSONObject(0).getJSONObject("tls");
            if (tls != null && tls.containsKey("certificate_path")) {
                tls.put("certificate_path", System.getProperty("tms.singbox.cert", "/etc/gost/certs/self.crt"));
                tls.put("key_path", System.getProperty("tms.singbox.key", "/etc/gost/certs/self.key"));
            }
            java.nio.file.Files.writeString(java.nio.file.Path.of(file + "." + protocol), config.toJSONString());
        }
    }
    @Test void editingPortPreservesCredentialsAndDoesNotReallocateUserForward() {
        for (String protocol : List.of("vless", "trojan", "vmess", "shadowsocks", "hysteria2", "tuic", "anytls"))
            editAndAssert(protocol);
    }
    private void editAndAssert(String protocol) {
        InboundServiceImpl service = new InboundServiceImpl();
        emptyTunnelReservations(service);
        InboundMapper mapper = mock(InboundMapper.class);
        InboundUserMapper users = mock(InboundUserMapper.class);
        ForwardMapper forwards = mock(ForwardMapper.class);
        com.admin.service.ForwardService forwardService = mock(com.admin.service.ForwardService.class);
        NodeCommandClient commands = mock(NodeCommandClient.class);
        ReflectionTestUtils.setField(service, "baseMapper", mapper);
        ReflectionTestUtils.setField(service, "inboundUserMapper", users);
        ReflectionTestUtils.setField(service, "forwardMapper", forwards);
        ReflectionTestUtils.setField(service, "forwardService", forwardService);
        ReflectionTestUtils.setField(service, "nodeCommands", commands);
        Inbound in = inbound(40000, false); in.setEgressPort(null); in.setProtocol(protocol);
        when(mapper.selectById(1L)).thenReturn(in);
        when(mapper.selectList(any())).thenReturn(List.of(in));
        when(mapper.updateById(any())).thenReturn(1);
        InboundUser user = new InboundUser(); user.setId(3L); user.setGostForwardId(9L); user.setUuid("unchanged-credential");
        when(users.selectList(any())).thenReturn(List.of(user));
        Forward forward = new Forward(); forward.setId(9L); forward.setInPort(20000); forward.setRemoteAddr("127.0.0.1:40000");
        when(forwards.selectById(9L)).thenReturn(forward);
        when(forwardService.updateInboundForward(any())).thenReturn(R.ok());
        GostDto ok = new GostDto(); ok.setMsg("OK");
        when(commands.send(anyLong(), any(), anyString())).thenReturn(ok);
        when(commands.configure(anyLong(), any(), any(), any())).thenReturn(ok);
        R result = service.updateListenPort(1L, 8443);
        assertEquals(0, result.getCode()); assertEquals(8443, in.getListenPort());
        assertEquals(20000, forward.getInPort()); assertEquals("unchanged-credential", user.getUuid());
        assertTrue(forward.getRemoteAddr().startsWith("librelay-socks://127.0.0.1:"));
        assertEquals(8443, InboundServiceImpl.clientPort(in, forward));
        verify(forwardService, never()).createForwardForUser(any(), any(), any());
    }
}
