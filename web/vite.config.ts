import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Fixed port for a later Tauri wrapper; /api goes to the Python server.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: Number(process.env.NEUROMAP_WEB_PORT ?? 5174),
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${process.env.NEUROMAP_API_PORT ?? 8765}` },
  },
});
