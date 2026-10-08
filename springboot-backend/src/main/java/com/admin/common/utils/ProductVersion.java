package com.admin.common.utils;

import java.io.InputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;

/** Numeric product version from the central VERSION file or its Docker build argument. */
public final class ProductVersion {
    private ProductVersion() {}
    public static boolean valid(String value) {
        return value != null && value.matches("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)");
    }
    public static String current() {
        String version=System.getenv("LIBRELAY_VERSION");
        if (valid(version)) return version;
        try(InputStream source=ProductVersion.class.getResourceAsStream("/VERSION")) {
            if(source!=null) {
                version=new String(source.readAllBytes(),StandardCharsets.UTF_8).trim();
                if(valid(version))return version;
            }
        } catch(Exception ignored) {}
        return "0.0.0";
    }
    public static boolean newer(String latest,String current) {
        if(!valid(latest)||!valid(current))return false;
        String[] a=latest.split("\\."),b=current.split("\\.");
        for(int n=0;n<3;n++) {
            int comparison=new BigInteger(a[n]).compareTo(new BigInteger(b[n]));
            if(comparison!=0)return comparison>0;
        }
        return false;
    }
}
