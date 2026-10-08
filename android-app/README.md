# Librelay Android app

This WebView app bundles the current React frontend, including Librelay branding, English/Chinese translations and Light/Dark themes. Configure panel addresses in the app; panel and node installations remain independent.

## Download

The **Build Librelay Android app** GitHub workflow builds every `main` commit and publishes a prerelease named `android-<commit SHA>` after successful checks. Download `librelay-debug.apk` for testing or `librelay-release-unsigned.apk` for signing, plus `checksums.sha256`.

The debug APK uses the separate `com.flux.debug` application ID and does not overwrite the original app or its saved addresses. It is a test package; its runner-generated signing key is not a production update key. Saved addresses in the original app are not copied into the separate test app.

The release application ID remains `com.flux` so an administrator holding the original signing key can produce a compatible update. Its source namespace, activity package, theme and visible label are Librelay. The release APK is unsigned and cannot be installed before signing. Keep the signing keystore and passwords outside the repository; this project does not contain the original signing key. A different signing key cannot update an already-installed app with the same application ID. Moving from file-based web content to the local HTTPS asset origin may require signing in and choosing language/theme again; native saved panel addresses remain in the existing app preferences when using a correctly signed compatible release update.

## Build locally

Use Node/pnpm as specified in `vite-frontend/package.json`, JDK 17, Android SDK platform 34 and build-tools 34.0.0. Set `ANDROID_HOME` to your SDK directory.

```bash
cd vite-frontend
pnpm install --frozen-lockfile
pnpm build:android
cd ../android-app
./gradlew --no-daemon testDebugUnitTest assembleDebug assembleRelease lintDebug
```

The frontend is generated under `app/build/generated/web-assets` and bundled by Gradle. A build without those assets fails with instructions instead of creating a blank app. Web builds keep their existing routing and output directory; Android builds use relative asset URLs and hash routing. Native content is served through AndroidX `WebViewAssetLoader` at a local HTTPS origin. External navigation opens outside the WebView so the native bridge stays attached to bundled content.

Outputs are `app/build/outputs/apk/debug/app-debug.apk` and `app/build/outputs/apk/release/app-release-unsigned.apk`. Sign the latter with Android SDK `apksigner` and your own keystore; do not commit either secrets or generated APKs.

CI runs unit tests, lint, checks the visible Librelay label and confirms that `assets/index.html` is in the package. It does not currently run an Android emulator/device test. The old bundled `flux.apk` is available in Git history; current packages are published as release assets rather than checked into source control.
