// GitHub Pages 用：試用版の一枚のHTML（断片）を、ふつうの文書（doctype・文字コード・画面幅）に包む。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const body = readFileSync("dist-trial/mitate-lab-trial.html", "utf-8");
mkdirSync("_site", { recursive: true });
writeFileSync(
  "_site/index.html",
  `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="見立てラボ（試用版）：検査ロボが「区別できません」と言った試作品の見落としを見つけるゲーム。ラボ・試作品・検査ロボは架空で、値は模型の値です。">
<style>html,body{margin:0}</style></head><body>
${body}
</body></html>
`,
);
writeFileSync("_site/.nojekyll", "");
