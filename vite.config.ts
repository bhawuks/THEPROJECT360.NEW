import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_) from .env files
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      hmr: {
        clientPort: 443,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },

    /**
     * IMPORTANT:
     * In Vite, you should NOT use process.env for frontend keys.
     * Put your key in `.env` as:
     * VITE_GEMINI_API_KEY=xxxxx
     *
     * Then use it in code as:
     * import.meta.env.VITE_GEMINI_API_KEY
     */
  };
});
