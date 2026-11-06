#!/usr/bin/env bash
# 試用版をつくり、遊ぶ用の公開リポジトリ（HarutoyoHirano/mitate-lab-play、GitHub Pages）へ入れる。
# 使い方：scripts/publish-play.sh <mitate-lab-play の作業コピー>
set -euo pipefail
PLAY=${1:?mitate-lab-play の作業コピーの場所}
npm run build:trial >/dev/null
node scripts/pages-page.mjs
cp _site/index.html "$PLAY/index.html"
touch "$PLAY/.nojekyll"
REV=$(git rev-parse --short HEAD)
cd "$PLAY"
git add -A
if git diff --cached --quiet; then echo "変わりなし"; exit 0; fi
git commit -q -m "試用版（本体 $REV から build:trial）"
git push -q origin main
echo "入れた：本体 $REV"
