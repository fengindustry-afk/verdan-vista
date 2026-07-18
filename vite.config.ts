import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Pre-bundle pdfjs-dist so the lazy `import("pdfjs-dist")` in the PDF receipt
  // path resolves immediately. Without this, its first dynamic import triggers
  // on-demand dep optimization + a reload, and the import promise hangs forever.
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
}));
