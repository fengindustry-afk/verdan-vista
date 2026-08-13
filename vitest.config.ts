import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // One jsdom per fork costs ~10s to stand up here, so a fork per core has
    // the last workers timing out before they ever report ("Timeout waiting
    // for worker to respond" — 7 of 19 files never started). Half the cores
    // leaves enough headroom to boot.
    maxWorkers: 4,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
