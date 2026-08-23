import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs so the built site works under GitHub Pages'
  // /<repo>/ project-page subpath (and any future custom domain).
  base: "./",
  plugins: [react()],
});
