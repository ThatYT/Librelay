package com.admin.service;

import com.admin.common.dto.UserDto;
import com.admin.common.dto.UserUpdateDto;
import com.admin.common.dto.FlowDto;
import com.admin.common.dto.UserPackageDto;
import com.admin.entity.User;
import com.admin.service.impl.UserServiceImpl;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import javax.validation.Validation;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

class AccountTrafficBillingTest {
    @Test void rejectsInvalidBillingInputsOnBackend() {
        try(var factory=Validation.buildDefaultValidatorFactory()) {
            var validator=factory.getValidator();
            UserDto create=new UserDto(); UserUpdateDto update=new UserUpdateDto();
            for(String mode:new String[]{"both","upload","download"}) {
                create.setBillingMode(mode); update.setBillingMode(mode);
                assertTrue(validator.validateProperty(create,"billingMode").isEmpty());
                assertTrue(validator.validateProperty(update,"billingMode").isEmpty());
            }
            create.setBillingMode("bad");update.setBillingMode("bad");
            assertFalse(validator.validateProperty(create,"billingMode").isEmpty());
            assertFalse(validator.validateProperty(update,"billingMode").isEmpty());
            for(String value:new String[]{"-1","1000.0001","0.00001"}) {
                create.setTrafficMultiplier(new BigDecimal(value));update.setTrafficMultiplier(new BigDecimal(value));
                assertFalse(validator.validateProperty(create,"trafficMultiplier").isEmpty());
                assertFalse(validator.validateProperty(update,"trafficMultiplier").isEmpty());
            }
            for(String value:new String[]{"0","0.0001","0.5","2","1000"}) {
                create.setTrafficMultiplier(new BigDecimal(value));
                assertTrue(validator.validateProperty(create,"trafficMultiplier").isEmpty());
            }
        }
    }

    @Test void newAccountsDefaultToBothDirectionsAtOneAndRetainCustomSettings() {
        UserDto dto=new UserDto();dto.setUser("fixture");dto.setPwd("fixture");
        User u=ReflectionTestUtils.invokeMethod(new UserServiceImpl(),"buildNewUserEntity",dto);
        assertEquals("both",u.getBillingMode());assertEquals(BigDecimal.ONE,u.getTrafficMultiplier());
        dto.setBillingMode("download");dto.setTrafficMultiplier(new BigDecimal("0.5"));
        u=ReflectionTestUtils.invokeMethod(new UserServiceImpl(),"buildNewUserEntity",dto);
        assertEquals("download",u.getBillingMode());assertEquals(new BigDecimal("0.5"),u.getTrafficMultiplier());
    }

    @Test void negativeOrMissingTrafficCannotReduceBilledUsage() {
        FlowDto stats=new FlowDto();stats.setD(-1L);stats.setU(0L);
        assertThrows(IllegalArgumentException.class,()->AccountTrafficBilling.addUsage(new UpdateWrapper<User>(),stats));
        stats.setD(null);
        assertThrows(IllegalArgumentException.class,()->AccountTrafficBilling.addUsage(new UpdateWrapper<User>(),stats));
    }

    @Test void ordinaryUserPackageDoesNotExposeSpeedCap() throws Exception {
        User u=new User();u.setId(5L);u.setFlow(100L);u.setSpeedMbps(150);
        UserPackageDto.UserInfoDto info=ReflectionTestUtils.invokeMethod(new UserServiceImpl(),"buildUserInfoDto",u);
        String json=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(info);
        assertFalse(json.contains("speedMbps"));
        assertTrue(json.contains("\"flow\":100"));
    }
}
