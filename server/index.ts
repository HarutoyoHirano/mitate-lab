// 本番用：ビルド済みの画面（dist/）とAPIを一つのサーバーで配る。 npm run build → npm start
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
const { handleApi } = await import("./app.js");

const DIST = join(process.cwd(), "dist");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!path.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(DIST, "index.html");
  if (!existsSync(path)) {
    res.writeHead(404).end("先に npm run build を実行してください");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});

const port = Number(process.env.PORT) || 8787;
server.listen(port, () => console.log(`見え方ラボ：http://localhost:${port}`));
