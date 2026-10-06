import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The brain owns the API; proxy it in dev so the app can be same-origin.
export default defineConfig({
  plugins: [react()],
  // MilkDrop's preset pack is one ~650 kB file, loaded only when the visuals open.
  build: { chunkSizeWarningLimit: 700 },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
