import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Thornwake",
        short_name: "Thornwake",
        description: "Build and play precision platforming trials",
        theme_color: "#101c24",
        background_color: "#101c24",
        display: "fullscreen",
        orientation: "landscape",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,json,txt}"],
        maximumFileSizeToCacheInBytes: 3000000,
      },
    }),
  ],
  build: { target: "es2020" },
  server: { host: "0.0.0.0" },
});
