import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => ({
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
