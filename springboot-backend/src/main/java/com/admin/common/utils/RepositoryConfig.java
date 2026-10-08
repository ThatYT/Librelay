package com.admin.common.utils;

/** Repository identity is injected from the installer's persisted .env. */
public final class RepositoryConfig {
    private RepositoryConfig() {}
    public static String repo() {
        String value = System.getenv().getOrDefault("GITHUB_REPO", "ThatYT/Librelay");
        if (!value.matches("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")) throw new IllegalArgumentException("Invalid GITHUB_REPO");
        return "ThatYT/Tms_EN".equalsIgnoreCase(value) ? "ThatYT/Librelay" : value;
    }
    public static String ref() {
        String value = System.getenv().getOrDefault("GITHUB_REF", "main");
        if (!value.matches("[A-Za-z0-9_.-]+")) throw new IllegalArgumentException("Invalid GITHUB_REF");
        return value;
    }
    public static String shellQuote(String value) { return "'" + value.replace("'", "'\\''") + "'"; }
}
