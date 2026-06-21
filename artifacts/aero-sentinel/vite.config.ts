import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT sadece dev/preview server için gerekli — build sırasında opsiyonel
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5001;

// BASE_PATH — build'da varsayılan olarak "/" kullan
const basePath = process.env.BASE_PATH || "/";

const isReplit = process.env.REPL_ID !== undefined;

/**
 * Replit'e özel plugin'ler — normalde sadece development/Replit'te yüklenir.
 * Railway/production'da bu plugin'ler atlanır.
 */
function replitPlugins() {
  if (process.env.NODE_ENV === "production" || !isReplit) return [];
  // Dynamic import sadece Replit ortamında çalışır
  return [
    import("@replit/vite-plugin-cartographer").then((m) =>
      m.cartographer({
        root: path.resolve(import.meta.dirname, ".."),
      }),
    ),
    import("@replit/vite-plugin-dev-banner").then((m) =>
      m.devBanner(),
    ),
  ];
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(await Promise.all(replitPlugins())),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== "production",
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "wouter", "@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
