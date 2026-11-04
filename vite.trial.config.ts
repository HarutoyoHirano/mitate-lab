// 試用版（サーバーなし）のビルド：npx vite build --config vite.trial.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  define: { "process.env": "globalThis.__trialEnv" },
  resolve: { alias: { "node:crypto": fileURLToPath(new URL("./src/trial/crypto.ts", import.meta.url)) } },
  build: { outDir: "dist-trial", emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, rollupOptions: { input: "trial.html", output: { inlineDynamicImports: true } } },
});
