// GitHub Pages 用：試用版の一枚のHTML（断片）を、ふつうの文書（doctype・文字コード・画面幅）に包む。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const body = readFileSync("dist-trial/mitate-lab-trial.html", "utf-8");
mkdirSync("_site", { recursive: true });
writeFileSync(
  "_site/index.html",
  `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="見立てラボ（試用版）：検査ロボが「区別できません」と言った試作品の見落としを見つけるゲーム。ラボ・試作品・検査ロボは架空で、値は模型の値です。">
<style>html,body{margin:0}</style>
<!--
見立てラボ（試用版） Copyright (C) 2026 mitate-lab authors. GNU Affero General Public License v3.0（AGPL-3.0-only）。ソース：https://github.com/HarutoyoHirano/mitate-lab

このページには、次の外部のソフトウェアが含まれています。
@anthropic-ai/sdk — MIT License
Copyright 2023 Anthropic, PBC.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
-->
</head><body>
${body}
</body></html>
`,
);
writeFileSync("_site/.nojekyll", "");
