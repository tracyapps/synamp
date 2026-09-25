import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The brain owns the API; proxy it in dev so the app can be same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
