// つづきの謎（CLAUDE.md 1e-2・1e-3）：模型の形そのものを Claude が部品箱から組み立て、出典とつなぎも書く指示文（v4）。
// 置き場所：server/puzzle/（秘密を持たない共通の部品。画面の試作ページ・本体・サーバーから同じものを使う）
// 出力は NetPuzzleSpec の JSON。正しさは server/model/partsNet.ts の verifyNetPuzzle が確かめる（AIの出力は信用しない）。
// 指示文の見本には、すでにある謎（血管・膜）だけを入れる。心臓などの組み立て方は書かない（AIが自分で組み立てる）。
import type { Check, NetPuzzleSpec } from "../model/partsNet.js";
import { STROKE_ML, EJECT_S } from "../model/vessel.js";
import { refCatalogText } from "../model/refs.js";

const QMAX = (STROKE_ML * Math.PI) / (2 * EJECT_S);

/** 用意した謎。謎3（血管）と謎4（膜）を部品箱で書いたもの。見本と、確かめに通らないときの切りかえ先 */
export const PREPARED_NETS: readonly NetPuzzleSpec[] = [
  {
    title: "脈の見落とし",
    topic: "膝へ血液を運ぶ人工血管",
    scenes: [
      { tag: "心臓と血管のしごと", caption: ["心臓は1回の脈ごとに血液を送り出す。", "血管はふくらんで受け止め、次の脈までに先へ送る。"] },
      { tag: "試験装置", caption: ["心臓と血管のまねをした試験装置で、人工血管の試作品Bを調べる。"] },
      { tag: "ロボの検査", caption: ["ロボは1回の脈の平均の圧だけを読み、見本と比べる。", "答えは「区別できません」。"] },
    ],
    endLine: "でも、1回の脈の中の圧の動きまで、本当に見本と同じ？",
    analogy: "試験装置のポンプ＝決まった量の電流を送りこむもの、血管のふくらみやすさ＝電気をためる部品、出口の流れにくさ＝抵抗。圧＝電圧。",
    units: { level: { name: "圧", unit: "mmHg" }, amount: { name: "たまった血液", unit: "mL" }, flow: { name: "血液の流れ", unit: "mL/秒" } },
    clock: { kind: "beats", on: EJECT_S, period: 0.8, timeUnit: "秒" },
    nodes: [
      { id: "vessel", name: "人工血管の中" },
      { id: "out", name: "その先の細い血管", fixed: 0 },
    ],
    parts: [
      { id: "pump", type: "source", name: "試験装置のポンプ", role: "心臓が1回の脈ごとに送り出す血液（決まった量）", node: "vessel", amplitude: Number(QMAX.toFixed(2)), shape: "halfSine", ref: "westerhof2009" },
      { id: "wall", type: "store", name: "血管のふくらみやすさ", role: "血管の壁がふくらんで血液をためる", node: "vessel", C: 1.5, ref: "westerhof2009" },
      { id: "exit", type: "resist", name: "出口の流れにくさ", role: "血管の先の細い血管の流れにくさ", from: "vessel", to: "out", R: 1, ref: "westerhof2009" },
    ],
    watch: [{ probe: { node: "vessel" }, label: "血管の中の圧" }],
    robot: { probe: { node: "vessel" }, metric: "mean", says: "1回の脈の平均の圧が同じなら、同じ血管です。" },
    B: { part: "wall", param: "C", factor: 0.5, reveal: "血管Bは、ふくらみやすさが見本の半分。平均の圧は流れにくさだけで決まるので、ロボには同じに見えた。" },
    outOfScope: ["心臓が自分で縮むしくみと弁（この謎では、決まった量を送るポンプに置きかえた）", "実際の動脈で波がはね返ること"],
    link: { fromTitle: "仕掛けろ", story: "軟骨には血管がなく、押されて水が出入りして栄養をもらう。では、膝のまわりへ血液を運ぶ血管は？ 人工血管のチームへ。", change: "軟骨のばねとダンパのかわりに、ポンプ・ふくらむ血管・出口の細い管で組み立てた。" },
    nextTopics: ["神経の膜", "心臓"],
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
    analogy: "膜＝電気をためる部品、いつも開いている通り道＝抵抗、イオンの濃さの差がつくる −70 mV＝電池。",
    units: { level: { name: "膜の電圧", unit: "mV" }, amount: { name: "たまった電気", unit: "pC" }, flow: { name: "電流", unit: "nA" } },
    clock: { kind: "pulse", on: 100, record: 200, timeUnit: "ミリ秒" },
    nodes: [
      { id: "inside", name: "細胞の中" },
      { id: "rest", name: "イオンの濃さの差がつくる電池", fixed: -70 },
    ],
    parts: [
      { id: "gate", type: "source", name: "押されると開く入口", role: "押されているあいだ入ってくる電流", node: "inside", amplitude: 1, shape: "square", ref: "hodgkin1946" },
      { id: "mem", type: "store", name: "膜の電気のためやすさ", role: "あぶらでできた膜が、内と外に電気をためる", node: "inside", C: 1, ref: "hodgkin1946" },
      { id: "leakPath", type: "resist", name: "いつも開いている通り道", role: "イオンがたえず出入りして、たまった電気が逃げる道", from: "inside", to: "rest", R: 10, ref: "hodgkin1946" },
    ],
    watch: [{ probe: { node: "inside" }, label: "膜の電圧" }],
    robot: { probe: { node: "inside" }, metric: "plateau", says: "止める直前の膜の電圧が同じなら、同じ膜です。" },
    B: { part: "mem", param: "C", factor: 2.2, reveal: "膜Bは、電気のためやすさが見本の2.2倍。上がるのも戻るのもゆっくりだが、長く流せば同じ高さになる。" },
    outOfScope: ["その先で信号が脳へ送られるしくみ", "イオンの種類ごとの動き"],
    link: { fromTitle: "脈の見落とし", story: "膝が押された感じは、神経で脳へ伝わる。神経の膜は、本当に電気をためる。神経のチームへ。", change: "血管の模型と同じ「送りこむ・ためる・流れにくさ」に、電池（何もしていないときの膜の電圧 −70 mV）を一つ足した。" },
    nextTopics: ["心臓", "肺", "体温"],
  },
];

