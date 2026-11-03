import { existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// 開発中は、Viteの開発サーバーの中でAPI（/api/）も動かす。APIキーはサーバー側だけで読む。
function apiPlugin(): Plugin {
  return {
    name: "mikata-api",
    configureServer(server) {
      if (existsSync(".env")) process.loadEnvFile(".env");
      // APIのモジュールは最初の要求のときに読み込む（起動直後はまだ解決の準備ができていないため）
      let handleApi: ((req: unknown, res: unknown) => Promise<boolean>) | null = null;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        handleApi ??= (await server.ssrLoadModule("/server/app.ts")).handleApi;
        if (!(await handleApi!(req, res))) next();
      });
    },
  };
}

export default defineConfig({
  plugins: process.env.VITEST ? [] : [apiPlugin()],
  server: { port: 5173 },
  build: { outDir: "dist", rollupOptions: { input: { main: "index.html", game: "game.html", lab: "lab.html" } } },
  test: { include: ["tests/**/*.test.ts"] },
} as never);
