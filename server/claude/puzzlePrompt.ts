// つづきの謎（CLAUDE.md 1e）：Claude に謎を組み立ててもらう指示文。本番（サーバーから API）と試作（ページから開いた人の Claude）で同じものを使う。
// 出力は PuzzleSpec の JSON。正しさは server/model/rcPuzzle.ts の verifyPuzzle が確かめる（AIの出力は信用しない）。
import type { Check, PuzzleSpec } from "../model/rcPuzzle.js";

/** 用意した謎（見本）。謎4（血管）と謎5（膜）を、つづきの謎の形で書いたもの。指示文の例と、確かめに通らないときの切りかえ先に使う */
export const PREPARED: readonly PuzzleSpec[] = [
  {
    title: "脈の見落とし",
    topic: "膝へ血液を運ぶ人工血管",
    scenes: [
      { tag: "心臓と血管のしごと", caption: ["心臓は1回の脈ごとに血液を送り出す。", "血管はふくらんで受け止め、次の脈までに先へ送る。"] },
      { tag: "試験装置", caption: ["心臓と血管のまねをした試験装置で、人工血管の試作品Bを調べる。"] },
      { tag: "ロボの検査", caption: ["ロボは1回の脈の平均の圧だけを読み、見本と比べる。", "答えは「区別できません」。"] },
    ],
    endLine: "でも、1回の脈の中の圧の動きまで、本当に見本と同じ？",
    parts: {
      flow: { name: "心臓が送る血液の流れ", unit: "mL/秒" },
      storage: { name: "血管のふくらみやすさ" },
      resistance: { name: "血管の出口の流れにくさ" },
      level: { name: "血管の中の圧", unit: "mmHg" },
    },
    leak: "血管にたまった血液は、出口の先の細い血管へ流れ出ていく",
    analogy: "心臓＝決まった量の電流を送りこむもの、血管のふくらみやすさ＝電気をためる部品、出口の流れにくさ＝抵抗。圧＝電圧。",
    input: { kind: "beats", shape: "halfSine", amplitude: 366.5, on: 0.3, period: 0.8, timeUnit: "秒" },
    sampleA: { R: 1, C: 1.5 },
    robot: { metric: "cycleMean", says: "1回の脈の平均の圧が同じなら、同じ血管です。" },
    B: { kind: "storage", factor: 0.5, reveal: "血管Bは、ふくらみやすさが見本の半分。平均の圧は流れにくさだけで決まるので、ロボには同じに見えた。" },
    outOfScope: ["心臓が自分で縮むしくみや弁", "実際の動脈で波がはね返ること"],
  },
  {
    title: "膜の見落とし",
    topic: "膝の感覚を脳へ伝える神経の膜",
    scenes: [
      { tag: "膝から脳へ", caption: ["膝が押された感じは、神経を通って脳へ伝わる。", "はじまりは神経の端の膜。"] },
      { tag: "膜の電圧", caption: ["押されると入口が開いて電流が入り、膜の電圧が上がる。", "電流が止まると、もとへ戻る。"] },
      { tag: "ロボの検査", caption: ["ロボは電流を止める直前の膜の電圧だけを読む。", "答えは「区別できません」。"] },
    ],
    endLine: "でも、電流を入れている途中や止めたあとまで、本当に見本と同じ？",
    parts: {
      flow: { name: "入口から入る電流", unit: "ナノアンペア" },
      storage: { name: "膜の電気のためやすさ" },
      resistance: { name: "いつも開いている通り道の通りにくさ" },
      level: { name: "膜の電圧", unit: "mV" },
      base: { name: "何もしていないときの膜の電圧", value: -70 },
    },
    leak: "膜にたまった電気は、いつも開いている通り道からイオンが出入りして逃げていく",
    analogy: "膜＝電気をためる部品、いつも開いている通り道＝抵抗、イオンの濃さの差がつくる −70 mV＝電池。",
    input: { kind: "pulse", shape: "square", amplitude: 1, on: 100, record: 200, timeUnit: "ミリ秒" },
    sampleA: { R: 10, C: 1 },
    robot: { metric: "plateau", says: "止める直前の膜の電圧が同じなら、同じ膜です。" },
    B: { kind: "storage", factor: 2.2, reveal: "膜Bは、電気のためやすさが見本の2.2倍。上がるのも戻るのもゆっくりだが、長く流せば同じ高さになる。" },
    outOfScope: ["その先で信号が脳へ送られるしくみ", "イオンの種類ごとの動き"],
  },
];

