---
name: add-ai-puzzle-record
description: つづきの謎の記録を足す。新しい題材で Claude に謎（部品箱の模型）を組み立てさせ、計算プログラムで確かめ、tests/fixtures/ai-nets に記録してテスト41を通す。題材の記録を増やすとき、指示文や確かめの関数を変えたあとに使う。
---

# つづきの謎の記録を足す

つづきの謎（CLAUDE.md 1e〜1e-4）は、Claude が組み立て、計算プログラム（`verifyNetPuzzle`）が確かめる。この Skill は、その記録を一つ足す手順。記録は、AIを呼べない場所での切りかえ先と、テスト41の材料になる。

## 守ること
- **AIの出力に人は手を加えない。** 落ちた出力も、そのまま記録してよい（`expectOk` は確かめの結果をそのまま入れる。`save` が自動で入れる）
- **だれが出力したかを正直に書く**（`--by`）。手で書いた謎を AI の出力として記録しない
- 出典は `server/model/refs.ts` のカタログの id だけ。カタログにない文献を足すのは、作者が書誌を確かめてから（この Skill の範囲外）
- 病名・診断・治療・薬につながる題材は扱わない（`topicProblem` と言葉の確かめで落ちる）

## 手順
1. 題材を決める。出典カタログ（`server/model/refs.ts` の `field`）に、その題材を支える文献があるかを先に見る。なければ、その題材は「つくれない」ことを記録してよい
2. 指示文を出す：
   `npx tsx scripts/net-record.ts prompt <題材>`（つづきの連鎖なら `--prev <記録ファイル名>` で前の謎を指定。指定がなければ謎3「膜の見落とし」）
3. 指示文を Claude に渡し、出力（JSON）をそのままファイルに保存する。渡し方は三つのどれか：本体の画面（公開ページの Claude）、サーバーの API、または Claude Code の中で指示文を読んで出力する。どれを使ったかを `--by` に書く
4. 確かめる：`npx tsx scripts/net-record.ts check <出力.json> [--prev …]`
5. 落ちたら、一度だけ作り直させる：`npx tsx scripts/net-record.ts retry <題材> <出力.json> [--prev …]` の指示文（落ちた理由つき）を Claude に渡し、新しい出力を別のファイルに保存して 4 に戻る。本体の画面と同じく、作り直しは一度まで
6. 記録する：`npx tsx scripts/net-record.ts save <名前>.v4 <題材> <出力.json> --by "<だれが・いつ>" [--prev …] [--note "<経緯>"]`。作り直したときは、1回目の出力も別の名前で記録し、`--note` に落ちた理由を書く
7. テスト41を通す：`npx vitest run tests/model/partsNet.test.ts`
8. 確かめが見抜けなかった誤り（例：別の対象の文献の形を借りていた）を見つけたら、記録は直さず、確かめの関数（`server/model/partsNet.ts`）を強くして、その記録が落ちるようにする。`expectOk` を false にし、`history` に経緯を書く
9. 画面の「記録」に出す題材にする場合は、`src/play/nextGen.ts` の記録の一覧に足す（作者の確認のあと）
