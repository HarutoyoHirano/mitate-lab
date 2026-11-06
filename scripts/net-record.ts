// つづきの謎の記録（tests/fixtures/ai-nets）を足すための道具。Skill「つづきの謎の記録を足す」から使う。
//   npx tsx scripts/net-record.ts prompt <題材> [--prev <記録ファイル名>]   … Claude に渡す指示文（v4）を出す
//   npx tsx scripts/net-record.ts check  <出力.json> [--prev <記録ファイル名>] … 計算プログラムで確かめ、通らない理由を出す
//   npx tsx scripts/net-record.ts retry  <題材> <出力.json> [--prev …]        … 作り直しの指示文（落ちた理由つき）を出す
//   npx tsx scripts/net-record.ts save   <名前> <題材> <出力.json> --by "<だれが出力したか>" [--prev …] [--note "<経緯>"]
// AIの出力には人が手を加えない。確かめに落ちた出力も、そのまま記録してよい（expectOk は確かめの結果をそのまま入れる）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { netPrompt, netRetryPrompt, PREPARED_NETS } from "../server/puzzle/netPrompt.js";
import { verifyNetPuzzle, type NetPuzzleSpec } from "../server/model/partsNet.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/ai-nets");
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));

/** 前の謎：指定がなければ用意した謎4（膜）。"file:xxx.json" と同じ書き方で記録に残す */
function previous(): { spec: NetPuzzleSpec; tag: string } {
  const f = opt("--prev");
  if (!f) return { spec: PREPARED_NETS[1]!, tag: "prepared:1" };
  const rec = JSON.parse(readFileSync(join(DIR, f), "utf8")) as { output: NetPuzzleSpec };
  return { spec: rec.output, tag: "file:" + f };
}
function readOut(p: string): unknown {
  const text = readFileSync(p, "utf8");
  const m = text.match(/\{[\s\S]*\}/); // 前後の文を除いて JSON だけを取り出す（本体の画面と同じ扱い）
  const o = JSON.parse(m ? m[0] : text) as { output?: unknown; expectOk?: boolean };
  return o.output !== undefined && o.expectOk !== undefined ? o.output : o; // 記録のファイルなら、その出力
}

const [cmd] = pos;
if (cmd === "prompt") {
  console.log(netPrompt(pos[1]!, previous().spec));
} else if (cmd === "check" || cmd === "retry" || cmd === "save") {
  const outPath = cmd === "check" ? pos[1]! : pos[cmd === "retry" ? 2 : 3]!;
  const out = readOut(outPath);
  const prev = previous();
  const v = verifyNetPuzzle(out, prev.spec);
  if (cmd === "check") {
    for (const c of v.checks) console.log(`${c.ok ? "✓" : "✗"} ${c.label}${c.ok ? "" : "：" + c.detail}`);
    console.log(v.ok ? "合格" : "不合格");
  } else if (cmd === "retry") {
    console.log(netRetryPrompt(pos[1]!, out as NetPuzzleSpec, prev.spec, v.checks.filter((c) => !c.ok)));
  } else {
    const [, name, topic] = pos;
    const by = opt("--by");
    if (!name || !topic || !by) throw new Error("save <名前> <題材> <出力.json> --by \"…\" が要る");
    const file = join(DIR, name.endsWith(".json") ? name : name + ".json");
    if (existsSync(file)) throw new Error("同じ名前の記録がある：" + file);
    const rec = {
      note: `${by} が出力したもの。人は手を加えない。`,
      topic,
      promptVersion: "v4",
      previous: prev.tag,
      expectOk: v.ok,
      output: out,
      ...(opt("--note") ? { history: opt("--note") } : {}),
    };
    writeFileSync(file, JSON.stringify(rec, null, 2) + "\n");
    console.log(`${file} に保存（確かめ：${v.ok ? "合格" : "不合格"}）`);
  }
} else {
  console.log("使い方は、このファイルの先頭の注釈を見てください。");
}
