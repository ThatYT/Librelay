import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "node:fs";

const versionFile = path.resolve(__dirname, "../VERSION");
const appVersion = process.env.APP_VERSION || (fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "0.0.0");
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(appVersion)) throw new Error("Invalid numeric VERSION");

export default defineConfig(({ mode }) => ({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion) },
  plugins: [
    react(),
  ],
  base: mode === 'android' ? './' : '/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  build: {
    outDir: mode === 'android' ? '../android-app/app/build/generated/web-assets' : 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: false,  
    rollupOptions: {
      treeshake: false,
    }
  }
}));
