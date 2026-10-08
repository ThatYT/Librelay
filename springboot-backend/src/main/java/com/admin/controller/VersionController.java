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

/**
 * 版本信息 / 更新检查。
 *
 * Librelay 安装使用不可变提交镜像,用【构建时注入的 git commit】
 * 跟 GitHub 上 main 分支的最新 commit 比 —— 不一样就是有新版本。
 * 构建 commit 由 CI 通过 Docker build-arg 注入(见 docker-build.yml 和 Dockerfile),
 * 本地跑没注入时是 "dev",这种情况一律不提示更新。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/version")
@CrossOrigin
public class VersionController extends BaseController {

    /** 面板大版本,跟 CI 里的 VERSION 对齐,只用于展示 */
    private static final String PANEL_VERSION = "1.0.1";

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

        String latest = latestCommit();
        data.put("latest", latest);
        data.put("checkFailed", lastCheckFailed);

        // 只有三个条件都满足才提示:查到了远程、本地是 CI 构建的、两者不一致
        boolean updateAvailable = latest != null
                && !"dev".equals(current)
                && !latest.equalsIgnoreCase(current);
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
            if (sha == null || sha.length() < 7) {
                throw new RuntimeException("响应里没有 head_sha");
            }
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
}
