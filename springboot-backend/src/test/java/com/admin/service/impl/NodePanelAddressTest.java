package com.admin.service.impl;

import org.junit.jupiter.api.Test;
import java.lang.reflect.Method;
import static org.junit.jupiter.api.Assertions.assertEquals;

class NodePanelAddressTest {
    @Test
    void preservesTlsAndBracketedIpv6InInstallationCommands() throws Exception {
        Method method = NodeServiceImpl.class.getDeclaredMethod("processServerAddress", String.class);
        method.setAccessible(true);
        NodeServiceImpl service = new NodeServiceImpl();
        for (String address : new String[]{"https://panel.example:2095", "http://panel.example:8080", "https://[2001:db8::1]:2095", "[2001:db8::1]:6365", "panel.example:6365"}) {
            assertEquals(address, method.invoke(service, address));
        }
        assertEquals("[2001:db8::1]:6365", method.invoke(service, "2001:db8::1:6365"));
    }
}
