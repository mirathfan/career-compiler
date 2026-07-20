import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tmp/**"],
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
    pool: "threads",
    maxWorkers: 2,
  },
});
