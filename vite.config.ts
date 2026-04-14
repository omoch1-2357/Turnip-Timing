import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("firebase/")) {
            return "firebase";
          }

          if (id.includes("react")) {
            return "react";
          }

          return undefined;
        },
      },
    },
  },
});
