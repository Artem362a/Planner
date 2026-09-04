import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function devServiceWorkerCleanup() {
  return {
    name: "dev-service-worker-cleanup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/__dev_clear_cache", (_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(`<!doctype html>
<html lang="ru">
  <meta charset="utf-8">
  <title>Обновление Day Plan</title>
  <body style="font:16px system-ui;padding:32px;background:#ece7f6;color:#2d2545">
    Обновляем дев-версию Day Plan…
    <script>
      Promise.all([
        navigator.serviceWorker
          ? navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.map((item) => item.unregister())))
          : Promise.resolve(),
        window.caches
          ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          : Promise.resolve()
      ]).finally(() => location.replace('/experimental?fresh=' + Date.now()));
    </script>
  </body>
</html>`);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    devServiceWorkerCleanup(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg"],
      manifest: {
        name: "Планировщик",
        short_name: "Планировщик",
        description: "Планируй день, неделю и цели",
        theme_color: "#7b5ecf",
        background_color: "#7b5ecf",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "ru",
        icons: [
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/uploads\//, /^\/api\//, /^\/legal\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
