// 試作「つづきの謎をつくる」のビルド：npx vite build --config vite.proto.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { outDir: "dist-proto", emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, rollupOptions: { input: "proto.html", output: { inlineDynamicImports: true } } },
});
