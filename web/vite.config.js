import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: the API runs on PORT (default 6700, npm run dev -w server) and Vite on VITE_PORT (default 6701); /api is proxied.
const api = { target: `http://127.0.0.1:${Number(process.env.PORT) || 6700}` };

export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.VITE_PORT) || 6701, strictPort: true, proxy: { "/api": api } },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/testSetup.js" },
});
