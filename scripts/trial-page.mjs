// 試用版を一つのHTMLにまとめる（CSSとJSを中に入れる）。npm run build:trial の後半。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const [outDirArg = "dist-trial", outName = "mitate-lab-trial.html", title = "見立てラボ"] = process.argv.slice(2);
const dir = `${outDirArg}/assets`;
const files = readdirSync(dir);
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith(".css"))}`, "utf-8");
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith(".js"))}`, "utf-8");
if (/<\/script/i.test(js)) throw new Error("JSに </script が含まれる");
const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap" rel="stylesheet">
<style>
${css}
/* 試用版：一画面に収め、左右の余白は端末の安全域も含める */
html, body { min-height: 100%; }
.game { padding-left: max(8px, env(safe-area-inset-left, 0px)); padding-right: max(8px, env(safe-area-inset-right, 0px)); }
</style>
<div id="app"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(`${outDirArg}/${outName}`, page);
console.log(`${outDirArg}/${outName}`, page.length, "bytes");