const SCHEMA = `{
  "title": "〇〇の見落とし（12字以内）",
  "topic": "題材（例：肺の空気の出入り）",
  "scenes": [ {"tag": "場面の名前", "caption": ["一文", "一文（なくてもよい）"]} ×3 ],
  "endLine": "結びの一文（これからの謎を示す問い）",
  "parts": {
    "flow": {"name": "送りこむもの", "unit": "単位"},
    "storage": {"name": "ためる部品にあたるもの"},
    "resistance": {"name": "流れにくさにあたるもの"},
    "level": {"name": "ロボが測る高さ", "unit": "単位"},
    "base": {"name": "何もしていないときの高さ", "value": 数（なければ省く）}
  },
  "leak": "ためたものが、どこを通って外へ逃げるか（R はこの道の流れにくさ）",
  "analogy": "これまでの謎とのつながり（何を何に見立てたか。電気の部品で言うと何か）",
  "input": {"kind": "pulse" か "beats", "shape": "square" か "halfSine", "amplitude": 正の数, "on": 正の数, "period": 正の数（beatsのとき）, "record": 正の数（pulseのとき）, "timeUnit": "秒など"},
  "sampleA": {"R": 正の数, "C": 正の数},
  "robot": {"metric": "plateau" か "cycleMean" か "halfTime", "says": "ロボの証言（一文）"},
  "B": {"kind": "storage" か "tradeoff", "factor": 正の数, "reveal": "正体の説明（一、二文）"},
  "outOfScope": ["この模型で扱わないこと", ...]
}`;

/** 謎を組み立てる指示文。topic は学生が知りたい題材（例：「肺」「心臓」「体温」） */
export function puzzlePrompt(topic: string): string {
  return `あなたは教材「見立てラボ」の謎を組み立てる係です。学生はここまでに、人工軟骨（ばねとダンパの模型）→同じ式の電気回路→膝へ血液を運ぶ人工血管→膝の感覚を伝える神経の膜、の五つの謎を解きました。どの謎も、検査ロボ TEJUN が一つの数字だけを見て「区別できません」と言い、学生が測り方を変えて見落としを見つけます。
学生は続きとして「${topic.slice(0, 40)}」について知りたがっています。同じ形の謎を一つ組み立ててください。

使える模型は一つだけです：ためる部品 C・流れにくさ R・送りこむもの u(t)・何もしていないときの高さ（あれば）。式は C×（高さの変わり方）＝ u − 高さ／R（高さは何もしていないときからの上がり分）。
- この模型が成り立つのは「送りこんだものが、ためる部品にたまりながら、流れにくさ R の道を通って、たえず外へ逃げていく」ときだけ。R は**ためたものが外へ逃げる道**の流れにくさで、送りこむ道の流れにくさではない。逃げる道がない題材（ためたものが止めたあとも逃げない）や、R が送りこむ道に直列に入る題材（例：肺に空気を送りこむときの空気の通り道）は、この模型では表せない。leak に「ためたものが、どこを通って逃げるか」を書く。書けないときは、その題材の別の部分を選ぶ
- 題材のどの部分を、この模型で表せるかを考える。表せない部分は outOfScope に書く。題材そのものが表せないときは、題材に関係があって表せる部分を選ぶ（例：心臓なら「心臓が送る流れを受け止める血管」や「心臓の部屋のふくらみやすさ」などを選び、心臓が自分で縮むしくみは outOfScope へ）
- 送り方は二つから選ぶ：pulse（一度流して止める。on の長さだけ流し、record まで記録）／beats（くり返し送る。period ごとに on の長さだけ送る）
- 謎の型は三つから一つ：
  ① pulse ＋ robot.metric "plateau"（止める直前の高さだけを見る）＋ B.kind "storage"（Bはためる部品だけが factor 倍）。on は R×C×factor の5倍以上にする
  ② beats ＋ robot.metric "cycleMean"（1回の平均だけを見る）＋ B.kind "storage"
  ③ pulse ＋ robot.metric "halfTime"（止めてから半分に戻るまでの時間だけを見る）＋ B.kind "tradeoff"（Bは R が factor 倍、C が 1/factor 倍）
- factor は 0.33〜3 で、1.3倍以上違うこと。record は on より長く、止めてから R×C×(大きい方) の3倍以上記録する
- 値は教科書で使う程度のもっともらしい値でよいが、「模型の値」であり体の値を表さない。単位は学生に分かるものを書く
- 言葉は中学生に分かる言葉にする。病名・診断・治療・薬・手術・異常など、病気や治療につながる言葉は使わない。人物は出さない
- analogy では、前の謎とのつながりを書く（例：肺のふくらみやすさ＝電気をためる部品、空気の通り道の通りにくさ＝抵抗）

出力は次の形の JSON だけ（説明文や \`\`\` は付けない）：
${SCHEMA}

見本（すでにある謎を同じ形で書いたもの）：
${JSON.stringify(PREPARED[0])}
${JSON.stringify(PREPARED[1])}`;
}

/** 確かめに通らなかったとき、理由を添えて一度だけ作り直してもらう */
export function retryPrompt(topic: string, previous: unknown, failed: Check[]): string {
  return `${puzzlePrompt(topic)}

さきほどの出力は、プログラムの確かめに通りませんでした。
出力：${JSON.stringify(previous).slice(0, 4000)}
通らなかった点：
${failed.map((c) => `- ${c.label}：${c.detail}`).join("\n")}
これらを直した JSON だけを出力してください。`;
}

/** AIの返事から JSON を取り出す（前後に余計な文があっても拾う） */
export function extractJson(text: string): unknown {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}
