# syntax=docker/dockerfile:1
# JAR is architecture-independent; compile once on the native builder.
FROM --platform=$BUILDPLATFORM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
ARG MAVEN_BUILD_OPTS="-Xmx512m"
RUN --mount=type=cache,target=/root/.m2 MAVEN_OPTS="$MAVEN_BUILD_OPTS" mvn -B package -DskipTests

# 运行阶段
FROM eclipse-temurin:21-jre
WORKDIR /app

# CI 注入构建标识:镜像 tag 固定是 :latest,没有版本号可比,
# 所以拿这个 commit 跟 GitHub 上 main 的最新 commit 比,判断有没有新版本。
# 本地手工构建不传就是 dev,面板一律不提示更新。
ARG BUILD_COMMIT=dev
ARG BUILD_TIME=""
LABEL org.opencontainers.image.revision=$BUILD_COMMIT
ENV TMS_BUILD_COMMIT=$BUILD_COMMIT
ENV TMS_BUILD_TIME=$BUILD_TIME

ENV JAVA_OPTS="-Xmx512m -Xms256m -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai"
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-dejavu curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/*.jar app.jar
EXPOSE 6365

# Readiness includes the database query used by the login CAPTCHA check.
HEALTHCHECK --interval=5s --timeout=6s --start-period=60s --retries=12 \
  CMD curl --noproxy '*' -fsS --max-time 4 -X POST http://127.0.0.1:6365/api/v1/captcha/check \
    | grep -Eq '"code"[[:space:]]*:[[:space:]]*0[[:space:]]*[,}]' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
