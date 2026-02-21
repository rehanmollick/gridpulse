import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/morph-api": {
        target: "https://api.morphllm.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/morph-api/, ""),
      },
    },
  },
});
