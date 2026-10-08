package com.admin.common.utils;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ProductVersionTest {
    @Test void numericVersionsCompareByComponentRatherThanAlphabeticallyOrByCommit() {
        assertTrue(ProductVersion.newer("1.1.0","1.0.9"));
        assertTrue(ProductVersion.newer("1.10.0","1.2.0"));
        assertTrue(ProductVersion.newer("1.1.10","1.1.9"));
        assertFalse(ProductVersion.newer("1.1.0","1.1.0"));
        assertFalse(ProductVersion.newer("1.0.9","1.1.0"));
        assertFalse(ProductVersion.newer("a39908b","1.1.0"));
    }
    @Test void invalidAndCommitIdentifiersAreNeverAcceptedAsProductVersions() {
        for(String value:new String[]{"dev","v1.1.0","1.1","01.1.0","1.1.0-dev","a39908b","1.1.0;echo unsafe"}) {
            assertFalse(ProductVersion.valid(value));
        }
        assertTrue(ProductVersion.valid("1.1.0"));
        assertTrue(ProductVersion.valid(ProductVersion.current()));
    }
}