const SCHEMA = `{
  "title": "〇〇の見落とし（14字以内）",
  "topic": "題材",
  "scenes": [ {"tag": "場面の名前", "caption": ["一文", "一文（なくてもよい）"]} ×3 ],
  "endLine": "結びの一文（これからの謎を示す問い）",
  "analogy": "これまでの謎とのつながり（どの部品を電気の何に見立てたか）",
  "units": {"level": {"name": "高さにあたるもの", "unit": "単位"}, "amount": {"name": "たまる量", "unit": "単位"}, "flow": {"name": "流れ", "unit": "単位"}},
  "clock": {"kind": "pulse" か "beats", "on": 送る長さ, "period": 周期（beats のとき）, "record": 記録の長さ（pulse のとき）, "timeUnit": "秒など"},
  "nodes": [ {"id": "英小文字", "name": "場所の名前", "fixed": 高さ（高さの決まった場所だけ）} ],
  "parts": [ {"id": "英小文字", "type": "store|chamber|resist|valve|source", "name": "部品の名前", "role": "体（題材）の何にあたるか", "ref": "出典カタログの id", ...値とつなぎ先} ],
  "watch": [ {"probe": {"node": id} か {"flow": 部品id} か {"amount": 部品id}, "label": "プレイヤーが見るもの"} ]（1〜3個）,
  "robot": {"probe": 同上, "metric": "mean|max|min|plateau|halfTime|perCycle", "says": "ロボの証言（一文）"},
  "B": {"part": 部品id, "param": 値の名前, "factor": 倍率, "compensate": {"part": 部品id, "param": 値の名前}（任意）, "reveal": "正体の説明（一、二文）"},
  "outOfScope": ["この模型で扱わないこと", ...],
  "missingParts": ["部品箱にないが、本当は要る部品", ...]（なければ空）,
  "link": {"fromTitle": "前の謎の題名（そのまま写す）", "story": "前の謎の結びから、この謎へ進む話（ラボの誰かが次を頼む。一、二文）", "change": "前の模型から何を足した・置きかえたか（一文）"},
  "nextTopics": ["この謎の次に調べると面白い題材", ...]（2〜3個、それぞれ20字以内）
}`;

