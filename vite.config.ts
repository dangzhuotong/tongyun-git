import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = typeof process !== "undefined" ? process.env?.TAURI_DEV_HOST : undefined;

export default defineConfig({
  plugins: [tailwindcss(), react()],
  clearScreen: false,
  // CSP 只允许 'self'：logo 等资源输出成独立文件，不内联成 data: URI
  build: {
    assetsInlineLimit: 0,
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/target/**"],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
