package com.admin;

import com.admin.common.dto.InboundDto;
import org.junit.jupiter.api.Test;
import javax.validation.Validation;
import static org.junit.jupiter.api.Assertions.*;

/** API validation contract; no production database or log directory required. */
class AdminApplicationTests {
    @Test void validatesPortsAtTheApiBoundary() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            InboundDto dto = new InboundDto(); dto.setNodeId(1L); dto.setProtocol("vless");
            assertTrue(validator.validate(dto).isEmpty()); // absent port is defaulted by the service
            for (int port : new int[]{1,443,8443,65535}) {
                dto.setListenPort(port); assertTrue(validator.validate(dto).isEmpty());
            }
            for (int port : new int[]{0,-1,65536}) {
                dto.setListenPort(port); assertFalse(validator.validate(dto).isEmpty());
            }
        }
    }
    @Test void rejectsFractionalPortsBeforeTheyReachTheService() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        assertThrows(com.fasterxml.jackson.databind.JsonMappingException.class,
                () -> mapper.readValue("{\"nodeId\":1,\"listenPort\":443.5}", InboundDto.class));
        assertEquals(8443, mapper.readValue("{\"nodeId\":1,\"listenPort\":\"8443\"}", InboundDto.class).getListenPort());
    }
}
