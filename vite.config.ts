import { existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// 開発中は、Viteの開発サーバーの中でAPI（/api/）も動かす。APIキーはサーバー側だけで読む。
function apiPlugin(): Plugin {
  return {
    name: "mikata-api",
    async configureServer(server) {
      if (existsSync(".env")) process.loadEnvFile(".env");
      const { handleApi } = await server.ssrLoadModule("/server/app.ts");
      server.middlewares.use(async (req, res, next) => {
        if (!(await handleApi(req, res))) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [apiPlugin()],
  server: { port: 5173 },
  build: { outDir: "dist" },
  test: { include: ["tests/**/*.test.ts"] },
} as never);