/** 模型を組み立てる指示文。topic は学生が知りたい題材（例：「心臓」「肺」「腎臓」）、previous は直前に解いた謎（つなぎの元） */
export function netPrompt(topic: string, previous: NetPuzzleSpec = PREPARED_NETS[1]!): string {
  return `あなたは教材「見立てラボ」の謎を組み立てる係です。学生はここまでに、人工軟骨（ばねとダンパの模型）の二つの謎→膝へ血液を運ぶ人工血管→膝の感覚を伝える神経の膜、の四つの謎を解き、まとめで「三つとも、ためる・流れにくさ・送りこむ（＋電池）の同じ部品の組み合わせで書ける。電気の部品で書くと、コンデンサ・抵抗・電流を送りこむもの・電池」と見ました。どの謎も、検査ロボ TEJUN が一つの数字だけを見て「区別できません」と言い、学生が測り方を変えて見落としを見つけます。
学生が直前に解いた謎は「${previous.title}」（${previous.topic}）で、その結びは「${previous.endLine}」でした。
学生は続きとして「${topic.slice(0, 40)}」について知りたがっています。同じ形の謎を一つ組み立ててください。

今回は、**模型の形そのものをあなたが組み立てます**。下の部品箱から部品を選んでつなぎ、題材のいちばん大事なはたらきが、模型の中で本当に動くようにしてください。表せるふりをしてはいけません。プログラムが組み立てた形のまま計算し、確かめます。

部品箱（電気の部品で言うと何か）：
- 節点（nodes）：ものがたまる場所、または高さの決まった場所。"fixed" を書いた節点は高さが決まっている（電池・地面・静脈の戻り口など）。fixed のない節点には、store か chamber をちょうど一つつなぐ。fixed の節点を少なくとも一つ置く
- store（ためる部品＝コンデンサ）：{"node", "C"}。たまった量 q、高さ＝q÷C（高さ 0 を基準に）
- chamber（自分で固くなる部屋＝固さが時間で変わるコンデンサ）：{"node", "Emin", "Emax", "V0"}。たまった量 V、高さ＝固さ×(V−V0)。固さは、時計の「送る」あいだ（on）だけ半正弦の形で Emin から Emax へ上がって戻る。外からエネルギーをもらって自分で縮み、中のものを押し出す部品（Emax > Emin）
- resist（流れにくさ＝抵抗）：{"from", "to", "R"}。流れ＝（from の高さ − to の高さ）÷R。両向きに流れる
- valve（一方通行の戸＝ダイオード）：{"from", "to", "R"}。from の方が高いときだけ、流れ＝差÷R。逆には流れない
- source（送りこむもの＝電流源）：{"node", "amplitude", "shape"}。時計の「送る」あいだ、決まった量を送りこむ（shape は "square" か "halfSine"）
- 時計（clock）は一つ：pulse（一度だけ。0〜on のあいだ送り、record まで記録）か beats（period ごとにくり返し、毎回 0〜on のあいだ送る）。source と chamber は同じ時計で動く
- 節点は7つまで、部品は12個まで

組み立ての約束：
- どのたまる場所からも、resist か valve を通って fixed の節点へ逃げる道があること（ためたものがたえず逃げられないと、模型が落ち着かない）
- どの部品も実際に流れる・動くこと（飾りの部品を置かない）
- 題材のはたらきのうち、部品箱で表せない部分は outOfScope に書き、本当は要る部品を missingParts に書く。表せる範囲を正直に選ぶ
- 値は教科書で使う程度のもっともらしい値でよいが、「模型の値」であり体の値を表さない。単位は学生に分かるものを書く

出典の約束（実世界を完全に表す模型はないので、実物と違う点があってもよい。ただし、研究として確立していない空想で説明してはいけない）：
- どの部品にも "ref" を書く。ref は下の出典カタログの id だけ。カタログにない文献を書かない（作らない）
- その文献が支える種類の部品にだけ使う。その文献が扱っていないことを、その文献の部品の役（role）にしない
- 別の対象の文献の形だけを借りない（例：肺の文献で胃を表さない）。部品の名前か役には、その文献の対象（カタログの括弧の中）にあたる言葉を入れる
- 題材の大事なはたらきを、カタログのどの文献でも支えられないときは、支えられる部分を選んで謎にする。支えられない部分は outOfScope と missingParts に書く
出典カタログ：
${refCatalogText()}

つなぎの約束：
- link.fromTitle には前の謎の題名「${previous.title}」をそのまま写す
- link.story は、前の謎の結びから自然に続く話にする（前の謎で出てきたチームや部品にふれる）
- 前の模型と同じ種類の部品を一つ以上残し、一つ以上を足すか置きかえる（同じ見方を一歩ずつ広げる）。前の模型：${previous.parts.map((p) => `${p.name}（${p.type}）`).join("、")}${previous.nodes.some((n) => typeof n.fixed === "number" && n.fixed !== 0) ? "、電池（高さの決まった場所）" : ""}
- nextTopics には、この謎の次に調べると面白い題材を2〜3個（物理・化学・生物をまたぐもの）

謎の約束：
- robot は一つの場所・一つの数字だけを見る：mean（平均）／max（最高）／min（最低）／plateau（送り終わる直前、pulse だけ）／halfTime（送り終えてから、初めの高さとの差が半分に戻るまでの時間、pulse だけ）／perCycle（その部品を1回で流れた量、flow だけ）
- B は見本Aと、一つの部品の一つの値（store の C、chamber の Emin・Emax・V0、resist・valve の R、source の amplitude）が factor 倍違う（0.33〜3倍、1.3倍以上の違い）
- ロボの数字が、AとBで同じになること。ひとりでに同じにならないときは compensate に「もう一つの値」を書けば、プログラムがロボの数字がそろうようにその値を 0.2〜5 倍の中で合わせる（Bは二つの値が違うことになるので、reveal にもそう書く）
- watch に書いたもののどこかでは、AとBの違いが見える（その振れ幅の8%以上）こと。プレイヤーはここで見落としを見つける
- 言葉は中学生に分かる言葉にする。病名・診断・治療・薬・手術・異常など、病気や治療につながる言葉は使わない。人物は出さない
- analogy では、前の謎とのつながりを書く（例：〇〇＝電気をためる部品、〇〇＝一方通行の戸（ダイオード））

出力は次の形の JSON だけ（説明文や \`\`\` は付けない）：
${SCHEMA}

見本（すでにある謎を同じ形で書いたもの。どちらも部品3つの小さな模型）：
${JSON.stringify(PREPARED_NETS[0])}
${JSON.stringify(PREPARED_NETS[1])}`;
}

/** 確かめに通らなかったとき、理由を添えて一度だけ作り直してもらう */
export function netRetryPrompt(topic: string, before: NetPuzzleSpec | undefined, previous: unknown, failed: Check[]): string {
  return `${netPrompt(topic, before)}

さきほどの出力は、プログラムの確かめに通りませんでした。
出力：${JSON.stringify(previous).slice(0, 6000)}
通らなかった点：
${failed.map((c) => `- ${c.label}：${c.detail}`).join("\n")}
これらを直した JSON だけを出力してください。`;
}
