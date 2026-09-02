import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves project sites from /<repo-name>/, so `base` must match
// the repo this ends up in. Update it before your first deploy.
export default defineConfig({
  plugins: [react()],
  base: "/gym-tracker/",
});
