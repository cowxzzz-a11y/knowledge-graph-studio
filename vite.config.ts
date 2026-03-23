import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4174,
    open: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
  },
  build: {
    outDir: "build",
  },
});
