package com.admin.controller;

import com.admin.common.lang.R;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Numeric release display and update checks against successfully deployed image builds.
 * Commit metadata remains available for diagnostics and immutable artifact matching.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/version")
@CrossOrigin
public class VersionController extends BaseController {

    /** Numeric version from the central VERSION file, injected into official images. */
    private static final String PANEL_VERSION = com.admin.common.utils.ProductVersion.current();

    /**
     * 注意查的是【最新一次构建成功的 workflow】,不是 main 的最新 commit。
     *
     * 用 commits/main 的话,push 完到 CI 构建完中间隔着几分钟,这段时间面板会提示
     * "有更新",用户跑 tms update 却只能拉到旧镜像 —— 提示还一直挂着。
     * 按构建成功的 head_sha 比,提示亮起来时镜像一定已经在 GHCR 上了。
     */
    private static final String RUNS_API =
            "https://api.github.com/repos/" + com.admin.common.utils.RepositoryConfig.repo() + "/actions/workflows/docker-build.yml/runs"
                    + "?branch=" + com.admin.common.utils.RepositoryConfig.ref() + "&status=success&per_page=1";

    /** GitHub 未认证接口每小时每 IP 只有 60 次,而且国内机大概率连不上,查一次缓存 6 小时 */
    private static final long CACHE_TTL_MS = 6 * 60 * 60 * 1000L;

    private static volatile String cachedLatest = null;
    private static volatile String cachedLatestVersion = null;
    private static volatile long cachedAt = 0L;
    /** 上次检查是不是失败了(国内机连不上 GitHub 很常见),失败就别在界面上误导用户 */
    private static volatile boolean lastCheckFailed = false;

    @PostMapping("/info")
    public R info() {
        String current = buildCommit();
        Map<String, Object> data = new HashMap<>();
        data.put("panelVersion", PANEL_VERSION);
        data.put("commit", current);
        data.put("buildTime", System.getenv().getOrDefault("LIBRELAY_BUILD_TIME", System.getenv("TMS_BUILD_TIME")));

        latestCommit();
        String latest = cachedLatestVersion;
        data.put("latest", latest);
        data.put("checkFailed", lastCheckFailed);

        // Only offer a newer numeric release after its images have passed deployment checks.
        boolean updateAvailable = latest != null
                && !"dev".equals(current)
                && !lastCheckFailed
                && com.admin.common.utils.ProductVersion.newer(latest, PANEL_VERSION);
        data.put("updateAvailable", updateAvailable);
        return R.ok(data);
    }

    /** 构建时注入的短 commit;本地开发没注入就是 dev */
    private String buildCommit() {
        String c = System.getenv().getOrDefault("LIBRELAY_BUILD_COMMIT", System.getenv("TMS_BUILD_COMMIT"));
        if (c == null || c.trim().isEmpty()) {
            return "dev";
        }
        c = c.trim();
        return c.length() > 7 ? c.substring(0, 7) : c;
    }

    /** 取最新一次构建成功的短 commit,带缓存;失败返回 null(不抛异常、不阻塞页面) */
    private String latestCommit() {
        long now = System.currentTimeMillis();
        if (cachedLatest != null && now - cachedAt < CACHE_TTL_MS) {
            return cachedLatest;
        }
        // 上次失败过也要遵守缓存间隔,否则每次刷页面都去连一次连不上的 GitHub,白白卡住请求
        if (lastCheckFailed && now - cachedAt < CACHE_TTL_MS) {
            return cachedLatest;
        }
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(RUNS_API).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            conn.setRequestProperty("User-Agent", "Librelay-Panel");

            if (conn.getResponseCode() != 200) {
                throw new RuntimeException("HTTP " + conn.getResponseCode());
            }
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
            }
            JSONObject obj = JSON.parseObject(sb.toString());
            com.alibaba.fastjson.JSONArray runs = obj == null ? null : obj.getJSONArray("workflow_runs");
            if (runs == null || runs.isEmpty()) {
                throw new RuntimeException("没有构建成功的记录");
            }
            String sha = runs.getJSONObject(0).getString("head_sha");
            if (sha == null || !sha.matches("[0-9a-fA-F]{40}")) {
                throw new RuntimeException("响应里没有 head_sha");
            }
            String numericVersion = remoteVersion(sha);
            if (!com.admin.common.utils.ProductVersion.valid(numericVersion)) throw new RuntimeException("Invalid remote numeric version");
            cachedLatestVersion = numericVersion;
            cachedLatest = sha.substring(0, 7);
            cachedAt = now;
            lastCheckFailed = false;
            return cachedLatest;
        } catch (Exception e) {
            // 连不上 GitHub 是常态(国内机、防火墙),记一笔就好,别让它影响页面
            log.debug("检查最新版本失败: {}", e.getMessage());
            cachedAt = now;
            lastCheckFailed = true;
            return cachedLatest;
        }
    }

    private String remoteVersion(String sha) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL("https://raw.githubusercontent.com/"
                + com.admin.common.utils.RepositoryConfig.repo() + "/" + sha + "/VERSION").openConnection();
        connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
        try {
            if(connection.getResponseCode()!=200)throw new RuntimeException("Version metadata unavailable");
            try(var source=connection.getInputStream()) {
                return new String(source.readAllBytes(),StandardCharsets.UTF_8).trim();
            }
        } finally {connection.disconnect();}
    }
}
