import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative asset URLs so the built site works under GitHub Pages'
  // /<repo>/ project-page subpath (and any future custom domain).
  base: "./",
  plugins: [
    react(),
    // Offline + installable app: Workbox precaches the bundle so the
    // app boots without a network, and the web manifest makes it an
    // installable standalone app. registerType "prompt" surfaces new
    // versions through the in-app banner (see App.tsx) instead of
    // swapping the running app mid-session.
    VitePWA({
      registerType: "prompt",
      // Registration is done by hand with useRegisterSW in App.tsx so
      // the update notice can live in React state; nothing is injected.
      injectRegister: false,
      manifest: {
        name: "Elastic Wave Analyzer",
        short_name: "Wave Analyzer",
        // One-line blurb shown by OS install surfaces.
        description:
          "Browser-only analyzer for elastic wave measurement data.",
        display: "standalone",
        // Relative to the manifest URL so the PWA stays scoped to the
        // GitHub Pages project subpath (or any custom domain).
        start_url: "./",
        scope: "./",
        // App chrome colors sampled from the in-app theme variables.
        theme_color: "#1f77b4",
        background_color: "#f5f6f8",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the whole bundle plus the public/ icons; CSV data
        // is never fetched over the network so nothing else is needed.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        // Single-page app: any navigation under the scope serves index.
        navigateFallback: "index.html",
        // Drop precaches left by older Workbox versions on activation.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
