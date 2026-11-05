// 見立てラボ「検査ロボとの対決」（新しい画面）。一画面の舞台・メッセージ窓・コマンド。
// 謎1はサーバーのセッション（隠れた試料B・誤差つきの記録・比較器・Claude）を使う。
// 謎2〜4は公開の式だけの計算（誤差なし。謎3の血管B・謎4の膜Bは固定例）。章は 1c-2 で四つ。検査ロボは定型ルールで動き、AIではない。
import "./play.css";
import { api, status, type Debrief, type Hint, type PredictionChoice, type PublicSessionView, type Translation } from "../api.js";
import { CANDIDATES, type CandidateId } from "../../server/model/public.js";
import { compare } from "../../server/model/comparator.js";
import { fitCandidate, predictedCurve } from "../../server/model/fit.js";
import { trueCurve } from "../curve.js";
import { BASE } from "../../server/model/public.js";
import { dentWithinStep, PHASE_LABEL, PLAY_RUN_PERIOD, PLAY_RUN_STEPS, STEP_PHASES, STEP_TOLERANCE, TEMPOS, type StepPhase, type TempoId } from "../../server/model/steps.js";
import { CARTILAGE_POINTS, judgeRetrain, MEMBRANE_POINTS, RETRAIN_SLOTS, retrainSpec, VESSEL_POINTS, type RetrainCase } from "../../server/model/retrain.js";
import { DUEL_PERIOD, DUEL_ROUNDS, DUEL_SLIDERS, DUEL_STEP, duelMaterial, duelSteps, HIDDEN_NEED, judgeDuel, ROBOT_PASS } from "../../server/model/duel.js";
import { BASE_VESSEL, BEAT_S, CASE_VESSEL_B, judgeSync, pressureAt, pumpFlow, summarize, VESSEL_ROBOT_TOL, VESSEL_SEE_DIFF, VESSEL_SLIDERS } from "../../server/model/vessel.js";
import { BASE_MEM, CASE3_B, deltaMv, HALF_TIME_TOL, HIDDEN1_NEED, HIDDEN2_NEED, judgeMemDuel, MEM_ROUNDS, MEM_SLIDERS, PULSE_MS, RECORD_MS, REST_MV, ROBOT_STEADY_TOL, SEE_DIFF } from "../../server/model/membraneGame.js";
import { BRIDGE_SLIDERS, bridgeSolved, bridgeTimes, circuitAt, judgeBridge, materialForceAt, playerCircuit } from "../../server/model/bridge.js";
import { duelStepGraph, retrainMap, runTimeline, overlayChart, seriesCircuit, beatChart, bubble, ghostPuck, heartCircuit, legsStage, loopStage, miniGraph, membraneGraph, membranePatch, nerveStage, nerveWhole, robotArt, introMovie, movieLength, type MovieId, slsModel, slsModelLabeled, ruleCard, syncChart, tankStage, type Mood } from "./art.js";
import { beep, floatDamage, reduceMotion, rollNumbers, shake, sleep, sound, stamp } from "./fx.js";
import { checkBoard, fmtv, iconFor, lineChart, machine, machineScale, nextMovie, nextMovieLength, organ, partsBox, unitOf, wrapLines, type IconId, type MachineScale } from "./next.js";
import { getSample, makeNext, recordFor, type Attempt, type Made } from "./nextGen.js";
import { PREPARED_NETS } from "../../server/puzzle/netPrompt.js";
import { probeSeries, runNet, SEE_REL, topicProblem, type DiffType, type NetPuzzleSpec } from "../../server/model/partsNet.js";
import { refById } from "../../server/model/refs.js";

type Scene =
  | "title"
  | "movie"
  | "c1-say"
  | "c1-run"
  | "c1-present"
  | "c1-line"
  | "c1-solved"
  | "c2"
  | "c2-map"
  | "c3-say"
  | "c3-watch"
  | "c3-present"
  | "c3-sync"
  | "c4-say"
  | "c4-watch"
  | "c4-present"
  | "c4-why"
  | "c4-duel"
  | "rt"
  | "end"
  | "n-pick"
  | "n-make"
  | "n-movie"
  | "n-watch"
  | "n-reveal";
type Who = "bot" | "you" | "cl" | "calc" | "guide" | "ai";
type Tag = "match" | "out" | "unsure";
interface Cmd {
  act: string;
  label: string;
  sub?: string;
  val?: string;
  hot?: boolean;
  disabled?: boolean;
  ghost?: boolean;
}
interface Evidence {
  id: string;
  case: 1 | 3 | 4;
  title: string;
  line: string;
  big: string;
  ok: boolean;
}
interface View {
  chap: string;
  goal: string;
  svg: string;
  html?: string;
  who: Who;
  text: string;
  sub?: string;
  extra?: string;
  cmds: Cmd[];
}

const COLOR: Record<CandidateId, string> = { overall: "#6aa8e8", instant: "#e06fb0", relax: "#b9a6ff", same: "#aab2c8" };
const LOOK: Record<CandidateId, string> = { overall: "20秒後もAとずれたまま", instant: "高さが違い、下がる速さはAと同じ", relax: "下がる速さが違う", same: "Aの線と重なる" };
const PART: Record<CandidateId, string> = { overall: "模型では：左のばね", instant: "模型では：右のばね", relax: "模型では：ダンパ（ねばり）", same: "模型では：どの部品も同じ" };
const SPEED: Record<number, string> = { 0.2: "すばやく（0.2秒）", 1: "ふつう（1秒）", 5: "ゆっくり（5秒）" };
const WHO_LABEL: Record<Who, string> = { bot: "検査ロボ TEJUN", you: "あなた", cl: "相棒 Claude（AI）・答えを知らない", calc: "計算プログラム", guide: "案内", ai: "Claude（AI）・謎を組み立てる" };

const state = {
  scene: "title" as Scene,
  claude: false,
  busy: false,
  error: "",
  conf: 100,
  mood: "smug" as Mood,
  panel: "notice" as null | "notice" | "about" | "card" | "refs",
  line: { who: "bot" as Who, text: "", rest: [] as string[] },
  view: null as PublicSessionView | null,
  debrief: null as Debrief | null,
  evidence: [] as Evidence[],
  sel: null as string | null,
  // 謎1
  say: 0,
  bet: null as PredictionChoice | null,
  cursor: 0,
  runId: "",
  shown: 0,
  playing: null as number | null,
  note: null as number | null,
  curveId: "",
  tags: {} as Partial<Record<CandidateId, Tag>>,
  boardView: null as PublicSessionView | null,
  nextSpeed: null as number | null,
  translation: null as Translation | null,
  summoned: null as CandidateId | null,
  hint: null as Hint | null,
  c1Hit: false,
  // 謎2・謎4の対決
  round: 0,
  e1: 1,
  tau: 1,
  duelPhase: "design" as "design" | "test" | "judge" | "result",
  duelCleared: false,
  duelLog: [] as string[],
  duelHint: 0,
  // 謎3
  u: 0,
  vPlaying: false,
  vBet: null as "r" | "c" | "unknown" | null,
  syncR: 1,
  syncC: 1.5,
  syncDone: false,
  brR: 1,
  brC1: 1,
  brDone: false,
  brHint: 0,
  // 謎4
  memT: 0,
  memRan: false,
  movieT: 0,
  movieId: 1 as MovieId,
  moviePlaying: false,
  memTank: false,
  memWhy: {} as Partial<Record<"g" | "c", "match" | "out" | "unsure">>,
  memChecked: false,
  g: 1,
  c: 1,
  record: [] as string[],
  // 検査ロボの鍛えなおし（1c-3）
  rt: { c: "cartilage" as RetrainCase, slots: [] as string[], tempo: "slowWalk" as TempoId, step: 11, phase: "land" as StepPhase, t: 0, hint: 0, done: false },
  rtLog: {} as Partial<Record<RetrainCase, string[]>>,
  memLog: [] as string[],
  c2cursor: null as number | null,
  // つづきの謎（1e-4）
  nx: {
    prev: PREPARED_NETS[1]! as NetPuzzleSpec,
    prevSource: "prepared" as "prepared" | "live" | "record",
    made: null as Made | null,
    attempts: [] as Attempt[],
    sc: null as MachineScale | null,
    shown: 0,
    k: 0,
    playing: false,
    watch: 0,
    ev: null as null | { ok: boolean; t: number; d: number; label: string },
    revealed: false,
    mt: 0,
    mplaying: false,
    live: false,
    topic: "",
    /** 題材の入力欄の文字（1e-4。題材の名前だけ。チャット欄ではない） */
    input: "",
  },
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const mvs = (v: number) => v.toFixed(1).replace("-", "−");
const sgn = (x: number, d = 3) => {
  const s = Math.abs(x).toFixed(d);
  return `${Number(s) === 0 ? "±" : x > 0 ? "+" : "−"}${s}`;
};
/**
 * 日本語の文を文節に近い切れ目で区切り、その切れ目にだけ改行の候補（<wbr>）を置く（CSS の keep-all と組み合わせる）。
 * 語の区切りはブラウザの Intl.Segmenter。ひらがなで始まる語（助詞・語尾）や漢字・カタカナの続きは前の語につなげ、句読点・かぎかっこの前後で区切る。
 */
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
function phrase(text: string): string {
  if (!segmenter) return esc(text);
  const chunks: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    const last = chunks[chunks.length - 1];
    // 新しい区切りを始めるのは：句点・読点のあと／かぎかっこ・かっこの始まり／ひらがな（か閉じかっこ）で終わった後に、ひらがなでない語が来たとき
    const startsNew =
      last === undefined ||
      /[、。！？]$/.test(last) ||
      (/^[「（]/.test(segment) && !/[「（]$/.test(last)) ||
      ((/[\u3041-\u309f\u30fc」）]$/.test(last)) && !/^[\u3041-\u309f\u30fc、。！？」）・…]/.test(segment));
    if (startsNew) chunks.push(segment);
    else chunks[chunks.length - 1] = last + segment;
  }
  return chunks.map(esc).join("<wbr>");
}
const roll = (v: string, delay = 0) => `<span data-roll="${v}" data-delay="${delay}">${v}</span>`;

/** メッセージ窓に出す。長い文は「。」の切れ目で分け、窓を押すと次へ送る（一度に一つか二つの文） */
function say(who: Who, text: string): void {
  const parts = text.split(/(?<=[。？！])/).filter((x) => x.trim());
  const pages: string[] = [];
  for (const p of parts) {
    const last = pages[pages.length - 1];
    if (last !== undefined && last.length + p.length <= 52) pages[pages.length - 1] = last + p;
    else pages.push(p);
  }
  state.line = { who, text: pages[0] ?? "", rest: pages.slice(1) };
}

async function damage(n: number): Promise<void> {
  state.conf = Math.max(0, state.conf - n);
  render();
  floatDamage(n);
}

// ---------- 謎1：証言 ----------
let introLine = "";
let movieTimer = 0;
function movieLoop(): void {
  const s0 = performance.now() - state.movieT * 1000;
  const tick = () => {
    if (!state.moviePlaying || state.scene !== "movie") return;
    state.movieT = (performance.now() - s0) / 1000;
    if (state.movieT >= movieLength(state.movieId)) {
      state.movieT = movieLength(state.movieId);
      state.moviePlaying = false;
      render();
      return;
    }
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS["movie"]().svg;
    movieTimer = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(movieTimer);
  tick();
}
const MOVIE_INFO: Record<MovieId, { chap: string; goal: string; go: string; label: string; sub: string }> = {
  1: { chap: "謎1 見破れ", goal: "はじまりの話：試作品Bと検査ロボ", go: "to-c1say", label: "検査室へ", sub: "ロボの話を聞く" },
  2: { chap: "謎2 仕掛けろ", goal: "はじまりの話：検査を鍛えなおす", go: "enter-c2", label: "設計台へ", sub: "ロボの検査の手順を見る" },
  4: { chap: "謎3 脈の見落とし", goal: "はじまりの話：膝へ血液を運ぶ人工血管と検査ロボ", go: "enter-c3", label: "試験装置へ", sub: "ロボの話を聞く" },
  5: { chap: "謎4 膜の見落とし", goal: "はじまりの話：膝の感覚を伝える神経の膜と検査ロボ", go: "enter-c4", label: "膜の実験台へ", sub: "ロボの話を聞く" },
};
function movieView(): View {
  const m = MOVIE_INFO[state.movieId];
  return {
    chap: m.chap,
    goal: m.goal,
    svg: introMovie(state.movieId, state.movieT),
    who: state.line.who,
    text: state.line.text,
    cmds: state.moviePlaying
      ? [{ act: "movie-skip", label: "最後まで飛ばす", ghost: true }]
      : [
          { act: m.go, label: m.label, sub: m.sub, hot: true },
          { act: "movie-replay", label: "もう一度見る", ghost: true },
        ],
  };
}
function startMovie(id: MovieId, line: string): void {
  state.movieId = id;
  state.movieT = reduceMotion() ? movieLength(id) : 0;
  state.moviePlaying = !reduceMotion();
  say("guide", line);
  go("movie");
  if (state.moviePlaying) movieLoop();
}
function c1Say(): View {
  const r = state.view!.intro;
  const lines: [string, string, string, string][] = [
    ["証言 1 / 2", "「押して20秒後の力は", `　A：${r.base.toFixed(3)} [N]　　B：${r.force.toFixed(3)} [N]`, `　ちがいは、わずか ${Math.abs(r.diff).toFixed(3)} [N]」`],
    ["証言 2 / 2", `「私の手順では、ちがいが ${r.tolerance} [N] より`, "　小さければ「同じ」とみなします。", "　だから、AとBは同じ軟骨です」"],
  ];
  const [lab, l1, l2, l3] = lines[Math.min(state.say, 1)]!;
  const asked = state.say >= 2;
  return {
    chap: "謎1 見破れ",
    goal: "ロボの証言を聞き、確かめ方を考えよう",
    svg: `${ruleCard(40, 40, "TEJUN の検査の手順", ["① 1秒かけて押しこみ、止める", "② 20秒待つ", "③ 押し返す力を読む", "④ ちがい 0.03 [N] 未満 → 同じ"], null, false)}
      ${bubble(360, 60, lab, l1, l2, 570, l3)}${robotArt(state.mood, 960, 40, 0.95)}
      <g transform="translate(40,300)"><rect width="820" height="74" rx="12" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
        <text x="18" y="30" fill="var(--ink)" font-size="17" font-weight="900">A＝見本：いままでの人工軟骨。性質が分かっていて、比べる基準になる</text>
        <text x="18" y="58" fill="var(--ink)" font-size="17" font-weight="900">B＝試作品：新しくつくった人工軟骨。見本と同じか、調べたい</text></g>`,
    who: "bot",
    text: state.line.text,
    cmds: !asked
      ? [
          { act: "c1-next", label: state.say === 0 ? "次の証言" : "聞き返す", sub: state.say === 0 ? "" : "何を測っていないか、聞き出す", hot: true },
        ]
      : [
          { act: "bet", val: "midSame", label: "走っても同じ", sub: "ロボが区別できないなら" },
          { act: "bet", val: "midDiffer", label: "どこかで違う", sub: "体重のかけ方しだいで差が出そう" },
          { act: "bet", val: "unknown", label: "まだ分からない", sub: "走らせてから考える" },
        ],
  };
}

// ---------- 謎1：走行テスト（リズム） ----------
function currentRun() {
  return state.view?.runs.find((r) => r.id === state.runId) ?? null;
}
function tempoName(p: number): string {
  if (Math.abs(p - PLAY_RUN_PERIOD) < 1e-9) return "走る";
  let best = TEMPOS[0]!;
  for (const t of TEMPOS) if (Math.abs(Math.log(t.period / p)) < Math.abs(Math.log(best.period / p))) best = t;
  return Math.abs(best.period - p) < 1e-9 ? best.label : `${best.label}に近い`;
}
/** 時間のバーの測った点（最初の PLAY_RUN_STEPS 歩 × 4点）。i → 何歩目・どの時点・時刻 */
const RUN_POINTS = Array.from({ length: PLAY_RUN_STEPS * 4 }, (_, i) => {
  const k = Math.floor(i / 4);
  const phase = STEP_PHASES[i % 4]!;
  const t = k * PLAY_RUN_PERIOD + (phase === "land" ? 0 : phase === "pre" ? PLAY_RUN_PERIOD : PLAY_RUN_PERIOD / 2);
  return { i, k, phase, t };
});
const RUN_T_MAX = PLAY_RUN_PERIOD * PLAY_RUN_STEPS;
type StepRow = { land: number; peak: number; lift: number; pre: number };
/** 一歩の中の位置 u（0〜1）の値。B は測った点を結んだ線、A は計算の式 */
const alongB = (d: StepRow, u: number) => (u < 0.5 ? d.land + (d.peak - d.land) * (u / 0.5) : d.lift + (d.pre - d.lift) * ((u - 0.5) / 0.5));
function runAt(run: NonNullable<ReturnType<typeof currentRun>>, t: number): { a: number; b: number; contact: boolean; u: number; k: number } {
  const k = Math.min(PLAY_RUN_STEPS - 1, Math.floor(t / PLAY_RUN_PERIOD + 1e-9));
  const u = Math.max(0, Math.min(1, (t - k * PLAY_RUN_PERIOD) / PLAY_RUN_PERIOD));
  return { a: dentWithinStep(BASE, PLAY_RUN_PERIOD, run.a, k, u), b: alongB(run.b[k]!, u), contact: u < 0.5, u, k };
}
const pointValue = (rows: readonly StepRow[], i: number) => rows[RUN_POINTS[i]!.k]![RUN_POINTS[i]!.phase];
/** 時刻 t にいちばん近い測った点（同じ時刻の二点は、跳んだ後の点） */
function nearestPoint(t: number): number {
  let best = 0;
  let bd = Infinity;
  for (const p of RUN_POINTS) {
    const d = Math.abs(p.t - t) + (p.phase === "peak" || p.phase === "pre" ? 1e-6 : 0);
    if (d < bd) { bd = d; best = p.i; }
  }
  return best;
}
const pointLabel = (i: number) => `${RUN_POINTS[i]!.k + 1}歩目・${PHASE_LABEL[RUN_POINTS[i]!.phase]}`;

function c1Run(): View {
  const run = currentRun();
  const v = state.view!;
  const playing = state.playing !== null;
  const cur = state.playing ?? state.cursor;
  const at = run ? runAt(run, cur) : null;
  const sel = run && !playing && state.note !== null ? state.note : null;
  // 点を選んだら、その測った点の値で描く（同じ時刻の二点は、選んだほう）
  const dents = run && sel !== null
    ? { a: pointValue(run.a, sel), b: pointValue(run.b, sel), contact: RUN_POINTS[sel]!.phase === "land" || RUN_POINTS[sel]!.phase === "peak", impact: false }
    : at ? { a: at.a, b: at.b, contact: at.contact, impact: playing && at.contact && at.u < 0.06 } : { a: 0, b: 0, contact: false, impact: false };
  const diff = run && sel !== null ? pointValue(run.b, sel) - pointValue(run.a, sel) : null;
  const us = [...Array.from({ length: 21 }, (_, q) => q / 40), ...Array.from({ length: 21 }, (_, q) => 0.5 + 1e-6 + q / 40)];
  const aLine = run ? Array.from({ length: PLAY_RUN_STEPS }, (_, k) => us.map((u) => ({ t: (k + Math.min(u, 1)) * PLAY_RUN_PERIOD, v: dentWithinStep(BASE, PLAY_RUN_PERIOD, run.a, k, Math.min(u, 1)) }))).flat() : [];
  const bPts = RUN_POINTS.map((p) => {
    const shown = !!run && p.i < state.shown;
    const d = run ? pointValue(run.b, p.i) - pointValue(run.a, p.i) : 0;
    return { t: p.t, v: run ? pointValue(run.b, p.i) : 0, shown, hot: shown && Math.abs(d) > STEP_TOLERANCE, sel: sel === p.i, shot: !!run && v.runPhotos.some((x) => x.runId === run.id && x.step === p.k && x.phase === p.phase) };
  });
  const have = state.evidence.some((e) => e.case === 1 && e.id.startsWith("run"));
  return {
    chap: "謎1 見破れ",
    goal: run ? "AとBの差が大きかった瞬間（赤い点）を選んで、証拠に保存しよう" : "見本Aと試作品Bを、同じように走らせてみよう",
    svg: `${legsStage({ dentA: dents.a, dentB: dents.b, contact: dents.contact, impact: dents.impact, labelA: "見本 A", labelB: "試作品 B", diff, hot: diff !== null && Math.abs(diff) > STEP_TOLERANCE, x0: -92, y0: 34, scale: 0.76 })}
      ${runTimeline({ x: 648, y: 14, w: 616, h: 392, period: PLAY_RUN_PERIOD, steps: PLAY_RUN_STEPS, aLine, bPts, now: run ? cur : null, tol: STEP_TOLERANCE })}`,
    html: `<div class="timebar"><input type="range" id="c1-t" min="0" max="${RUN_T_MAX}" step="0.05" value="${cur}" ${!run || playing ? "disabled" : ""} aria-label="時間のバー（秒）"><b id="c1-t-label">${run && !playing ? (sel !== null ? pointLabel(sel) : "バーを動かすか、点を押して選ぶ") : ""}</b></div>`,
    who: state.line.who,
    text: state.line.text,
    cmds: [
      { act: "go-run", label: run ? "もう一度走らせる" : "走らせる", hot: !run, disabled: playing || state.busy },
      { act: "shot", label: "この瞬間を証拠に保存", sub: sel !== null ? pointLabel(sel) : "赤い点を選ぶ", hot: sel !== null, disabled: sel === null || state.busy || playing },
      { act: "to-present", label: "ロボに証拠を見せる", sub: "証拠ファイルを開く", disabled: !have, hot: have && sel === null },
    ],
  };
}

// ---------- 証拠を見せる（謎1・3・4 共通） ----------
function presentView(c: 1 | 3 | 4, testimony: [string, string], base: Evidence, goal: string): View {
  const cards = [base, ...state.evidence.filter((e) => e.case === c)];
  return {
    chap: c === 1 ? "謎1 見破れ" : c === 3 ? "謎3 脈の見落とし" : "謎4 膜の見落とし",
    goal,
    svg: `${bubble(470, 80, "証言 2 / 2", testimony[0], testimony[1], 400)}${robotArt(state.mood, 960, 40, 0.95)}`,
    html: `<div class="tray">${cards
      .map(
        (e) => `<button class="card-ev ${state.sel === e.id ? "on" : ""} ${e.id === base.id ? "dim" : ""}" data-act="sel" data-val="${e.id}" aria-pressed="${state.sel === e.id}">
          <strong>${esc(e.title)}</strong>${esc(e.line)}<br><span class="big">${esc(e.big)}</span></button>`,
      )
      .join("")}</div>`,
    who: state.line.who,
    text: state.line.text,
    cmds: [
      { act: "present", val: String(c), label: "この証拠を見せる", sub: state.sel ? `選んだ証拠：${cards.find((x) => x.id === state.sel)?.title ?? ""}` : "証拠を選ぶ", hot: !!state.sel, disabled: !state.sel || state.busy },
      { act: "back-watch", val: String(c), label: "証拠を集めに戻る", ghost: true },
    ],
  };
}

function c1Present(): View {
  const r = state.view!.intro;
  const base: Evidence = { id: "c1-base", case: 1, title: "いつもの検査", line: "押して20秒後の力", big: `差 ${sgn(r.diff)}`, ok: false };
  if (state.c1Hit)
    return {
      ...presentView(1, ["「だから、AとBは", "　同じ軟骨です」"], base, "見落としを突いた"),
      cmds: [{ act: "to-bench", label: "なぜ違う？ 試験台で調べる", sub: "押し返す力を記録して、4つの説明の予想の線と見比べる", hot: true, disabled: state.busy }],
    };
  return presentView(1, ["「だから、AとBは", "　同じ軟骨です」"], base, "ロボに、違いが見えた証拠を見せよう");
}

/** 「合う／合わない／分からない」を三つのボタンで選ぶ（一つの札を押して切りかえる形は、選べることが分からないため） */
function tagButtons(act: string, id: string, cur: string | undefined, disabled: boolean): string {
  return `<span class="tags" role="group" aria-label="記録と合うか">${(
    [
      ["match", "合う"],
      ["out", "合わない"],
      ["unsure", "分からない"],
    ] as const
  )
    .map(([t, l]) => `<button class="tagb ${t} ${cur === t ? "on" : ""}" data-act="${act}" data-val="${id}:${t}" aria-pressed="${cur === t}" ${disabled ? "disabled" : ""}>${l}</button>`)
    .join("")}</span>`;
}

// ---------- 謎1：4つの説明の見比べ ----------
function curve() {
  return state.view?.curves.find((c) => c.id === state.curveId) ?? null;
}
function fitFor(id: CandidateId) {
  const c = curve();
  if (!c) return null;
  const end = state.view!.records.find((r) => r.id === `${c.id}@0`);
  if (!end) return null;
  return fitCandidate(id, c.pushSeconds, end.force, compare(state.view!.records).candidates[id].interval);
}

function c1Line(): View {
  const v = state.view!;
  const c = curve()!;
  const awaiting = v.awaitingPick && c.studentPick === null;
  const bv = awaiting && state.boardView ? state.boardView : v;
  const checked = !awaiting && c.studentPick !== null;
  const narrowed = checked && v.overall === "narrowed";
  const yMax = Math.max(2.2, ...c.b.map((p) => p.force + 0.2));
  const ids = (["instant", "overall", "relax", "same"] as CandidateId[]).sort((a, b) => (a === state.summoned ? -1 : b === state.summoned ? 1 : 0));
  const live = ids.filter((id) => !(bv.candidates.find((x) => x.id === id)!.status === "inconsistent" && !c.excluded.includes(id)));
  const allTagged = live.every((id) => state.tags[id]);
  const picked = checked && c.studentPick !== "unsure" ? (c.studentPick as CandidateId[]) : [];
  const ghosts = ids
    .map((id) => {
      const prevOut = bv.candidates.find((x) => x.id === id)!.status === "inconsistent" && !c.excluded.includes(id);
      const fit = fitFor(id);
      const tag = state.tags[id];
      const outNow = checked && c.excluded.includes(id);
      const back = checked && picked.includes(id) && !c.excluded.includes(id);
      const broken = prevOut || outNow;
      const res = prevOut ? `<span class="res">前の記録で合わない</span>` : outNow ? `<span class="res">計算：合わない</span>` : back ? `<span class="res back">計算：実は記録と合う</span>` : narrowed && v.narrowedTo === id ? `<span class="res win">正体</span>` : "";
      return `<div class="ghost ${broken ? "broken" : ""} ${state.summoned === id ? "summoned" : ""}" style="--c:${COLOR[id]}" role="group" aria-label="説明：${CANDIDATES[id].label}">
        <span class="gname">${CANDIDATES[id].label}</span>
        <span class="glook">${LOOK[id]}</span>
        ${broken ? ghostPuck(COLOR[id], true) : ""}
        ${fit ? miniGraph({ b: c.b, line: predictedCurve(fit.params, c.pushSeconds), lineColor: COLOR[id], a: trueCurve(BASE, c.pushSeconds), push: c.pushSeconds, yMax, w: 240, h: 260, legend: true }) : ""}
        ${awaiting && !prevOut ? tagButtons("tag", id, tag, false) : ""}
        ${res}
      </div>`;
    })
    .join("");
  const cmds: Cmd[] = awaiting
    ? [
        { act: "check", label: "選んだ答えを計算で確かめる", sub: allTagged ? "計算プログラムがまとめて確かめる" : `あと ${live.filter((id) => !state.tags[id]).length} つ選ぶ`, hot: allTagged, disabled: !allTagged || state.busy },
        { act: "words", label: state.claude ? "相棒（Claude）に相談" : "あなたの言葉に近い説明を探す", sub: "あなたの言葉から説明を選ぶ", ghost: true },
        { act: "hint", label: state.claude ? "相棒に、見どころを聞く" : "手がかりを見る", ghost: true, disabled: v.hintsLeft <= 0 || state.busy },
      ]
    : narrowed
      ? [{ act: "reveal", label: "正体を開ける", hot: true, disabled: state.busy }]
      : [
          ...([0.2, 1, 5] as const).map((p) => ({ act: "push", val: String(p), label: `${SPEED[p]}押す`, sub: p === state.nextSpeed ? "押し終わった瞬間の高さを予想してから" : "", hot: state.nextSpeed === p })),
        ];
  return {
    chap: "謎1 なぜ？",
    goal: awaiting ? "Bの記録（点）は、どの説明の線と合う？ 4つとも選ぼう" : narrowed ? "正体が一つに絞れた" : "まだ説明が二つ以上残る。別の速さで押そう",
    svg: "",
    html: `<div class="lineup">${ghosts}</div>`,
    who: state.line.who,
    text: state.line.text,
    extra:
      state.translation && awaiting
        ? `<div class="choices">${(state.translation.candidateIds.length ? state.translation.candidateIds : ids).map((id) => `<button class="choice" data-act="summon" data-val="${id}">「${CANDIDATES[id].label}」を前に呼ぶ</button>`).join("")}</div>`
        : !awaiting && !narrowed && state.nextSpeed !== null
          ? `<div class="choices">${(
              [
                ["same", "押し終わった瞬間はAとほぼ同じ"],
                ["higher", "Bのほうが大きい"],
                ["lower", "Bのほうが小さい"],
                ["unknown", "まだ分からない"],
              ] as const
            )
              .map(([id, l]) => `<button class="choice" data-act="push-go" data-val="${id}">${l}</button>`)
              .join("")}</div>`
          : "",
    cmds,
  };
}

function c1Solved(): View {
  const d = state.debrief!;
  const c = curve();
  const win = state.view?.narrowedTo ?? null;
  const fit = win ? fitFor(win) : null;
  const yMax = c ? Math.max(2.2, ...c.b.map((p) => p.force + 0.2)) : 2.2;
  // 説明は、だれにでも通じる三行だけ（ばねとダンパの模型は出さない：作者の指摘「非常に分かりにくい」）
  const lines = ["押された直後、軟骨は少しかたくなる。", "そのかたさは、時間がたつと消えていく。", "20秒待てば消えるので、AとBは同じ。", win === "instant" ? "でも走ると、押された直後のかたさが一歩ごとに効く。" : "でも走ると、消えきる前に次の一歩が来る。", "だから、一歩ごとのへこみがAと違った。"];
  return {
    chap: "謎1 解決",
    goal: "Bの正体が分かった",
    svg: `${robotArt("down", 1060, 120, 0.62)}
      <g transform="translate(30,26)"><rect width="1010" height="400" rx="18" fill="var(--paper)"/>
        <text x="30" y="44" fill="var(--paper-soft)" font-size="18" font-weight="900">Bの正体</text>
        <text x="30" y="84" fill="var(--paper-ink)" font-size="26" font-weight="900">${esc(d.explanation)}</text>
        ${lines.map((l, k) => `<text x="30" y="${150 + k * 44}" fill="var(--paper-ink)" font-size="21" font-weight="800">${esc(l)}</text>`).join("")}
        ${c && fit && win ? `<text x="520" y="134" fill="var(--paper-soft)" font-size="17" font-weight="900">試験台の記録と、重なった説明の線</text><g transform="translate(520,146)"><rect width="460" height="230" rx="10" fill="var(--panel)"/>${miniGraph({ b: c.b, line: predictedCurve(fit.params, c.pushSeconds), lineColor: COLOR[win], a: trueCurve(BASE, c.pushSeconds), push: c.pushSeconds, yMax, w: 460, h: 230, legend: true }).replace("<svg ", '<svg width="460" height="230" ')}</g>` : ""}
      </g>`,
    who: "bot",
    text: state.line.text,
    cmds: [{ act: "to-c2", label: "謎2：今度は、あなたが仕掛ける", hot: true }],
  };
}

// ---------- 謎2：仕掛けろ（走行テストの対決） ----------
function meter(title: string, a: number, b: number, diff: number, ok: boolean, kind: "pass" | "hide", lim: number, range: number, unit = "", d = 3): string {
  const pos = (x: number) => (50 + (50 * Math.max(-range, Math.min(range, x))) / range).toFixed(1);
  const zone = kind === "pass" ? `<i class="zone" style="left:${pos(-lim)}%;right:${(100 - Number(pos(lim))).toFixed(1)}%"></i>` : `<i class="zone hide" style="left:0;right:${(100 - Number(pos(-lim))).toFixed(1)}%"></i><i class="zone hide" style="left:${pos(lim)}%;right:0"></i>`;
  return `<div class="meter ${ok ? "ok" : ""}"><b>${title} ${ok ? "✓" : ""}</b><div class="track">${zone}<i class="needle" style="left:calc(${pos(diff)}% - 2px)"></i></div>
    <span class="nums">A ${roll(a.toFixed(d).replace("-", "−"))}${unit}／あなた ${roll(b.toFixed(d).replace("-", "−"), 120)}${unit}　差 ${sgn(diff, d)}${unit}</span></div>`;
}

/** 謎2：ゆっくり歩かせた12歩目の中のへこみ（表示用。判定は judgeDuel） */
function duelCurve(e1: number, tau: number): { u: number; v: number }[] {
  const p = duelMaterial(e1, tau);
  const steps = duelSteps(p);
  const us = [...Array.from({ length: 31 }, (_, q) => q / 60), ...Array.from({ length: 31 }, (_, q) => 0.5 + 1e-6 + q / 60)];
  return us.map((u) => ({ u: Math.min(u, 1), v: dentWithinStep(p, DUEL_PERIOD, steps, DUEL_STEP, Math.min(u, 1)) }));
}
const PH_U = { land: 0, peak: 0.5 } as const;
const PH_NAME = { land: "着地直後", peak: "足を上げる直前" } as const;
function duelGraph(roundIdx: number, e1: number, tau: number, x: number, y: number, w: number, h: number, cursor: number | null): string {
  const round = DUEL_ROUNDS[roundIdx]!;
  const r = judgeDuel(round, duelMaterial(e1, tau));
  const rp = round.robot.phase as "land" | "peak";
  const hp = round.hidden.phase as "land" | "peak";
  return duelStepGraph({
    x, y, w, h, period: DUEL_PERIOD, a: duelCurve(BASE.e1, BASE.tau), b: duelCurve(e1, tau), cursor, scan: cursor !== null,
    robot: { u: PH_U[rp], label: PH_NAME[rp], diff: r.robot.diff, ok: r.robot.ok, goal: `差を ${ROBOT_PASS} より小さく（見本と同じに）` },
    hidden: { u: PH_U[hp], label: PH_NAME[hp], diff: r.hidden.diff, ok: r.hidden.ok, goal: `差を ${HIDDEN_NEED} より大きく（違いを残す）` },
  });
}
const KNOB_NOTE = { e1: "大きいほど着地でへこみにくい", tau: "長いほどゆっくり沈んで戻る" } as const;
const knobShown = (key: "e1" | "tau", v: number) => (v + DUEL_SLIDERS[key].offset).toFixed(2);

function c2(): View {
  const round = DUEL_ROUNDS[state.round]!;
  const r = judgeDuel(round, duelMaterial(state.e1, state.tau));
  const rp = round.robot.phase as "land" | "peak";
  const judging = state.duelPhase === "judge";
  return {
    chap: "謎2 仕掛けろ",
    goal: `ロボが測る点では見本と同じ、測らない点では違う試作品をつくれ（ラウンド${round.id}）`,
    svg: `${ruleCard(24, 18, "ロボの検査の手順", ["① 押して20秒後の力", `② ゆっくり歩かせて、12歩目の${PH_NAME[rp]}`, `③ 差が ${ROBOT_PASS} より小さい → 同じ`], 1, round.id === 2)}
      <g transform="translate(24,172)"><rect width="310" height="62" rx="12" fill="var(--panel)" stroke="${r.final.ok ? "var(--you)" : "var(--stamp)"}" stroke-width="3"/>
        <text x="14" y="26" fill="var(--gold)" font-size="16" font-weight="900">🔍 ロボが測る：①20秒後の力</text>
        <text x="14" y="50" fill="var(--ink)" font-size="17" font-weight="900" font-variant-numeric="tabular-nums">差 ${sgn(r.final.diff, 3)} ${r.final.ok ? "✓" : `（${ROBOT_PASS} より小さく）`}</text></g>
      ${duelGraph(state.round, state.e1, state.tau, 356, 14, 906, 446, state.c2cursor)}`,
    html: `<div class="knobs big" style="left:1.5%;bottom:3%;width:25.5%">
        ${(["e1", "tau"] as const)
          .map((key) => {
            const s = DUEL_SLIDERS[key];
            return `<label><span>${s.label}<strong id="v-${key}">${knobShown(key, state[key])}</strong></span><input type="range" data-knob="${key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state[key]}" ${judging ? "disabled" : ""}><em>${KNOB_NOTE[key]}。見本は ${knobShown(key, BASE[key])}</em></label>`;
          })
          .join("")}
      </div>`,
    who: state.line.who,
    text: state.line.text,
    extra: state.duelHint
      ? `<p class="sub">${round.id === 1 ? "着地の瞬間のかたさを上げると、着地直後のへこみは浅くなる。かたさが消えるまでの時間を長くすると、前の一歩のへこみが戻りきらず深くなる。打ち消し合わせると？" : "足を上げる直前は見本と同じにしたまま、着地直後だけ深くしたい。着地の瞬間のかたさを下げてみよう。"}${state.duelHint > 1 ? " まず着地の瞬間のかたさだけを動かして、ロボが測る点の差を見てから、かたさが消えるまでの時間を動かそう。" : ""}</p>`
      : "",
    cmds:
      state.duelPhase === "result" && state.duelCleared
        ? [{ act: round.id === 1 ? "duel-next" : "to-map", label: round.id === 1 ? "ラウンド2へ" : "わかったことを見る", hot: true }]
        : [
            { act: "duel-go", label: "この試作品でロボに挑む", sub: "ロボが手順どおりに測る", hot: r.final.ok && r.robot.ok && r.hidden.ok, disabled: judging },
            { act: "duel-hint", label: "ヒント", ghost: true },
          ],
  };
}

function c2Map(): View {
  const designs = state.duelLog.map((s) => s.split(",").map(Number) as [number, number]);
  return {
    chap: "謎2 クリア",
    goal: "ロボは、測った点だけ見本と同じ試作品を、二回とも見落とした",
    svg: designs
      .slice(0, 2)
      .map(([e1, tau], i) => `<text x="${24 + i * 628}" y="30" fill="var(--ink)" font-size="19" font-weight="900">ラウンド${i + 1}のあなたの試作品</text>${duelGraph(i, e1, tau, 16 + i * 628, 40, 616, 420, null)}`)
      .join(""),
    who: state.line.who,
    text: state.line.text,
    cmds: [{ act: "rt-enter", val: "cartilage", label: "TEJUN を鍛えなおす", sub: "人工軟骨の検査で見る数字を、あなたが足す", hot: true }],
  };
}

// ---------- 謎3：脈の見落とし（人工血管。電気の言葉は使わない：1c-2） ----------
const VA = summarize(BASE_VESSEL);
const VB = summarize(CASE_VESSEL_B);
function c3Stage(): string {
  return loopStage({ u: state.u, a: BASE_VESSEL, b: CASE_VESSEL_B, pa: pressureAt(BASE_VESSEL, state.u), pb: pressureAt(CASE_VESSEL_B, state.u), minA: VA.min, minB: VB.min, flow: pumpFlow(state.u) });
}
function c3Say(): View {
  const lines: [string, string, string, string][] = [
    ["証言 1 / 2", "「1回の脈の平均の圧は", `　A：${VA.mean.toFixed(1)} [mmHg]　　B：${VB.mean.toFixed(1)} [mmHg]`, `　ちがいは、わずか ${Math.abs(VB.mean - VA.mean).toFixed(1)} [mmHg]」`],
    ["証言 2 / 2", `「私の手順では、ちがいが ${VESSEL_ROBOT_TOL} [mmHg] より`, "　小さければ「同じ」とみなします。", "　だから、AとBは同じ人工血管です」"],
  ];
  const [lab, l1, l2, l3] = lines[Math.min(state.say, 1)]!;
  return {
    chap: "謎3 脈の見落とし",
    goal: "心臓と血管のまねをした試験装置の、人工血管。ロボの証言を聞こう",
    svg: `<g transform="translate(-40,40) scale(0.72)">${c3Stage()}</g>${bubble(540, 30, lab, l1, l2, 470, l3)}${robotArt(state.mood, 1040, 120, 0.7)}`,
    who: "bot",
    text: state.line.text,
    sub: "mmHg（ミリメートル水銀柱）は、血圧に使う圧力の単位。値は模型の値で、体の血圧ではない。",
    cmds: state.say < 2 ? [{ act: "c3-next", label: state.say === 0 ? "次の証言" : "聞き返す", sub: state.say === 0 ? "" : "何を測っていないか、聞き出す", hot: true }] : [{ act: "to-watch3", label: "脈を観察する", sub: "1回の脈の途中で止めて撮る", hot: true }],
  };
}
function c3Watch(): View {
  const marks = state.evidence.filter((e) => e.case === 3).map((e) => Number(e.id.split(":")[1]));
  const have = state.evidence.some((e) => e.case === 3 && e.ok);
  return {
    chap: "謎3 脈の見落とし",
    goal: "1回の脈の途中で、AとBの圧に違いが見える瞬間を撮ろう",
    svg: `<g transform="translate(0,-40) scale(0.8)">${c3Stage()}</g>${beatChart(860, 40, 390, 200, BASE_VESSEL, CASE_VESSEL_B, state.u, marks)}`,
    html: `<div class="scrub" style="left:2%;top:90%"><button data-act="v-play">${state.vPlaying ? "一時停止" : "▶ 脈を動かす"}</button>
      <label>1回の脈の中の時刻 <input type="range" id="u" min="0" max="${BEAT_S}" step="0.01" value="${state.u}"></label><span>${state.u.toFixed(2)} 秒</span></div>`,
    who: state.line.who,
    text: state.line.text,
    sub: "管の太さ＝ふくらんで受け止めている液の量。mmHg は血圧に使う圧力の単位。値は模型の値で、体の血圧や、高い・低いの判定ではない。",
    cmds: [
      { act: "v-shot", label: "この瞬間を撮る", sub: `差が ${VESSEL_SEE_DIFF} mmHg を超えたら証拠`, hot: !have },
      { act: "to-present3", label: "ロボに証拠を見せる", disabled: !have, hot: have },
    ],
  };
}
function c3Present(): View {
  const base: Evidence = { id: "c3-base", case: 3, title: "ロボの検査", line: "1回の脈の平均の圧", big: `差 ${sgn(VB.mean - VA.mean, 1)}`, ok: false };
  const v = presentView(3, ["「だから、AとBは", "　同じ人工血管です」"], base, "ロボに、違いが見えた証拠を見せよう");
  if (state.line.who === "bot" && state.mood === "shock") v.cmds = [{ act: "to-sync", label: "なぜ違う？ 試験装置で同じ脈をつくる", hot: true }];
  return v;
}
/** なぜ？の試験装置：見本の血管の模型（つづきの謎と同じ見立ての装置）を、あなたのつまみの値で動かす */
function syncRig(mine: { r: number; c: number }): string {
  const base = PREPARED_NETS[0]!;
  const spec = { ...base, parts: base.parts.map((p) => (p.type === "store" ? { ...p, C: mine.c } : p.type === "resist" ? { ...p, R: mine.r } : p)) };
  const run = runNet(spec, 120);
  const k = Math.round(((state.u % BEAT_S) / BEAT_S) * 120);
  return `<text x="40" y="34" fill="var(--soft)" font-size="15" font-weight="900">あなたの試験装置</text>${machine(spec, run, k, machineScale(spec, [run]), { x: 20, y: 40, w: 460, h: 260, scale: 1.25 })}
    <text x="40" y="330" fill="var(--soft)" font-size="15" font-weight="800">ポンプ（心臓のかわり）→ ふくらむ人工血管 → 出口の細い管</text>`;
}
function c3Sync(): View {
  const mine = { r: state.syncR, c: state.syncC };
  const j = judgeSync(CASE_VESSEL_B, mine);
  const asked = state.vBet !== null;
  return {
    chap: "謎3 なぜ？",
    goal: asked ? "ふくらみやすさと出口の流れにくさのつまみで、血管Bと同じ脈をつくろう" : "平均は同じ。違うのはどっち？",
    svg: `${syncRig(mine)}${syncChart(500, 20, 740, 280, CASE_VESSEL_B, mine, j.both)}`,
    html: asked
      ? `<div class="knobs" style="left:1.5%;top:60%;width:34%">${(["r", "c"] as const)
          .map((k) => {
            const s = VESSEL_SLIDERS[k];
            const v = k === "r" ? state.syncR : state.syncC;
            return `<label><span>${s.label}<strong id="v-s${k}">${v.toFixed(2)}</strong></span><input type="range" data-sync="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}" ${state.syncDone ? "disabled" : ""}></label>`;
          })
          .join("")}</div>
        <div class="meters" style="left:39%;top:66%;width:58%;grid-template-columns:1fr 1fr">
          ${meter("平均の圧（送る量が同じなら、出口の流れにくさで決まる）", j.target.mean, j.mine.mean, j.mine.mean - j.target.mean, j.meanOk, "pass", VESSEL_ROBOT_TOL, 30, "", 1).replace("A ", "血管B ").replace("あなた", "あなたの装置")}
          ${meter("高い圧と低い圧の差（主にふくらみやすさで変わる）", j.target.pulse, j.mine.pulse, j.mine.pulse - j.target.pulse, j.pulseOk, "pass", VESSEL_ROBOT_TOL, 30, "", 1).replace("A ", "血管B ").replace("あなた", "あなたの装置")}
        </div>`
      : "",
    who: state.line.who,
    text: state.line.text,
    cmds: !asked
      ? [
          { act: "v-bet", val: "r", label: "血管の出口の流れにくさ", sub: "その先の細い血管へ流れ出しにくい" },
          { act: "v-bet", val: "c", label: "血管のふくらみやすさ", sub: "ふくらんで受け止める量" },
          { act: "v-bet", val: "unknown", label: "まだ分からない", sub: "試験装置で確かめる" },
        ]
      : state.syncDone
        ? [{ act: "rt-enter", val: "vessel", label: "TEJUN を鍛えなおす", sub: "人工血管の検査で見る数字を、あなたが足す", hot: true }]
        : [{ act: "sync-hint", label: "ヒント", ghost: true }],
  };
}

// ---------- 謎4：膜の見落とし（ここで初めて電気の部品を出す：1c-2） ----------
function c4Say(): View {
  const a = REST_MV + deltaMv(BASE_MEM, PULSE_MS);
  const b = REST_MV + deltaMv(CASE3_B, PULSE_MS);
  const lines: [string, string, string, string][] = [
    ["証言 1 / 2", "「止める直前の膜の電圧は", `　A：${mvs(a)} [mV]　　B：${mvs(b)} [mV]`, `　ちがいは、わずか ${Math.abs(b - a).toFixed(2)} [mV]」`],
    ["証言 2 / 2", `「私の手順では、ちがいが ${ROBOT_STEADY_TOL} [mV] より`, "　小さければ「同じ」とみなします。", "　だから、AとBは同じ膜です」"],
  ];
  const [lab, l1, l2, l3] = lines[Math.min(state.say, 1)]!;
  return {
    chap: "謎4 膜の見落とし",
    goal: "膝の動きを脳へ伝える神経の膜の模型。ロボの証言を聞こう",
    svg: `${nerveWhole(16, 16, false)}<g transform="translate(310,224) scale(0.8)">${heartCircuit(0, 0, 1, 1, { src: "電流を送りこむもの＝押されると開く入口", cap: "電気をためる部品＝膜", res: "抵抗＝いつも開いている通り道", bat: "電池＝何もしていないときの −70 mV" })}</g>
      <text x="310" y="190" fill="var(--soft)" font-size="14">膜は本当に電気をためる。電気の部品で書くと、この回路になる。</text><text x="310" y="212" fill="var(--soft)" font-size="14" font-weight="800">mV＝ミリボルト（1000分の1ボルト）</text>${bubble(590, 30, lab, l1, l2, 480, l3)}${robotArt(state.mood, 1080, 160, 0.6)}`,
    who: "bot",
    text: state.line.text,
    cmds: state.say < 2 ? [{ act: "c4-next", label: state.say === 0 ? "次の証言" : "聞き返す", sub: state.say === 0 ? "" : "何を測っていないか、聞き出す", hot: true }] : [{ act: "to-watch4", label: "押して、離す", sub: "押している間だけ、入口から電流が入る", hot: true }],
  };
}
function c4Watch(): View {
  const have = state.evidence.some((e) => e.case === 4 && e.ok);
  return {
    chap: "謎4 膜の見落とし",
    goal: "膜の電圧に違いが見える瞬間を撮ろう",
    svg: state.memTank ? tankStage(BASE_MEM, CASE3_B, state.memT, { a: "膜 A", b: "膜 B" }, 14, state.memChecked) : nerveStage(BASE_MEM, CASE3_B, state.memT, { a: "膜 A", b: "膜 B", revealB: state.memChecked }),
    html: `<div class="scrub narrow" style="left:62.5%;top:0.5%"><button data-act="m-run">▶ 押して、離す</button><button data-act="m-tank">${state.memTank ? "膜の図" : "水槽のたとえ"}</button>
      <label><input type="range" id="mt" min="0" max="${RECORD_MS}" step="1" value="${state.memT}" aria-label="流し始めからの時間"></label><span>${state.memT} ms</span></div>`,
    who: state.line.who,
    text: state.line.text,
    cmds: [
      { act: "m-shot", label: "この瞬間を撮る", sub: `差が ${SEE_DIFF} mV を超えたら証拠`, hot: !have, disabled: !state.memRan },
      { act: "to-present4", label: "ロボに証拠を見せる", disabled: !have, hot: have },
    ],
  };
}
function c4Present(): View {
  const a = REST_MV + deltaMv(BASE_MEM, PULSE_MS);
  const b = REST_MV + deltaMv(CASE3_B, PULSE_MS);
  const base: Evidence = { id: "c4-base", case: 4, title: "ロボの検査", line: "止める直前の膜の電圧", big: `差 ${sgn(b - a, 2)} mV`, ok: false };
  const v = presentView(4, ["「だから、AとBは", "　同じ膜です」"], base, "ロボに、違いが見えた証拠を見せよう");
  if (state.line.who === "bot" && state.mood === "shock") v.cmds = [{ act: "to-why4", label: "なぜ違う？ 推理する", hot: true }];
  return v;
}
function c4Why(): View {
  const cards: { id: "g" | "c"; name: string; look: string }[] = [
    { id: "g", name: "イオンの通りやすさが違う", look: "通り道の多さ（多いほど通りやすい＝抵抗が小さい）が違う。長く流したときの高さが変わるはず" },
    { id: "c", name: "電気のためやすさが違う", look: "膜の電圧を同じだけ上げるのに要る電気の量（水槽なら広さ）が違う。上がり方と戻り方の速さが変わるはず" },
  ];
  const all = cards.every((c) => state.memWhy[c.id]);
  return {
    chap: "謎4 なぜ？",
    goal: state.memChecked ? "膜Bは、電気をためやすい膜" : "二つの説明が、記録と合うか選ぼう",
    svg: `<g transform="translate(0,40) scale(0.62)">${nerveStage(BASE_MEM, CASE3_B, 60, { a: "膜 A", b: "膜 B", revealB: state.memChecked })}</g>
      ${state.memChecked ? `<text x="16" y="370" fill="var(--gold)" font-size="16" font-weight="900">金の＋：同じくらいの電圧でも、膜Bは約${CASE3_B.c}倍の電気をためている＝電気をためやすい</text><text x="16" y="394" fill="var(--soft)" font-size="14">入る電流は同じなので、Bはたまるのに時間がかかり、上がるのも戻るのもゆっくりになる</text>` : `<text x="16" y="370" fill="var(--soft)" font-size="15">膜Bの電気のためやすさと通りやすさは「？」。グラフの形から推理しよう</text>`}`,
    html: `<div class="lineup" style="grid-template-columns:1fr;left:63%;right:2%;top:3%;bottom:3%">${cards
      .map((c) => {
        const tag = state.memWhy[c.id];
        const truthOut = c.id === "g";
        return `<div class="ghost ${state.memChecked && truthOut ? "broken" : ""}" style="--c:${c.id === "g" ? "#7bd88f" : "#4fe0d0"}" role="group">
          <span class="gname">${c.name}</span><span style="font-size:max(11px,1cqw);color:var(--soft)">${c.look}</span>
          ${state.memChecked ? "" : tagButtons("mtag", c.id, tag, false)}
          ${state.memChecked ? (truthOut ? `<span class="res">計算：合わない</span>` : `<span class="res win">正体</span>`) : ""}</div>`;
      })
      .join("")}</div>`,
    who: state.line.who,
    text: state.line.text,
    cmds: state.memChecked ? [{ act: "to-duel4", label: "膜に、仕掛けろ", hot: true }] : [{ act: "m-check", label: "選んだ答えを計算で確かめる", sub: all ? "計算プログラムが確かめる" : `あと ${cards.filter((c) => !state.memWhy[c.id]).length} 枚`, hot: all, disabled: !all }],
  };
}
function c4Duel(): View {
  const round = MEM_ROUNDS[state.round]!;
  const m = { g: state.g, c: state.c };
  const r = judgeMemDuel(round.id, m);
  const show = state.duelPhase !== "design";
  return {
    chap: "謎4 仕掛けろ",
    goal: `ロボの「次の一手」では見本と同じ、別の時刻では違う膜をつくれ（ラウンド${round.id}）`,
    svg: `${membranePatch(12, 6, 0.7, BASE_MEM, "膜 A", "A", true, state.memT || 105)}${membranePatch(12, 154, 0.7, m, "あなたの膜", "B", true, state.memT || 105)}
      ${membraneGraph({ GL: 420, GR: 850, GT: 40, GB: 250 }, BASE_MEM, m, state.memT || 105, { a: "膜 A", b: "あなたの膜", top: 18, notes: false })}
      ${ruleCard(880, 20, "膜の検査の手順", [round.id === 1 ? "① 止める直前の膜の電圧" : "① 上がった高さが半分に戻る時間", `② 差が ${round.id === 1 ? ROBOT_STEADY_TOL + " mV" : HALF_TIME_TOL + " ms"} より小さい → 同じ`], 0, round.id === 2)}`,
    html: `<div class="knobs" style="left:1%;top:62%;width:27%">${(["g", "c"] as const)
      .map((k) => {
        const s = MEM_SLIDERS[k];
        return `<label><span>${s.label}<strong id="v-${k}">見本の ${state[k].toFixed(2)} 倍</strong></span><input type="range" data-knob="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state[k]}" ${state.duelPhase === "judge" ? "disabled" : ""}></label>`;
      })
      .join("")}</div>
      <div class="meters" style="left:30%;top:60%;width:37%">${
        show
          ? meter(`ロボが測る：${round.robotLabel}（差を ${round.id === 1 ? `${ROBOT_STEADY_TOL} mV` : `${HALF_TIME_TOL} ms`} より小さく）`, r.robot.a, r.robot.b, r.robot.diff, r.robot.ok, "pass", round.id === 1 ? ROBOT_STEADY_TOL : HALF_TIME_TOL, 8, round.id === 1 ? " mV" : " ms", 2) +
            meter(`ロボが測らない：${round.hiddenLabel}（差を ${round.id === 1 ? HIDDEN1_NEED : HIDDEN2_NEED} mV より大きく）`, r.hidden.a, r.hidden.b, r.hidden.diff, r.hidden.ok, "hide", round.id === 1 ? HIDDEN1_NEED : HIDDEN2_NEED, 8, " mV", 2)
          : ""
      }</div>`,
    who: state.line.who,
    text: state.line.text,
    extra: state.duelHint ? `<p class="sub">${round.id === 1 ? "ロボが見るのは止める直前の高さだけ。十分長く流したときの高さは通りやすさで決まり、電気のためやすさは、上がり方と戻り方の速さを変える。" : "ロボが見るのは戻る時間だけ。戻るのにかかる時間は「ためやすさ÷通りやすさ」に比例する（ためやすいほど遅く、通りやすいほど速い）。"}${state.duelHint > 1 ? (round.id === 1 ? " 通りやすさは見本のままにして、ためやすさだけ動かすと？（大きすぎると、止める直前までに上がりきらない）" : " ためやすさと通りやすさを、同じ倍だけ（たとえばどちらも2倍に）変えると？") : ""}</p>` : "",
    cmds:
      state.duelPhase === "result" && state.duelCleared
        ? [round.id === 1 ? { act: "mduel-next", label: "ラウンド2へ", hot: true } : { act: "rt-enter", val: "membrane", label: "TEJUN を鍛えなおす", sub: "膜の検査で見る数字を、あなたが足す", hot: true }]
        : [
            { act: "mduel-test", label: "ためしに測る", hot: state.duelPhase === "design" },
            { act: "mduel-go", label: "設計を固定して挑む", hot: state.duelPhase === "test" },
            { act: "duel-hint", label: "ヒント", ghost: true },
          ],
  };
}

// ---------- 検査ロボを鍛えなおす（1c-3。規則を書きなおすのはあなた。確かめは retrain.ts） ----------
const RT_PAGE: Record<RetrainCase, { page: string; chap: string; next: Cmd }> = {
  cartilage: { page: "人工軟骨", chap: "謎2 鍛えなおす", next: { act: "to-m4", label: "謎3：膝へ血液を運ぶ人工血管へ", sub: "軟骨には血管がない。では、血液は？", hot: true } },
  vessel: { page: "人工血管", chap: "謎3 鍛えなおす", next: { act: "to-m5", label: "謎4：膝の感覚を伝える神経の膜へ", sub: "膝が押された感じは、神経で脳へ伝わる", hot: true } },
  membrane: { page: "神経の膜", chap: "謎4 鍛えなおす", next: { act: "to-end", label: "まとめへ", sub: "三つの検査を並べる", hot: true } },
};
function rtTruth() {
  return state.debrief ? { eInf: state.debrief.truth.eInf, e1: state.debrief.truth.e1, tau: state.debrief.truth.tau } : null;
}
function rtPicked(): string {
  const r = state.rt;
  if (r.c === "cartilage") return `${r.tempo}:${r.step}:${r.phase}`;
  return r.c === "vessel" ? VESSEL_POINTS[r.t]!.id : MEMBRANE_POINTS[r.t]!.id;
}
function rtLabel(id: string): string {
  return retrainSpec(state.rt.c).points.find((p) => p.id === id)?.label ?? id;
}
function rtMarks(): { x: number; y: number; label: string }[] {
  const c = state.rt.c;
  if (c === "cartilage") {
    const out = state.duelLog.map((s, i) => {
      const [e1, tau] = s.split(",").map(Number) as [number, number];
      return { x: tau, y: e1 + DUEL_SLIDERS.e1.offset, label: `謎2のあなた（${i + 1}）` };
    });
    const b = rtTruth();
    if (b && b.tau >= 0.4 && b.tau <= 4 && b.e1 >= 0.2 && b.e1 <= 2.2) out.push({ x: b.tau, y: b.e1 + DUEL_SLIDERS.e1.offset, label: "軟骨B" });
    return out;
  }
  if (c === "vessel") return [{ x: CASE_VESSEL_B.c, y: CASE_VESSEL_B.r, label: "血管B" }];
  return [
    ...state.memLog.map((s, i) => {
      const [g, cc] = s.split(",").map(Number) as [number, number];
      return { x: cc, y: g, label: `謎4のあなた（${i + 1}）` };
    }),
    { x: CASE3_B.c, y: CASE3_B.g, label: "膜B" },
  ];
}
function rtView(): View {
  const r = state.rt;
  const sp = retrainSpec(r.c);
  const info = RT_PAGE[r.c];
  const res = judgeRetrain(r.c, r.slots, r.c === "cartilage" ? rtTruth() : null);
  const d = r.c === "membrane" ? 2 : r.c === "vessel" ? 1 : 3;
  const rows = [
    `<text x="20" y="74" fill="var(--paper-ink)" font-size="17" font-weight="900">① ${esc(sp.firstRule)}（いままで）</text>`,
    ...Array.from({ length: RETRAIN_SLOTS }, (_, i) => {
      const id = r.slots[i];
      const bd = id ? res.bDiffs.find((x) => x.id === id) : undefined;
      return `<text x="20" y="${110 + i * 46}" fill="${id ? "var(--paper-ink)" : "var(--paper-soft)"}" font-size="17" font-weight="900">${i === 0 ? "②" : "③"} ${id ? esc(rtLabel(id)) : "まだない（右で選んで足す）"}</text>
        ${bd ? `<text x="44" y="${132 + i * 46}" fill="${bd.seen ? "var(--stamp)" : "var(--paper-soft)"}" font-size="15" font-weight="900">この謎のBとの差 ${sgn(bd.diff, d)}${sp.unit}${bd.seen ? "　→ 見分けられる" : "　→ ちがいが小さすぎる"}</text>` : ""}`;
    }),
  ].join("");
  const ok1 = res.catchesB;
  const ok2 = res.slipCount === 0;
  const badge = (y: number, ok: boolean, text: string) => `<g transform="translate(20,${y})"><rect width="440" height="34" rx="17" fill="${ok ? "color-mix(in srgb, var(--you) 22%, var(--panel))" : "var(--panel)"}" stroke="${ok ? "var(--you)" : "var(--line)"}" stroke-width="2"/><text x="16" y="23" fill="${ok ? "var(--you)" : "var(--soft)"}" font-size="15" font-weight="900">${ok ? "✓" : "・"} ${text}</text></g>`;
  const pick = rtPicked();
  const inSlots = r.slots.includes(pick);
  const picker =
    r.c === "cartilage"
      ? `<div class="row"><span>テンポ</span>${TEMPOS.map((t) => `<button class="${r.tempo === t.id ? "on" : ""}" data-act="rt-tempo" data-val="${t.id}">${t.label}</button>`).join("")}</div>
         <div class="row"><span>何歩目</span>${[0, 11].map((k) => `<button class="${r.step === k ? "on" : ""}" data-act="rt-step" data-val="${k}">${k + 1}歩目</button>`).join("")}</div>
         <div class="row"><span>一歩の中</span>${STEP_PHASES.map((ph) => `<button class="${r.phase === ph ? "on" : ""}" data-act="rt-phase" data-val="${ph}">${PHASE_LABEL[ph]}</button>`).join("")}</div>`
      : `<div class="row"><span>${r.c === "vessel" ? "脈の中の時刻" : "流し始めから"}</span><input type="range" id="rt-t" min="0" max="${(r.c === "vessel" ? VESSEL_POINTS : MEMBRANE_POINTS).length - 1}" step="1" value="${r.t}" ${r.done ? "disabled" : ""} aria-label="足す数字の時刻"></div>`;
  return {
    chap: info.chap,
    goal: r.done ? `${info.page}の検査で見る数字が ${1 + r.slots.length} つになった` : `${info.page}の検査で、ロボが見る数字を足そう（Bを見分け、すり抜けを0に）`,
    svg: `<g transform="translate(16,14)"><rect width="470" height="${100 + RETRAIN_SLOTS * 46}" rx="12" fill="var(--paper)"/>
        <text x="20" y="34" fill="var(--paper-soft)" font-size="15" font-weight="900">TEJUN が${info.page}の検査で見る数字</text>
        ${r.done ? `<g class="pop" transform="translate(356,8) rotate(-8)"><rect width="100" height="34" rx="5" fill="none" stroke="var(--stamp)" stroke-width="3"/><text x="50" y="24" fill="var(--stamp)" font-size="16" font-weight="900" text-anchor="middle">数字 ${1 + r.slots.length} つ</text></g>` : ""}
        ${rows}</g>
      ${badge(222, ok1, ok1 ? "この謎のBを見分けられる" : "この謎のBを、まだ見分けられない")}
      ${badge(262, ok2, ok2 ? "すり抜ける試作品は残らない（つまみの範囲で計算）" : `すり抜ける試作品：${res.slipCount} 通り（地図の赤）`)}
      <text x="540" y="30" fill="var(--ink)" font-size="17" font-weight="900">${r.c === "cartilage" ? "謎2" : r.c === "vessel" ? "謎3の試験装置" : "謎4"}のつまみでつくれる試作品の地図</text>
      ${retrainMap(560, 48, 330, 270, res.cells, rtMarks(), sp.axes)}`,
    html: r.done
      ? ""
      : `<div class="picker" style="left:72%;top:3%;width:26.5%">${picker}
        <div class="row"><span>足す数字</span><b style="color:var(--gold)">${esc(rtLabel(pick))}</b><button class="add" data-act="rt-add" ${inSlots || r.slots.length >= RETRAIN_SLOTS ? "disabled" : ""}>枠に入れる</button></div>
        <div class="row"><span>枠</span>${r.slots.length ? r.slots.map((id, i) => `<span class="slot full">${esc(rtLabel(id))}<button data-act="rt-del" data-val="${i}" aria-label="枠から外す">×</button></span>`).join("") : `<span class="slot">まだない（二つまで足せる）</span>`}</div></div>`,
    who: state.line.who,
    text: state.line.text,
    cmds: r.done
      ? [info.next]
      : [
          { act: "rt-go", label: "この数字で鍛えなおす", sub: r.slots.length ? "計算プログラムが確かめる" : "数字を一つ以上入れる", hot: r.slots.length > 0, disabled: r.slots.length === 0 },
          { act: "rt-hint", label: "ヒント", ghost: true },
        ],
  };
}

// ---------- まとめ ----------
function shareText(): string {
  return ["見立てラボ「検査ロボの見落とし」", ...state.record].join("\n");
}
/** まとめの絵（1c-2）：三つを並べて、同じ部品の組み合わせだったことを見せる */
let endRuns: { v: ReturnType<typeof runNet>; m: ReturnType<typeof runNet> } | null = null;
function endCard(x: number, title: string, sub: string, pic: string, rows: [string, string][], electric: boolean): string {
  return `<g transform="translate(${x},44)"><rect width="404" height="270" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    <text x="16" y="28" fill="var(--ink)" font-size="18" font-weight="900">${title}</text><text x="388" y="28" fill="var(--soft)" font-size="12" text-anchor="end">${sub}</text>
    ${pic}
    ${rows.map(([a, b], k) => `<text x="16" y="${178 + k * 23}" fill="var(--ink)" font-size="14" font-weight="800">${a}</text><text x="388" y="${178 + k * 23}" fill="var(--gold)" font-size="14" font-weight="900" text-anchor="end">${b}</text>`).join("")}
    <text x="16" y="262" fill="${electric ? "var(--you)" : "var(--soft)"}" font-size="14" font-weight="900">${electric ? "本当に電気がたまり、イオンが流れる" : "式の形が同じだけ（電気は流れていない）"}</text></g>`;
}
/** まとめの一行：ロボが見る数字（1c-3）。足した数字の数は記録から */
function endNotebook(): string {
  const n = (c: RetrainCase) => state.rtLog[c]?.length;
  const pages = (["cartilage", "vessel", "membrane"] as const).filter((c) => n(c));
  if (!pages.length) return "ロボの見落とし：最後の値だけ（軟骨・膜）／平均だけ（血管）。見る数字が一つだと、ほかの違いを見落とす。";
  return `TEJUN が見る数字：${pages.map((c) => `${RT_PAGE[c].page}の検査は ${1 + n(c)!} つ`).join("・")}。わからない部品の数だけ、効く数字がいる（いままでの数字が、どの部品をおさえていたかによる）。`;
}
function endView(): View {
  if (!endRuns) endRuns = { v: runNet(PREPARED_NETS[0]!, 120), m: runNet(PREPARED_NETS[1]!, 120) };
  const sv = machineScale(PREPARED_NETS[0]!, [endRuns.v]);
  const sm = machineScale(PREPARED_NETS[1]!, [endRuns.m]);
  return {
    chap: "まとめ",
    goal: "並べてみると、三つとも同じ部品の組み合わせだった",
    svg: `<text x="640" y="30" fill="var(--soft)" font-size="16" font-weight="900" text-anchor="middle">軟骨・血管・神経の膜。ちがう体の部分なのに、同じ部品で組み立てられる</text>
      ${endCard(26, "謎1・2 人工軟骨", "かたさと力", `<g transform="translate(120,40) scale(0.8)">${slsModel({ hl: null })}</g>`, [["ばね", "ためる"], ["ダンパ（ねばり）", "流れにくさ"], ["押す速さ", "送りこむ"]], false)}
      ${endCard(438, "謎3 人工血管", "流れと圧", machine(PREPARED_NETS[0]!, endRuns.v, 30, sv, { x: 10, y: 34, w: 384, h: 130, scale: 0.85 }), [["ふくらむ血管", "ためる"], ["出口の細い管", "流れにくさ"], ["ポンプ（心臓のかわり）", "送りこむ"]], false)}
      ${endCard(850, "謎4 神経の膜", "電気", machine(PREPARED_NETS[1]!, endRuns.m, 40, sm, { x: 10, y: 34, w: 384, h: 130, scale: 0.85 }), [["膜（あぶらの膜）", "ためる"], ["いつも開いている通り道", "流れにくさ"], ["押されると開く入口", "送りこむ"]], true)}
      <g transform="translate(26,326)"><rect width="1228" height="78" rx="14" fill="var(--paper)"/>
        <text x="614" y="32" fill="var(--paper-ink)" font-size="20" font-weight="900" text-anchor="middle">電気の部品で書くと：ためる＝コンデンサ　流れにくさ＝抵抗　送りこむ＝電流を送りこむもの（膜は＋電池 −70 mV）</text>
        <text x="614" y="62" fill="var(--paper-soft)" font-size="15" font-weight="800" text-anchor="middle">膜で本当に電気だった部品が、軟骨や血管の「見立て」にもなる。だから、見立てラボ。</text></g>
      <text x="640" y="438" fill="var(--soft)" font-size="14" text-anchor="middle">${esc(endNotebook())}</text>
      <text x="640" y="462" fill="var(--gold)" font-size="15" font-weight="900" text-anchor="middle">同じ部品で、ほかの臓器も組み立てられる？ → つづきの謎</text>`,
    who: "bot",
    text: state.line.text,
    cmds: [
      { act: "n-enter", label: "つづきの謎へ", sub: "AIが次の謎を組み立てる", hot: true },
      { act: "panel", val: "card", label: "発見カードを開く", sub: "答えを書かない記録も" },
      { act: "restart", label: "別の試作品Bで、最初から", ghost: true },
    ],
  };
}

function titleView(): View {
  return {
    chap: "見立てラボ",
    goal: "同じに見える。でも、測り方を変えると違う。",
    svg: `<g transform="translate(60,24)">
        ${[
          ["謎1 見破れ", "3Dプリントの人工軟骨を、走らせて調べる", "かたさと力"],
          ["謎2 仕掛けろ", "見本と違うのにロボが見分けられない軟骨をつくる", "かたさと力"],
          ["謎3 脈の見落とし", "膝へ血液を運ぶ人工血管", "流れと圧"],
          ["謎4 膜の見落とし", "膝の感覚を脳へ伝える神経の膜", "電気"],
          ["まとめ・つづきの謎", "三つは同じ部品でできていた。AIが次の謎を組み立てる", "見立て"],
        ]
          .map(([c, n, k], i) => `<g transform="translate(0,${14 + i * 62})"><rect width="580" height="54" rx="12" fill="var(--paper)"/><text x="18" y="20" fill="var(--paper-soft)" font-size="13" font-weight="900">${c}</text><text x="18" y="44" fill="var(--paper-ink)" font-size="19" font-weight="900">${n}</text><text x="562" y="44" fill="var(--paper-soft)" font-size="13" font-weight="800" text-anchor="end">${k}</text></g>`)
          .join("")}
      </g>${robotArt("smug", 900, 40, 1)}`,
    who: "bot",
    text: state.line.text,
    cmds: [
      { act: "start", label: "謎1を始める", sub: "人工軟骨の見落とし", hot: true, disabled: state.busy },
      { act: "n-enter", label: "つづきの謎だけ見る", ghost: true },
    ],
  };
}

// ---------- 描画 ----------
// ---------- つづきの謎（1e-4）：AIが組み立て、計算プログラムが確かめた謎を、同じ舞台で ----------
const DIFF_NAME: Record<DiffType, string> = { source: "送りこむもの", store: "ためる部品", chamber: "自分で固くなる部屋", resist: "流れにくさ", valve: "一方通行の戸", battery: "電池" };
const METRIC_NAME = { mean: "1回の平均", max: "いちばん高いところ", min: "いちばん低いところ", plateau: "送り終わる直前", halfTime: "半分に戻るまでの時間", perCycle: "1回で流れた量" } as const;
const nxSourceLabel = () => (state.nx.made?.source === "live" ? "AIがいま組み立てた謎" : "AIが11/5に組み立てた謎（生成の記録）");
function nxChap(): string {
  return `つづきの謎${state.nx.made ? "：" + state.nx.made.spec.title : ""}`;
}
/** 題材の候補ごとに、この場でつくれるか */
function nxTopicCmds(prev: NetPuzzleSpec): Cmd[] {
  return prev.nextTopics.slice(0, 3).map((t) => {
    const rec = recordFor(t, prev);
    const can = state.nx.live || !!rec;
    return { act: "n-topic", val: t, label: t, sub: state.nx.live ? "AIがいま組み立てる" : rec ? "AIが11/5に組み立てた記録" : "この場ではつくれない（AIを使える場所で）", hot: can, disabled: !can };
  });
}
/** 題材の入力欄（題材の名前だけ。20字まで） */
function nxTopicBox(style: string): string {
  return `<form class="topicbox" style="${style}" data-form="nx"><label for="nx-topic">題材を入れる（20字まで）</label>
    <div><input id="nx-topic" type="text" maxlength="20" autocomplete="off" placeholder="例：胃、目の中の水、筋肉" value="${esc(state.nx.input)}" ${state.busy ? "disabled" : ""}>
    <button type="submit" class="cmd" data-act="n-free" ${state.busy ? "disabled" : ""}>この題材で組み立てる</button></div></form>`;
}
function nPick(): View {
  const prev = state.nx.prev;
  const topics = prev.nextTopics.slice(0, 3);
  const guess = (t: string): IconId => iconFor({ ...prev, topic: t, title: t, icon: undefined } as unknown as NetPuzzleSpec);
  return {
    chap: "つづきの謎",
    goal: `「${prev.title}」の続きを、AI（Claude）が組み立てる`,
    svg: `<text x="640" y="40" fill="var(--soft)" font-size="16" font-weight="800" text-anchor="middle">前の謎「${esc(prev.title)}」の結び：${esc(wrapLines(prev.endLine, 40, 1)[0] ?? "")}</text>
      ${topics.map((t, i) => {
        const x = 640 + (i - (topics.length - 1) / 2) * 340;
        return `<g transform="translate(${x},215)"><rect x="-150" y="-140" width="300" height="270" rx="20" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
          <g transform="translate(0,-20) scale(0.62)">${organ(guess(t), 0.5, 0)}</g>
          <text x="0" y="104" fill="var(--ink)" font-size="22" font-weight="900" text-anchor="middle">${esc(t)}</text></g>`;
      }).join("")}
      <text x="640" y="368" fill="var(--soft)" font-size="15" text-anchor="middle">候補は、前の謎でAIが出した題材。下の欄に、調べたい題材を自分で入れてもよい。</text>
      <text x="640" y="390" fill="var(--soft)" font-size="13" text-anchor="middle">${state.nx.live ? "このページでは、あなたの Claude を使って、いま組み立てる。計算プログラムが、本当に動き、本当に解けるかを確かめる。" : "この場ではAIを呼べない。AIが11/5に組み立てた記録がある題材だけつくれる（確かめは、いま計算する）。"}</text>`,
    html: nxTopicBox("left:22%;top:83%;width:56%"),
    who: state.line.who,
    text: state.line.text,
    cmds: [...nxTopicCmds(prev), { act: "to-end-back", label: "まとめに戻る", ghost: true }],
  };
}
function nMake(): View {
  const m = state.nx.made;
  const att = state.nx.attempts[state.nx.attempts.length - 1];
  const spec = (m?.spec ?? (att?.spec as NetPuzzleSpec | undefined)) ?? null;
  const used = new Set<string>(spec && Array.isArray(spec.parts) ? [...spec.parts.map((p) => p.type), ...(spec.nodes ?? []).filter((n) => typeof n.fixed === "number" && n.fixed !== 0).map(() => "battery")] : []);
  const v = m?.verdict ?? att?.verdict;
  const done = !!m && state.nx.shown >= (v?.checks.length ?? 0);
  return {
    chap: "つづきの謎",
    goal: m ? `${nxSourceLabel()}：「${m.spec.title}」` : `「${state.nx.topic}」を組み立て中`,
    svg: `${partsBox(20, 40, used)}
      <text x="170" y="370" fill="${used.size ? "var(--you)" : "var(--soft)"}" font-size="14" font-weight="800" text-anchor="middle">${used.size ? "AIが選んだ部品" : "Claude（AI）が部品を選んでいる…"}</text>
      ${m && state.nx.sc ? machine(m.spec, m.verdict.runA!, 0, state.nx.sc, { x: 336, y: 50, w: 500, h: 300, tag: "AIが組み立てた装置", tagColor: "var(--gold)", scale: 1.15 }) : `<g transform="translate(580,200)"><circle r="60" fill="none" stroke="var(--line)" stroke-width="6" stroke-dasharray="20 14"/><text y="8" fill="var(--soft)" font-size="16" text-anchor="middle">組み立て中</text></g>`}
      ${v ? checkBoard(850, 20, v.checks, state.nx.shown) : ""}
      ${m && done && m.verdict.diff ? `<g transform="translate(586,388)"><text fill="var(--soft)" font-size="13" font-weight="800" text-anchor="middle">前の謎の模型から（計算プログラムが数えた）</text>${wrapLines([...m.verdict.diff.added.map((t) => "＋" + DIFF_NAME[t]), ...m.verdict.diff.removed.map((t) => "−" + DIFF_NAME[t])].join("　"), 20, 3).map((l, i) => `<text y="${24 + i * 22}" fill="var(--you)" font-size="17" font-weight="900" text-anchor="middle">${esc(l)}</text>`).join("")}</g>` : ""}`,
    who: state.line.who,
    text: state.line.text,
    cmds: done
      ? [{ act: "n-movie", label: "はじまりの話を見る", sub: "AIが書いた三つの場面", hot: true }]
      : !state.busy
        ? [{ act: "n-back", label: "題材を選びなおす", ghost: true }]
        : [{ act: "noop", label: "組み立て中…", disabled: true }],
  };
}
function nMovie(): View {
  const m = state.nx.made!;
  return {
    chap: nxChap(),
    goal: `はじまりの話（${nxSourceLabel()}）`,
    svg: nextMovie(m.spec, m.verdict.runA!, m.verdict.robotA!, state.nx.mt, state.nx.sc!),
    who: state.line.who,
    text: state.line.text,
    cmds: state.nx.mplaying
      ? [{ act: "n-mskip", label: "最後まで飛ばす", ghost: true }]
      : [
          { act: "n-watch", label: "試験装置へ", sub: "ロボの話を聞く", hot: true },
          { act: "n-mreplay", label: "もう一度見る", ghost: true },
        ],
  };
}
function nxSeries(which: "a" | "b"): number[] {
  const m = state.nx.made!;
  return probeSeries(which === "a" ? m.verdict.runA! : m.verdict.runB!, m.spec.watch[state.nx.watch]!.probe)!;
}
function nxStage(lit: Set<string>): string {
  const m = state.nx.made!;
  const v = m.verdict;
  const k = state.nx.k;
  const w = m.spec.watch[state.nx.watch]!;
  return `${machine(m.spec, v.runA!, k, state.nx.sc!, { x: 6, y: 0, w: 790, h: 232, tag: "見本A", tagColor: "var(--soft)", lit, scale: 1.3 })}
    <line x1="20" x2="780" y1="236" y2="236" stroke="var(--line)" stroke-dasharray="4 6"/>
    ${machine(m.spec, v.runB!, k, state.nx.sc!, { x: 6, y: 238, w: 790, h: 232, tag: "試作品B", tagColor: "var(--you)", lit, scale: 1.3 })}
    ${lineChart(810, 14, 460, 300, v.runA!.t, nxSeries("a"), nxSeries("b"), k, w.label, unitOf(m.spec, w.probe), m.spec.clock.timeUnit, m.spec.clock.on)}
    <text x="1040" y="338" fill="var(--soft)" font-size="13" text-anchor="middle">${m.spec.clock.kind === "beats" ? "落ち着いた1回分" : "一度送って止めたあと"}・${fmtv(v.runA!.t[k]!)} ${esc(m.spec.clock.timeUnit)}</text>
    <text x="1270" y="470" fill="var(--soft)" font-size="14" font-weight="800" text-anchor="end">${esc(nxSourceLabel())}</text>`;
}
function nWatch(): View {
  const m = state.nx.made!;
  const ev = state.nx.ev;
  return {
    chap: nxChap(),
    goal: ev?.ok ? "見落としを見つけた。正体を開けよう" : "見本AとBを同じ時刻で動かし、違いが見える時刻を証拠に",
    svg: nxStage(new Set()),
    html: `<div class="knobs" style="left:63.5%;top:73%;width:35%"><label><span>時刻を選ぶ<strong>${fmtv(m.verdict.runA!.t[state.nx.k]!)} ${esc(m.spec.clock.timeUnit)}</strong></span><input type="range" data-nt="k" min="0" max="${m.verdict.runA!.t.length - 1}" step="1" value="${state.nx.k}"></label></div>`,
    who: state.line.who,
    text: state.line.text,
    cmds: ev?.ok
      ? [{ act: "n-reveal", label: "正体を開ける", sub: "どの部品が違った？", hot: true }]
      : [
          { act: "n-play", label: state.nx.playing ? "止める" : "動かす", sub: "同じ時刻でAとBを動かす" },
          { act: "n-shot", label: "この時刻を証拠に見せる", sub: "ちがいが大きければ、ロボの見落とし", hot: true },
          ...(m.spec.watch.length > 1 ? [{ act: "n-watchnext", label: "見るものを変える", sub: m.spec.watch[(state.nx.watch + 1) % m.spec.watch.length]!.label, ghost: true }] : []),
        ],
  };
}
function nReveal(): View {
  const m = state.nx.made!;
  const lit = new Set<string>([m.spec.B.part, ...(m.spec.B.compensate ? [m.spec.B.compensate.part] : [])]);
  return {
    chap: nxChap(),
    goal: "正体：赤く光った部品が見本と違った",
    svg: nxStage(lit),
    html: nxTopicBox("left:63.5%;top:74%;width:35%"),
    who: state.line.who,
    text: state.line.text,
    cmds: [...nxTopicCmds(m.spec), { act: "panel", val: "refs", label: "出典と部品の役わり", sub: "文献で知られている模型による", ghost: true }],
  };
}
function nxRefsHtml(): string {
  const m = state.nx.made;
  if (!m) return "<p>まだ謎がありません。</p>";
  const s = m.spec;
  return `<h2>${esc(s.title)}（${esc(nxSourceLabel())}）</h2>
    <p>計算と判定は計算プログラムが確かめた。体の何にあたるかはAIの見立てで、先生の確認前。部品の見立ては出典の文献で知られている模型により、実物を完全に表すものではない。</p>
    <table>${s.parts.map((p) => `<tr><th>${esc(p.name)}</th><td>${esc(p.role)}<br><small>出典：${esc(refById(p.ref)?.cite ?? "—")}</small></td></tr>`).join("")}</table>
    <p><b>見立て：</b>${esc(s.analogy)}</p>
    <p><b>この模型で扱わないこと：</b>${s.outOfScope.map(esc).join("、")}</p>
    ${s.missingParts?.length ? `<p><b>部品箱にないが、本当は要る部品（AIの申告）：</b>${s.missingParts.map(esc).join("、")}</p>` : ""}
    <details><summary>確かめの記録（AIの出力とプログラムの判定）</summary>${state.nx.attempts.map((a, i) => `<p>${i + 1}回目：${a.verdict.ok ? "通った" : "通らなかった"}</p><ul>${a.verdict.checks.map((c) => `<li>${c.ok ? "✓" : "✗"} ${esc(c.label)} ${esc(c.detail)}</li>`).join("")}</ul>`).join("")}</details>`;
}
let nxTimer = 0;
function nxLoop(kind: "movie" | "watch"): void {
  cancelAnimationFrame(nxTimer);
  const s0 = performance.now();
  const t0 = state.nx.mt;
  const k0 = state.nx.k;
  const tick = () => {
    const svg = app.querySelector("svg.st");
    if (kind === "movie") {
      if (!state.nx.mplaying || state.scene !== "n-movie") return;
      state.nx.mt = t0 + (performance.now() - s0) / 1000;
      if (state.nx.mt >= nextMovieLength()) {
        state.nx.mt = nextMovieLength();
        state.nx.mplaying = false;
        render();
        return;
      }
      if (svg) svg.innerHTML = nMovie().svg;
    } else {
      if (!state.nx.playing || state.scene !== "n-watch") return;
      const n = state.nx.made!.verdict.runA!.t.length;
      // 一度送るとき：約6秒で記録を一回り／くり返し：1回を約3秒で
      const per = state.nx.made!.spec.clock.kind === "beats" ? 3000 : 6000;
      state.nx.k = Math.floor(k0 + ((performance.now() - s0) / per) * (n - 1)) % n;
      if (svg) svg.innerHTML = nWatch().svg;
      const lab = app.querySelector<HTMLInputElement>('input[data-nt="k"]');
      if (lab) lab.value = String(state.nx.k);
    }
    nxTimer = requestAnimationFrame(tick);
  };
  tick();
}
async function nxMake(topic: string): Promise<void> {
  state.nx.topic = topic;
  state.nx.made = null;
  state.nx.attempts = [];
  state.nx.shown = 0;
  state.nx.sc = null;
  say("ai", `「${topic}」の謎を組み立てます。前の謎「${state.nx.prev.title}」から、部品を足したり置きかえたりします。`);
  go("n-make");
  state.busy = true;
  render();
  try {
    const { made, attempts } = await makeNext(topic, state.nx.prev, {
      onStatus: (text, who) => {
        say(who, text);
        render();
      },
    });
    state.nx.attempts = attempts;
    if (!made) {
      state.busy = false;
      const last = attempts[attempts.length - 1];
      say("calc", last ? `確かめに通らなかった。${last.verdict.checks.filter((c) => !c.ok).map((c) => c.label).slice(0, 2).join("。")}。題材を選びなおそう。` : "この題材は、この場ではつくれない。");
      render();
      return;
    }
    state.nx.made = made;
    state.nx.sc = machineScale(made.spec, [made.verdict.runA!, made.verdict.runB!]);
    say("calc", "計算プログラムが、組み立てた装置をそのまま計算して確かめる。");
    render();
    const n = made.verdict.checks.length;
    for (let i = 1; i <= n; i++) {
      state.nx.shown = i;
      const svg = app.querySelector("svg.st");
      if (svg) svg.innerHTML = nMake().svg;
      await sleep(reduceMotion() ? 0 : 160);
    }
    state.busy = false;
    say("ai", made.spec.link.story);
  } catch (e) {
    state.busy = false;
    const code = (e as { code?: string }).code;
    say("calc", code === "not_granted" ? "このページから Claude を使うことが許可されなかった。記録のある題材を選ぼう。" : code === "rate_limited" ? "呼び出しが続いた。少し待ってから選びなおそう。" : "Claude との通信がうまくいかなかった。題材を選びなおそう。");
  }
  render();
}

const VIEWS: Record<Scene, () => View> = {
  title: titleView,
  movie: movieView,
  "c1-say": c1Say,
  "c1-run": c1Run,
  "c1-present": c1Present,
  "c1-line": c1Line,
  "c1-solved": c1Solved,
  c2,
  "c2-map": c2Map,
  "c3-say": c3Say,
  "c3-watch": c3Watch,
  "c3-present": c3Present,
  "c3-sync": c3Sync,
  "c4-say": c4Say,
  "c4-watch": c4Watch,
  "c4-present": c4Present,
  "c4-why": c4Why,
  "c4-duel": c4Duel,
  rt: rtView,
  end: endView,
  "n-pick": nPick,
  "n-make": nMake,
  "n-movie": nMovie,
  "n-watch": nWatch,
  "n-reveal": nReveal,
};

function discovery(): string[] {
  const out: string[] = [];
  const ph = state.view?.runPhotos.find((p) => p.distinguishable);
  if (ph) out.push(`謎1：ロボは「一回押して20秒後の力」で区別できなかった。走行テスト（${tempoName(ph.period)}）の${ph.step + 1}歩目に差 ${sgn(ph.diff)} を見つけた`);
  if (state.debrief) out.push(`謎1の正体：${state.debrief.explanation}`);
  if (state.duelLog.length) out.push(`謎2：${state.duelLog.map((s, i) => { const [e1, tau] = s.split(",").map(Number) as [number, number]; return `ラウンド${i + 1}を（着地の瞬間のかたさ ${knobShown("e1", e1)}、かたさが消えるまでの時間 ${knobShown("tau", tau)}）で突破`; }).join("、")}。ロボが測る点だけ見本とそろえた別物は、測る点ごとにつくれた`);
  if (state.syncDone) out.push(`謎3：平均の圧は同じ（${VA.mean.toFixed(1)} mmHg）でも、高い圧と低い圧の差が違った（A ${VA.pulse.toFixed(0)}／B ${VB.pulse.toFixed(0)} mmHg、模型の値）。血管Bは、ふくらみやすさが半分`);
  if (state.memChecked) out.push(`謎4：止める直前の膜の電圧は同じでも、上がり方・戻り方が違った。膜Bは電気のためやすさが ${CASE3_B.c} 倍`);
  for (const c of ["cartilage", "vessel", "membrane"] as const) {
    const l = state.rtLog[c];
    if (l) out.push(`鍛えなおし（${RT_PAGE[c].page}の検査）：いままで見ていた「${retrainSpec(c).firstRule}」に、${l.map((x) => `「${x}」`).join("と")}を足して、すり抜ける試作品をなくした（つまみの範囲で計算）`);
  }
  out.push("まだ言えないこと：教材が決めた式・値の範囲・ぶれの決まりの中での結果。実物の材料・血管・膜の性質を、この模型だけで決めたわけではない");
  return out;
}

function panelHtml(): string {
  if (!state.panel) return "";
  if (state.panel === "notice")
    return `<div class="panel-back" id="panel-back"><div class="panel notice" role="dialog" aria-modal="true" aria-labelledby="notice-h">
      <h2 id="notice-h">はじめる前に</h2>
      <ul>
        <li>ラボ・試作品・検査ロボは架空です。計算でつくった模型で、実在の医療機器・体の値・病気の判定を表しません。</li>
        <li>うまくいかなくても、何度でも試せます。点数や順位はつけません。</li>
        <li>名前などの個人の情報は、入力も保存もしません。</li>
      </ul>
      <div class="row"><button class="cmd hot" data-act="panel-close" autofocus>わかった、はじめる</button></div></div></div>`;
  const body =
    state.panel === "refs"
      ? nxRefsHtml()
      : state.panel === "about"
      ? `<h2>このゲームについて</h2>
      <table><tr><th>検査ロボ TEJUN</th><td>決まった一つの測り方で判定するプログラム（AIではない）。自信ゲージは、あなたが見落としを突くたびに減る（あなたの減点ではない）</td></tr>
      <tr><th>相棒 Claude（AI）</th><td>謎1で参加（使えない場所では休み、上の段に表示しない）。隠れた答えを知らない。あなたと同じ記録だけで考える</td></tr>
      <tr><th>計算プログラム</th><td>教材の計算プログラム（AIではない）が、同じ記録で確かめる</td></tr>
      <tr><th>案内</th><td>あらかじめ書いた決まった文（AIではない）。手がかりも、Claude が休んでいるときは決まった文</td></tr>
      <tr><th>Claude（AI）・謎を組み立てる</th><td>つづきの謎で、次の謎を組み立てる。式と判定は計算プログラムが確かめる</td></tr></table>
      <p>人工軟骨・人工血管・膜は、計算でつくった、本物ではない試作品・模型です。ラボも試作品も架空で、実在の人工関節・人工軟骨・人工血管・医療機器の性能や、体の値・病気の判定を表すものではありません。謎1の記録には測るたびのぶれがあり、謎2〜4はぶれのない計算です。試す回数で減点はしません。氏名などは集めていません。</p>
      <details><summary>先生用の設定</summary><p><label>合言葉 <input type="password" id="t-pass"></label>
        <label id="t-cause-wrap" hidden>隠れた原因 <select id="t-cause"><option value="">ランダム</option><option value="instantUp">押した直後だけ増えるかたさが大きい</option><option value="instantDown">押した直後だけ増えるかたさが小さい</option><option value="relaxSlow">増えたかたさが消えるのが遅い</option><option value="relaxFast">増えたかたさが消えるのが速い</option></select></label>
        <label>乱数の種 <input id="t-seed" inputmode="numeric" size="6"></label> <button class="mini-btn" data-act="start-teacher">先生モードで始める</button></p></details>`
      : `<h2>発見カード（記録から）</h2><ul>${discovery().map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h2>答えを書かない記録</h2><pre>${esc(shareText())}</pre>`;
  return `<div class="panel-back" id="panel-back"><div class="panel" role="dialog" aria-modal="true">${body}
    <div class="row">${state.panel === "card" ? `<button class="cmd ghost" data-act="copy">文字でコピー</button>` : ""}<button class="cmd" data-act="panel-close">閉じる</button></div></div></div>`;
}

let typeToken = 0;
let lastText = "";
function render(): void {
  const v = VIEWS[state.scene]();
  const focusId = (document.activeElement as HTMLElement | null)?.dataset?.act;
  app.innerHTML = `<div class="game"><div class="screen">
    <header class="hud">
      <span class="chap">${esc(v.chap)}</span><span class="goal">${phrase(v.goal)}</span>
      <span class="conf" role="img" aria-label="検査ロボの自信 ${state.conf}">TEJUN の自信<span class="bar"><i style="width:${state.conf}%"></i></span></span>
      ${state.scene.startsWith("n-") ? `<span class="ai">Claude（AI）・謎を組み立てる${state.nx.live ? "" : "（11/5の記録）"}</span>` : state.claude && state.scene.startsWith("c1") ? `<span class="ai">相棒 Claude（AI）</span>` : ""}
      <button class="mini-btn" data-act="sound" aria-pressed="${sound.on}">音 ${sound.on ? "ON" : "OFF"}</button>
      <button class="mini-btn" data-act="panel" data-val="card">発見カード</button>
      <button class="mini-btn" data-act="panel" data-val="about" aria-label="このゲームについて・先生用" title="このゲームについて・先生用">？</button>
    </header>
    <div class="stage ${v.svg ? "" : "flow"}"><svg class="st" viewBox="0 0 1280 480" preserveAspectRatio="xMidYMid meet">${v.svg}</svg>${v.html ?? ""}</div>
    <div class="win">
      <div><span class="who ${v.who}">${WHO_LABEL[v.who]}</span><p class="text ${state.line.rest.length ? "more" : ""}" aria-live="polite" ${state.line.rest.length ? `data-act="more" role="button" tabindex="0"` : ""}>${phrase(v.text)}</p>${state.line.rest.length ? `<p class="next-hint" data-act="more">▼ 続き（窓を押す）</p>` : ""}${v.sub ? `<p class="sub">${phrase(v.sub)}</p>` : ""}${v.extra ?? ""}${state.error ? `<p class="sub" style="color:var(--stamp)">${esc(state.error)}</p>` : ""}</div>
      <div class="cmds ${v.cmds.length >= 3 ? "many" : ""}">${v.cmds
        .map((c) => `<button class="cmd ${c.hot ? "hot" : ""} ${c.ghost ? "ghost" : ""}" data-act="${c.act}" ${c.val !== undefined ? `data-val="${c.val}"` : ""} ${c.disabled ? "disabled" : ""}>${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</button>`)
        .join("")}</div>
    </div>
    ${panelHtml()}
  </div></div>`;
  rollNumbers(app);
  if (focusId) app.querySelector<HTMLElement>(`[data-act="${focusId}"]`)?.focus({ preventScroll: true });
  // メッセージは一文字ずつ（動きを減らす設定では一度に）
  const t = app.querySelector<HTMLElement>(".text");
  if (t && v.text !== lastText && !reduceMotion()) {
    lastText = v.text;
    const token = ++typeToken;
    const full = v.text;
    let i = 0;
    const tick = () => {
      if (token !== typeToken) return;
      const el = app.querySelector<HTMLElement>(".text");
      if (!el) return;
      i = Math.min(full.length, i + 2);
      el.innerHTML = phrase(full.slice(0, i));
      if (i < full.length) setTimeout(tick, 18);
    };
    tick();
  } else lastText = v.text;
}

function go(s: Scene): void {
  state.scene = s;
  state.error = "";
  state.sel = null;
  render();
}

async function guard(fn: () => Promise<void>): Promise<void> {
  state.busy = true;
  state.error = "";
  render();
  try {
    await fn();
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  } finally {
    state.busy = false;
    render();
  }
}

// ---------- 再生 ----------
async function playRun(): Promise<void> {
  const run = currentRun();
  if (!run) return;
  const reduce = reduceMotion();
  state.shown = 0;
  state.note = null;
  const dur = reduce ? 0 : 5200;
  const s0 = performance.now();
  let lastK = -1;
  for (;;) {
    if (state.scene !== "c1-run") break;
    const f = dur === 0 ? 1 : Math.min(1, (performance.now() - s0) / dur);
    const t = f * RUN_T_MAX;
    state.playing = t;
    const k = Math.min(PLAY_RUN_STEPS - 1, Math.floor(t / PLAY_RUN_PERIOD));
    if (k !== lastK && f < 1) {
      beep("step", k);
      lastK = k;
    }
    state.shown = RUN_POINTS.filter((p) => p.t <= t + 1e-9).length;
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS["c1-run"]().svg;
    if (f >= 1) break;
    await sleep(33);
  }
  state.playing = null;
  state.cursor = RUN_T_MAX;
  state.shown = RUN_POINTS.length;
  const hot = RUN_POINTS.filter((p) => Math.abs(pointValue(run.b, p.i) - pointValue(run.a, p.i)) > STEP_TOLERANCE);
  const steps = [...new Set(hot.map((p) => p.k + 1))];
  say("you", hot.length ? `赤い点では、AとBのへこみのちがいが ${STEP_TOLERANCE} より大きい。赤い点を選んで、証拠に保存しよう。` : `どの瞬間も、ちがいは ${STEP_TOLERANCE} より小さい。もう一度走らせてみよう。`);
  state.mood = hot.length ? "sweat" : "smug";
  render();
}

let vTimer = 0;
function vLoop(): void {
  const s0 = performance.now() - (state.u / BEAT_S) * 2500;
  const tick = () => {
    if (!state.vPlaying || (state.scene !== "c3-watch" && state.scene !== "c3-say")) return;
    state.u = (((performance.now() - s0) / 2500) * BEAT_S) % BEAT_S; // 一拍（0.8秒）を2.5秒かけて見せる
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS[state.scene]().svg;
    const sl = app.querySelector<HTMLInputElement>("#u");
    if (sl) sl.value = String(state.u);
    vTimer = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(vTimer);
  tick();
}

async function duelPlay(kind: "c2" | "c4", commit: boolean): Promise<void> {
  const reduce = reduceMotion();
  if (kind === "c2") {
    state.duelPhase = "judge";
    const s0 = performance.now();
    for (;;) {
      if (reduce) break;
      const f = Math.min(1, (performance.now() - s0) / 1600);
      state.c2cursor = f;
      const svg = app.querySelector("svg.st");
      if (svg) svg.innerHTML = VIEWS.c2().svg;
      if (f >= 1) break;
      await sleep(30);
    }
    state.c2cursor = null;
  } else {
    state.duelPhase = "judge";
    for (let t = 0; t <= RECORD_MS && !reduce; t += 8) {
      state.memT = t;
      const svg = app.querySelector("svg.st");
      if (svg) svg.innerHTML = VIEWS["c4-duel"]().svg;
      await sleep(16);
    }
    state.memT = 105;
  }
  state.duelPhase = "test";
  if (!commit) {
    say("you", kind === "c2" ? "ためしに走らせた結果。三つの目盛りを見て、つまみを直そう。" : "テストの結果。二つの目盛りを見て、つまみを直そう。");
    render();
    return;
  }
  const r = kind === "c2" ? judgeDuel(DUEL_ROUNDS[state.round]!, duelMaterial(state.e1, state.tau)) : judgeMemDuel(MEM_ROUNDS[state.round]!.id, { g: state.g, c: state.c });
  state.duelPhase = "result";
  state.duelCleared = r.cleared;
  const hiddenName = kind === "c2" ? (DUEL_ROUNDS[state.round]!.hidden.phase === "land" ? "着地直後" : "足を上げる直前") : MEM_ROUNDS[state.round]!.hiddenLabel;
  if (r.cleared) {
    state.mood = "shock";
    say("bot", "……私の手順では、区別できません。");
    if (kind === "c2") state.duelLog.push(`${state.e1.toFixed(2)}, ${state.tau.toFixed(2)}`);
    else state.memLog.push(`${state.g.toFixed(2)}, ${state.c.toFixed(2)}`);
    state.record.push(`${kind === "c2" ? "謎2 🦵" : "謎4 ⚡"} ラウンド${state.round + 1} すり抜け ✔`);
    render();
    await stamp("すり抜けた！", "win", 0.5);
    await damage(12);
    say("calc", `ロボの点は通過。ロボに見えない違い（${hiddenName}）には差 ${sgn(r.hidden.diff, kind === "c2" ? 3 : 2)}${kind === "c2" ? "" : " mV"} が残っている。`);
  } else {
    state.mood = "smug";
    const reason = !r.robot.ok ? "見つけました。私が測った点に、差があります。" : "私の手順では、区別できません。";
    say("bot", reason);
    render();
    await stamp(!r.robot.ok ? "見つかった" : "違いが残っていない", "miss");
    if (r.robot.ok) say("calc", `ロボは通過。でも、ロボに見えない違い（${hiddenName}）の差が目標に届いていない。${kind === "c2" ? "見本とほぼ同じ試作品" : "見本とほぼ同じ膜"}になっている。`);
  }
  render();
}

// ---------- 操作 ----------
async function startSession(body: Record<string, unknown>): Promise<void> {
  await guard(async () => {
    const r = await api.start(body);
    Object.assign(state, {
      view: r.view,
      debrief: null,
      evidence: [],
      conf: 100,
      say: 0,
      bet: null,
      runId: "",
      shown: 0,
      cursor: 0,
      note: null,
      curveId: "",
      tags: {},
      c1Hit: false,
      round: 0,
      duelLog: [],
      memLog: [],
      rtLog: {},
      record: [],
      syncDone: false,
      brR: 1,
      brC1: 1,
      brDone: false,
      brHint: 0,
      vBet: null,
      memChecked: false,
      memWhy: {},
      panel: null,
    });
    state.mood = "smug";
    const it = r.view.intro;
    introLine = `いつもの検査の結果です。押して20秒後の力は、A：${it.base.toFixed(3)} [N]、B：${it.force.toFixed(3)} [N]。ちがいは、わずか ${Math.abs(it.force - it.base).toFixed(3)} [N]。`;
    say("guide", "はじまりの話：新しい試作品Bができて、検査ロボが調べた。何が起きたのか、見てみよう。");
    state.scene = "movie";
    state.movieId = 1;
    state.movieT = reduceMotion() ? movieLength(1) : 0;
    state.moviePlaying = !reduceMotion();
  });
}

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "nx-topic") {
    state.nx.input = t.value;
    return;
  }
  if (t.id === "t-pass") {
    const w = app.querySelector<HTMLElement>("#t-cause-wrap");
    if (w) w.hidden = t.value.length === 0;
    return;
  }
  if (t.id === "c1-t") {
    state.cursor = Number(t.value);
    state.note = nearestPoint(state.cursor);
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS["c1-run"]().svg;
    const lb = app.querySelector("#c1-t-label");
    if (lb) lb.textContent = pointLabel(state.note);
    const shot = app.querySelector<HTMLButtonElement>('button[data-act="shot"]');
    if (shot) {
      shot.disabled = false;
      shot.classList.add("hot");
      const sub = shot.querySelector("small, .sub");
      if (sub) sub.textContent = pointLabel(state.note);
    }
    return;
  }
  if (t.id === "rt-t") {
    state.rt.t = Number(t.value);
    const b = app.querySelector(".picker .row:nth-child(2) b");
    if (b) b.textContent = rtLabel(rtPicked());
    const add = app.querySelector<HTMLButtonElement>('.picker button[data-act="rt-add"]');
    if (add) add.disabled = state.rt.slots.includes(rtPicked()) || state.rt.slots.length >= RETRAIN_SLOTS;
    return;
  }
  if (t.dataset.knob) {
    const k = t.dataset.knob as "e1" | "tau" | "g" | "c";
    state[k] = Number(t.value);
    state.duelPhase = "design";
    const lab = app.querySelector(`#v-${k}`);
    if (lab) lab.textContent = k === "g" || k === "c" ? `見本の ${state[k].toFixed(2)} 倍` : knobShown(k, state[k]);
    if (state.scene === "c4-duel" || state.scene === "c2") {
      const svg = app.querySelector("svg.st");
      if (svg) svg.innerHTML = VIEWS[state.scene]().svg;
      if (state.scene === "c2") app.querySelector<HTMLButtonElement>('button[data-act="duel-go"]')?.classList.toggle("hot", judgeDuel(DUEL_ROUNDS[state.round]!, duelMaterial(state.e1, state.tau)).cleared);
    }
    // つまみを動かしたら、前のテストの目盛りは古い。テストし直すまで目盛りを隠す
    const meters = app.querySelector(".meters");
    if (meters && (state.scene === "c2" || state.scene === "c4-duel")) {
      const tmp = document.createElement("div");
      tmp.innerHTML = VIEWS[state.scene]().html ?? "";
      const nm = tmp.querySelector(".meters");
      if (nm) meters.innerHTML = nm.innerHTML;
    }
  } else if (t.dataset.nt && state.nx.made) {
    state.nx.k = Number(t.value);
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS[state.scene]().svg;
    const lab = t.closest("label")?.querySelector("strong");
    if (lab) lab.textContent = `${fmtv(state.nx.made.verdict.runA!.t[state.nx.k]!)} ${state.nx.made.spec.clock.timeUnit}`;
  } else if (t.dataset.sync) {
    if (t.dataset.sync === "r") state.syncR = Number(t.value);
    else state.syncC = Number(t.value);
    const j = judgeSync(CASE_VESSEL_B, { r: state.syncR, c: state.syncC });
    if (j.both && !state.syncDone) {
      state.syncDone = true;
      state.mood = "shock";
      say("calc", `重なった。血管Bは、ふくらみやすさ ${state.syncC.toFixed(2)}（見本 1.50）＝見本の半分。ポンプが送る量が同じなので、平均の圧は出口の流れにくさだけで決まり、ロボには同じに見えた。ふくらんで受け止める量はAとBでほぼ同じ。Bはふくらみにくいので、同じ量を受け止めるのに圧が大きく上下する。${state.vBet === "c" ? "予想どおり。" : state.vBet === "r" ? "予想は外れた。ここが発見。" : ""}`);
      state.record.push("謎3 ❤️ 見落とし ✔ 同じ脈 ✔");
      render();
      void stamp("重なった！", "win", 0.5).then(() => damage(12));
      return;
    }
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS["c3-sync"]().svg;
    const meters = app.querySelector(".meters");
    const tmp = document.createElement("div");
    tmp.innerHTML = VIEWS["c3-sync"]().html ?? "";
    const nm = tmp.querySelector(".meters");
    if (meters && nm) meters.innerHTML = nm.innerHTML;
    const lab = app.querySelector(`#v-s${t.dataset.sync}`);
    if (lab) lab.textContent = Number(t.value).toFixed(2);
  } else if (t.id === "u") {
    state.vPlaying = false;
    state.u = Number(t.value);
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS["c3-watch"]().svg;
    const sp = t.parentElement?.nextElementSibling;
    if (sp) sp.textContent = `${state.u.toFixed(2)} 秒`;
  } else if (t.id === "mt") {
    state.memT = Number(t.value);
    const svg = app.querySelector("svg.st");
    if (svg) svg.innerHTML = VIEWS["c4-watch"]().svg;
    const sp = t.parentElement?.nextElementSibling;
    if (sp) sp.textContent = `${state.memT} ms`;
  }
});

// 題材の入力欄：Enter で送ると、ブラウザが「この題材で組み立てる」ボタンを押したことにする（click で処理）。ページは移動させない
app.addEventListener("submit", (e) => e.preventDefault());
app.addEventListener("click", async (e) => {
  const target = e.target as Element;
  if ((target as HTMLElement).id === "panel-back") {
    state.panel = null;
    render();
    return;
  }
  const el = target.closest<HTMLElement>("[data-act]");
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = el.dataset.act!;
  const val = el.dataset.val ?? "";
  const v = state.view;
  beep("tap");
  switch (act) {
    case "more":
      if (state.line.rest.length) state.line = { ...state.line, text: state.line.rest[0]!, rest: state.line.rest.slice(1) };
      render();
      break;
    case "sound":
      sound.on = !sound.on;
      render();
      break;
    case "panel":
      state.panel = val as "about" | "card";
      render();
      break;
    case "panel-close":
      state.panel = null;
      render();
      break;
    case "copy":
      try {
        await navigator.clipboard.writeText(["見立てラボ 発見カード", ...discovery().map((x) => `・${x}`), "", shareText()].join("\n"));
        say("you", "発見カードをコピーした。");
      } catch {
        state.error = "コピーできませんでした。文字を選んでコピーしてください。";
      }
      render();
      break;
    case "start":
      await startSession({});
      if (state.moviePlaying) movieLoop();
      break;
    case "movie-skip":
      state.moviePlaying = false;
      state.movieT = movieLength(state.movieId);
      render();
      break;
    case "movie-replay":
      state.movieT = 0;
      state.moviePlaying = !reduceMotion();
      if (!state.moviePlaying) state.movieT = movieLength(state.movieId);
      render();
      if (state.moviePlaying) movieLoop();
      break;
    case "to-c1say":
      state.moviePlaying = false;
      state.mood = "smug";
      say("bot", introLine);
      go("c1-say");
      break;
    case "start-teacher": {
      const pass = (app.querySelector<HTMLInputElement>("#t-pass")?.value ?? "").trim();
      const cause = app.querySelector<HTMLSelectElement>("#t-cause")?.value || undefined;
      const seed = app.querySelector<HTMLInputElement>("#t-seed")?.value.trim();
      await startSession({ teacherPassphrase: pass, cause, seed: seed ? Number(seed) : undefined });
      if (state.moviePlaying) movieLoop();
      break;
    }
    // 謎1 証言
    case "c1-next":
      state.say++;
      if (state.say === 1) say("bot", "見本と区別できないものは、同じとみなします。それが私の検査の手順です。");
      else {
        state.mood = "calm";
        say("bot", "……一回押して、20秒待っただけです。それで十分でしょう？ 膝の軟骨には、一歩ごとに体重がかかるそうですが。");
      }
      render();
      break;
    case "bet":
      state.bet = val as PredictionChoice;
      say("you", val === "midSame" ? "予想：走っても同じ。確かめよう。" : val === "midDiffer" ? "予想：どこかで違う。走らせて見つけよう。" : "まだ分からない。走らせてから考える。");
      go("c1-run");
      break;
    case "go-run":
      if (!v) return;
      await guard(async () => {
        const r = await api.run(v.sessionId, PLAY_RUN_PERIOD);
        state.view = r.view;
        state.runId = r.runId;
      });
      if (state.runId) {
        say("you", "AとBを、同じように走らせる。");
        await playRun();
      }
      break;
    case "note": {
      const n = Number(val);
      if (n >= state.shown || state.playing !== null) return;
      state.note = n;
      state.cursor = RUN_POINTS[n]!.t;
      render();
      break;
    }
    case "shot": {
      if (!v || state.note === null) return;
      const run = currentRun()!;
      const { k, phase } = RUN_POINTS[state.note]!;
      await guard(async () => {
        state.view = (await api.runPhoto(v.sessionId, run.id, k, phase)).view;
      });
      const p = state.view!.runPhotos.find((x) => x.runId === run.id && x.step === k && x.phase === phase);
      if (p) {
        const id = `run:${run.id}:${k}:${phase}`;
        const where = `${k + 1}歩目の「${PHASE_LABEL[phase]}」`;
        if (!state.evidence.some((x) => x.id === id))
          state.evidence.push({ id, case: 1, title: "走行テスト（走る）", line: `${k + 1}歩目・${PHASE_LABEL[phase]}`, big: `差 ${sgn(p.diff)}`, ok: p.distinguishable });
        say("you", p.distinguishable ? `${where}を証拠ファイルに入れた。ちがい ${Math.abs(p.diff).toFixed(3)} は ${STEP_TOLERANCE} より大きい。` : `${where}を証拠に入れた。でも、ちがい ${Math.abs(p.diff).toFixed(3)} は ${STEP_TOLERANCE} より小さい。`);
        state.note = null;
        render();
        if (p.distinguishable) await stamp("証拠", "win", 0.2);
      }
      break;
    }
    case "to-present":
      state.mood = "smug";
      say("bot", "証言2。だから、AとBは同じ軟骨です。……何か、ありますか？");
      go("c1-present");
      break;
    case "back-watch":
      go(val === "1" ? "c1-run" : val === "3" ? "c3-watch" : "c4-watch");
      break;
    case "sel":
      state.sel = val;
      render();
      break;
    case "present": {
      const c = Number(val) as 1 | 3 | 4;
      const ev = state.evidence.find((x) => x.id === state.sel);
      if (!ev || !ev.ok) {
        state.mood = "smug";
        say("bot", !ev ? "それは私の検査そのものです。違いは写っていませんよ。" : "その瞬間のちがいは小さすぎます。それでは、同じでないとは言えません。");
        render();
        await stamp("その証拠では…", "miss");
        render();
        break;
      }
      state.mood = "shock";
      say(
        "bot",
        c === 1 ? `……ぐっ。${ev.line}は、見ていなかった。私は「一回押して20秒後」しか測らない。` : c === 3 ? "……ぐっ。脈の途中は、見ていなかった。私は「1回の脈の平均」しか測らない。" : `……ぐっ。「${ev.title}」の膜の電圧は、見ていなかった。私は「止める直前」しか測らない。`,
      );
      if (c === 1) {
        state.c1Hit = true;
        state.record.push("謎1 🦵 見落とし ✔");
      }
      render();
      await stamp("見落とし！", "hit", Math.min(1, Math.abs(Number(ev.big.replace(/[^\d.]/g, ""))) * 6));
      await damage(c === 1 ? 15 : 10);
      break;
    }
    case "to-bench":
      if (!v) return;
      state.boardView = v;
      await guard(async () => {
        const r = await api.observeCurve(v.sessionId, 1, crypto.randomUUID(), "unknown", "");
        state.view = r.view;
        state.curveId = r.curveId;
      });
      if (state.curveId) {
        state.tags = {};
        state.mood = "calm";
        say("guide", "試験台でBを押して、押し返す力を記録した（点）。色の線は「この説明が正しければ、こうなるはず」という予想。点と線が重なる説明はどれ？");
        go("c1-line");
      }
      break;
    case "tag": {
      const [id, t] = val.split(":") as [CandidateId, Tag];
      state.tags = { ...state.tags, [id]: t };
      render();
      break;
    }
    case "check": {
      if (!v) return;
      const c = curve()!;
      const outs = (Object.entries(state.tags) as [CandidateId, Tag][]).filter(([, t]) => t === "out").map(([id]) => id);
      const allUnsure = Object.values(state.tags).every((t) => t === "unsure");
      await guard(async () => {
        state.view = (await api.pick(v.sessionId, c.id, allUnsure ? "unsure" : outs)).view;
        state.boardView = null;
      });
      const after = curve()!;
      const same = [...outs].sort().join() === [...after.excluded].sort().join();
      say("calc", `${after.excluded.length ? after.excluded.map((x) => `「${CANDIDATES[x].label}」`).join("") + "は、記録と合わない" : "この記録で合わなくなった説明はない"}。${allUnsure ? "" : same ? "あなたの札と一致。" : "あなたの札と違うところがある。どこを見た？"}`);
      if (after.excluded.length) beep("shatter");
      if (state.view!.overall === "narrowed") {
        state.mood = "shock";
        render();
        await stamp("決着", "win", 0.6);
      } else render();
      break;
    }
    case "words": {
      const input = app.querySelector<HTMLInputElement>("#words");
      if (!input) {
        say("you", "Bがどう違うと思うか、一言で書いてみよう。");
        render();
        const win = app.querySelector(".win > div");
        win?.insertAdjacentHTML("beforeend", `<div class="words"><input id="words" maxlength="200" placeholder="例：Bの方がねばっこい" aria-label="あなたの説明"><button class="choice" data-act="words">近い説明を探す</button></div>`);
        app.querySelector<HTMLInputElement>("#words")?.focus();
        return;
      }
      const text = input.value.trim();
      if (!v || !text) return;
      await guard(async () => {
        const r = await api.words(v.sessionId, text);
        state.view = r.view;
        state.translation = r.translation;
        say(r.translation.source === "claude" ? "cl" : "guide", r.translation.confirmQuestion);
      });
      break;
    }
    case "summon": {
      if (!v) return;
      const id = val as CandidateId;
      await guard(async () => {
        state.view = (await api.confirm(v.sessionId, id)).view;
        state.translation = null;
        state.summoned = id;
        say("you", `「${CANDIDATES[id].label}」の説明を前に出した。記録と合っている？`);
      });
      break;
    }
    case "hint":
      if (!v) return;
      await guard(async () => {
        const r = await api.hint(v.sessionId);
        state.view = r.view;
        state.hint = r.hint;
        say(r.hint.source === "claude" ? "cl" : "guide", r.hint.text);
      });
      break;
    case "push":
      state.nextSpeed = Number(val);
      say("you", `${SPEED[Number(val)]}押す。押し終わった瞬間の高さは、Aと比べてどうなる？`);
      render();
      break;
    case "push-go":
      if (!v || state.nextSpeed === null) return;
      state.boardView = v;
      await guard(async () => {
        const r = await api.observeCurve(v.sessionId, state.nextSpeed!, crypto.randomUUID(), val as PredictionChoice, "");
        state.view = r.view;
        state.curveId = r.curveId;
        state.tags = {};
        state.nextSpeed = null;
        say("guide", "新しい記録。説明の線も、この押し方に合わせ直した。残った説明が合うか選ぼう。");
      });
      break;
    case "reveal":
      if (!v) return;
      await guard(async () => {
        const r = await api.finish(v.sessionId);
        state.view = r.view;
        state.debrief = r.debrief;
      });
      if (state.debrief) {
        state.mood = "down";
        state.record.push("謎1 🔍 4つの説明の見比べ → 正体 ✔");
        say("bot", "私の検査は、20秒後しか見ていなかった。走る人の膝は、20秒も待ってくれないのに。");
        go("c1-solved");
        await damage(10);
      }
      break;
    // 謎2
    case "to-c2":
      state.moviePlaying = false;
      startMovie(2, "はじまりの話：謎1でロボの見落としが分かった。次は、検査を鍛えなおす番。");
      break;
    case "enter-c2":
      state.moviePlaying = false;
      state.round = 0;
      state.e1 = 1;
      state.tau = 1;
      state.duelPhase = "design";
      state.duelHint = 0;
      state.mood = "smug";
      say("bot", DUEL_ROUNDS[0]!.robotLine);
      go("c2");
      break;
    case "duel-test":
      await duelPlay(state.scene === "c2" ? "c2" : "c4", false);
      break;
    case "duel-go":
      await duelPlay("c2", true);
      break;
    case "duel-hint":
      state.duelHint = Math.min(2, state.duelHint + 1);
      render();
      break;
    case "duel-next":
      state.round = 1;
      state.duelPhase = "design";
      state.duelCleared = false;
      state.duelHint = 0;
      state.mood = "smug";
      say("bot", DUEL_ROUNDS[1]!.robotLine);
      render();
      await stamp("見る場所を変えた", "miss");
      break;
    case "to-map":
      state.mood = "down";
      say("guide", "ラウンド1は、着地直後だけ見本と同じ試作品。ラウンド2は、足を上げる直前だけ見本と同じ試作品。どちらもロボは「区別できません」と言った。一つの点しか測らない検査は、その点だけそろえた別物を見落とす。測る点を変えても、また別の別物がつくれる。");
      go("c2-map");
      break;
    // 謎3（血管）
    case "to-m4":
      state.moviePlaying = false;
      startMovie(4, "はじまりの話：軟骨には血管がない。では、膝のまわりへ血液を運ぶ血管は？ 人工血管の試作品Bを、ロボが調べた。");
      break;
    case "enter-c3":
      state.moviePlaying = false;
      state.say = 0;
      state.mood = "smug";
      state.vPlaying = !reduceMotion();
      say("bot", `${state.rtLog.cartilage ? "人工軟骨の検査では、見る数字をあなたに足してもらいました。でも、人工血管の検査では、まだ「1回の脈の平均の圧」しか見ません。" : ""}膝へ血液を運ぶ人工血管のチームの、心臓と血管のまねをした試験装置です。ポンプが1回の脈ごとに液（血液のかわり）を送り、人工血管がふくらんで受け止めます。`);
      go("c3-say");
      vLoop();
      break;
    case "c3-next":
      state.say++;
      say("bot", state.say === 1 ? "平均が同じなら、同じ血管です。それが私の検査の手順です。" : "……1回の脈の平均を測れば十分です。脈の途中まで見る必要はありません。");
      render();
      break;
    case "to-watch3":
      state.vPlaying = false;
      cancelAnimationFrame(vTimer);
      say("you", "1回の脈の途中で止めて、AとBの圧を比べよう。");
      go("c3-watch");
      break;
    case "v-play":
      state.vPlaying = !state.vPlaying;
      render();
      if (state.vPlaying) vLoop();
      break;
    case "v-shot": {
      state.vPlaying = false;
      const u = Math.round(state.u * 100) / 100;
      state.u = u;
      const pa = pressureAt(BASE_VESSEL, u);
      const pb = pressureAt(CASE_VESSEL_B, u);
      const ok = Math.abs(pb - pa) > VESSEL_SEE_DIFF;
      const id = `v:${u}`;
      if (!state.evidence.some((x) => x.id === id)) state.evidence.push({ id, case: 3, title: `脈の中 ${u.toFixed(2)} 秒`, line: `A ${pa.toFixed(0)}／B ${pb.toFixed(0)} mmHg`, big: `差 ${sgn(pb - pa, 1)}`, ok });
      say("you", ok ? `${u.toFixed(2)} 秒の圧：A ${pa.toFixed(0)}、B ${pb.toFixed(0)}。差 ${sgn(pb - pa, 1)}。` : `${u.toFixed(2)} 秒では、差 ${sgn(pb - pa, 1)}。この瞬間では区別できない。`);
      render();
      if (ok) await stamp("証拠", "win", 0.2);
      break;
    }
    case "to-present3":
      state.mood = "smug";
      say("bot", "証言2。だから、AとBは同じ人工血管です。");
      go("c3-present");
      break;
    case "to-sync":
      state.mood = "calm";
      say("you", "平均の圧は同じだった。違うのは、血管の出口の流れにくさ？ それとも血管のふくらみやすさ？");
      go("c3-sync");
      break;
    case "v-bet":
      state.vBet = val as "r" | "c" | "unknown";
      say("guide", "試験装置のつまみは二つ。人工血管のふくらみやすさ（ふくらんで受け止める量）と、出口の流れにくさ（その先の細い管へ流れ出しにくい）。ポンプは、どちらにしても脈ごとに決まった量を送る。つまみで血管Bと同じ脈をつくってみよう。");
      render();
      break;
    case "sync-hint":
      say("guide", "ポンプが送る量が同じなら、平均の圧は出口の流れにくさで決まる（平均の流れ×流れにくさ）。高い圧と低い圧の差は、主にふくらみやすさで変わる。まず平均のメーターを合わせ、次に差のメーター。");
      render();
      break;
    // 謎4（膜）
    case "to-m5":
      state.moviePlaying = false;
      startMovie(5, "はじまりの話：膝が押された感じは、神経で脳へ伝わる。神経の膜は、本当に電気をためる。膜の試作品Bを、ロボが調べた。");
      break;
    case "enter-c4":
      state.moviePlaying = false;
      state.say = 0;
      state.mood = "smug";
      say("bot", `${state.rtLog.vessel ? "人工血管の検査でも、見る数字を足してもらいました。でも、膜の検査では、まだ「止める直前の膜の電圧」しか見ません。" : ""}最後は神経のチーム。膝の動きを脳へ伝える神経の端の膜の模型です。押している100ミリ秒（0.1秒）のあいだ、入口から決まった量の電流が入り、離すと止まります。`);
      go("c4-say");
      break;
    case "c4-next":
      state.say++;
      say("bot", state.say === 1 ? "止める直前の膜の電圧が同じなら、同じ膜です。" : "……止める直前を測れば十分です。止めた後のことは、見ていません。");
      render();
      break;
    case "to-watch4":
      say("guide", "膝が押されると、神経の端の入口が開いて、＋の電気をもつイオンが流れ込む。離すと入口が閉じる。膜のまわりの電気と、膜の電圧のグラフを見比べよう。");
      go("c4-watch");
      break;
    case "m-tank":
      state.memTank = !state.memTank;
      render();
      break;
    case "m-run": {
      const reduce = reduceMotion();
      for (let t = 0; t <= RECORD_MS; t += reduce ? RECORD_MS : 2) {
        state.memT = t;
        const svg = app.querySelector("svg.st");
        if (svg) svg.innerHTML = VIEWS["c4-watch"]().svg;
        const sl = app.querySelector<HTMLInputElement>("#mt");
        if (sl) {
          sl.value = String(t);
          const sp = sl.parentElement?.nextElementSibling;
          if (sp) sp.textContent = `${t} ms`;
        }
        await sleep(20);
      }
      state.memRan = true;
      state.memT = 105;
      render();
      break;
    }
    case "m-shot": {
      const t = state.memT;
      const a = REST_MV + deltaMv(BASE_MEM, t);
      const b = REST_MV + deltaMv(CASE3_B, t);
      const ok = Math.abs(b - a) > SEE_DIFF;
      const id = `m:${t}`;
      if (!state.evidence.some((x) => x.id === id)) state.evidence.push({ id, case: 4, title: t <= PULSE_MS ? `流して ${t} ms` : `止めて ${t - PULSE_MS} ms`, line: `A ${a.toFixed(2).replace("-", "−")}／B ${b.toFixed(2).replace("-", "−")} mV`, big: `差 ${sgn(b - a, 2)}`, ok });
      say("you", ok ? `差 ${sgn(b - a, 2)} mV。証拠に入れた。` : `差 ${sgn(b - a, 2)} mV。この瞬間では区別できない。`);
      render();
      if (ok) await stamp("証拠", "win", 0.2);
      break;
    }
    case "to-present4":
      state.mood = "smug";
      say("bot", "証言2。だから、AとBは同じ膜です。");
      go("c4-present");
      break;
    case "to-why4":
      state.mood = "calm";
      say("you", "止める直前は同じ。違うのは、イオンの通りやすさ？ 電気のためやすさ？ 合うか選ぼう。");
      go("c4-why");
      break;
    case "mtag": {
      const [id, t] = val.split(":") as ["g" | "c", "match" | "out" | "unsure"];
      state.memWhy = { ...state.memWhy, [id]: t };
      render();
      break;
    }
    case "m-check": {
      state.memChecked = true;
      const right = state.memWhy.g === "out" && state.memWhy.c === "match";
      say("calc", `通りやすさだけが違うなら、長く流したときの上がった高さ（電流×抵抗。抵抗＝通りにくさ）が変わるはず。でも記録は、止める直前の高さが同じで、途中の上がり方と戻り方だけが遅い。高さを変えずに速さだけ変わるのは、電気のためやすさのほう（違いは一つだけ、という約束のもとで）。だから「通りやすさ」は合わない。膜Bは電気のためやすさが ${CASE3_B.c} 倍。${right ? "あなたの答えと一致。" : "あなたの答えと違うところがある。"}`);
      state.record.push("謎4 ⚡ 見落とし ✔ 正体 ✔");
      beep("shatter");
      render();
      await stamp("決着", "win", 0.5);
      await damage(10);
      break;
    }
    case "to-duel4":
      state.round = 0;
      state.g = 1;
      state.c = 1;
      state.memT = 105;
      state.duelPhase = "design";
      state.duelCleared = false;
      state.duelHint = 0;
      state.mood = "smug";
      say("bot", MEM_ROUNDS[0]!.robotLine);
      go("c4-duel");
      break;
    case "mduel-test":
      await duelPlay("c4", false);
      break;
    case "mduel-go":
      await duelPlay("c4", true);
      break;
    case "mduel-next":
      state.round = 1;
      state.duelPhase = "design";
      state.duelCleared = false;
      state.duelHint = 0;
      state.mood = "smug";
      say("bot", MEM_ROUNDS[1]!.robotLine);
      render();
      await stamp("見る場所を変えた", "miss");
      break;
    // 検査ロボを鍛えなおす（1c-3）
    case "rt-enter": {
      const c = val as RetrainCase;
      state.rt = { c, slots: [], tempo: "walk", step: 0, phase: "pre", t: c === "vessel" ? 10 : 0, hint: 0, done: false };
      state.mood = "calm";
      say("bot", `私は、決められた数字しか見られません。${RT_PAGE[c].page}の検査で見る数字を、あなたが足してください。いままでの「${retrainSpec(c).firstRule}」に、二つまで足せます。`);
      go("rt");
      break;
    }
    case "rt-tempo":
      state.rt.tempo = val as TempoId;
      render();
      break;
    case "rt-step":
      state.rt.step = Number(val);
      render();
      break;
    case "rt-phase":
      state.rt.phase = val as StepPhase;
      render();
      break;
    case "rt-add": {
      const id = rtPicked();
      if (!state.rt.slots.includes(id) && state.rt.slots.length < RETRAIN_SLOTS) state.rt.slots = [...state.rt.slots, id];
      render();
      break;
    }
    case "rt-del":
      state.rt.slots = state.rt.slots.filter((_, i) => i !== Number(val));
      render();
      break;
    case "rt-hint": {
      const c = state.rt.c;
      state.rt.hint = Math.min(2, state.rt.hint + 1);
      const h = state.rt.hint;
      const text =
        c === "cartilage"
          ? h === 1
            ? "20秒後の力は、押した直後だけ増えるかたさにも、消えていくまでの時間にも、ほとんど左右されない。だから、いままで見ていた数字は、どちらの部品もおさえていない。数字を一つ足すだけでは、赤いますが必ず残る（計算で確かめた）。"
            : "謎2で、ロボはゆっくり歩いた12歩目の「着地した直後」と「足を上げる直前」を、別々のラウンドで見た。あなたは片方ずつならすり抜けられた。両方見たら？ それでもBを見分けられないときは、謎1であなたが見せた証拠のテンポを思い出そう。"
          : c === "vessel"
            ? h === 1
              ? "1回の脈の平均の圧は、ポンプが送る量が同じなら、出口の流れにくさで決まる。だから、いままで見ていた数字で、出口の流れにくさはおさえられている。残る部品は、ふくらみやすさ。それで変わる時刻を一つ足そう。"
              : "ふくらみやすさが違うと、高い圧のころと低い圧のころ（脈のはじまり）が変わる。平均とほとんど同じ圧になる時刻では、差が出にくい。"
            : h === 1
              ? "止める直前の膜の電圧は、イオンの通りやすさで決まる。だから、いままで見ていた数字で、通りやすさはおさえられている。残る部品は、電気のためやすさ。それで変わる時刻を一つ足そう。"
              : "ためやすさが違うと、上がる途中と戻る途中が変わる。流し始めの瞬間や、止めてずっとあとの時刻は、どの膜でも差がほとんどない。";
      say("guide", text);
      render();
      break;
    }
    case "rt-go": {
      const c = state.rt.c;
      const res = judgeRetrain(c, state.rt.slots, c === "cartilage" ? rtTruth() : null);
      if (res.cleared) {
        state.rt.done = true;
        state.rtLog[c] = state.rt.slots.map(rtLabel);
        state.conf = 100;
        state.mood = "smug";
        state.record.push(`鍛えなおし 🛠 ${RT_PAGE[c].page}の検査：見る数字を${state.rt.slots.length}つ足した ✔`);
        say("bot", `これからは、${RT_PAGE[c].page}の検査で、数字を ${1 + state.rt.slots.length} つ見ます。このつまみの範囲の試作品なら、もう見落としません。……ただし、違いうる部品が二つの範囲での話です。部品が三つ違えば、また数字を足す必要があります。`);
        render();
        await stamp("鍛えなおした！", "win", 0.5);
      } else {
        state.mood = "calm";
        const why = [!res.catchesB ? "足した数字では、この謎のBとのちがいが小さすぎる。まだBを見分けられない。" : "", res.slipCount ? `地図の赤います ${res.slipCount} 通りの試作品が、この数字ではロボをすり抜ける。` : ""].join("");
        say("calc", `${why}数字を選びなおそう。`);
        render();
        await stamp("まだ見落とす", "miss");
      }
      break;
    }
    case "to-end":
      state.mood = "down";
      say("bot", "三つの検査で、見る数字を足してもらいました。でも、私は教わった数字しか見られません。新しい試作品の検査は、また数字一つから始まります。");
      go("end");
      break;
    case "n-enter":
      state.nx.live = !!(await getSample());
      state.nx.prev = PREPARED_NETS[1]!;
      state.conf = 100;
      state.mood = "smug";
      say("bot", "新しい試作品の検査では、まだ数字を一つしか見ません。その数字で区別できなければ、同じとみなします。");
      go("n-pick");
      break;
    case "to-end-back":
      go("end");
      break;
    case "n-back":
      go("n-pick");
      break;
    case "n-free": {
      const t = state.nx.input.trim();
      const problem = topicProblem(t);
      if (problem) {
        say("guide", problem);
        render();
        break;
      }
      const prev = state.scene === "n-reveal" && state.nx.made ? state.nx.made.spec : state.nx.prev;
      if (!state.nx.live && !recordFor(t, prev)) {
        say("guide", `この場ではAIを呼べないので、記録にない題材「${t}」はつくれない。候補のボタンから選ぼう。公開ページで開くと、あなたの Claude で、入れた題材をその場で組み立てられる。`);
        render();
        break;
      }
      if (state.scene === "n-reveal" && state.nx.made) {
        state.nx.prev = state.nx.made.spec;
        state.conf = 100;
      }
      await nxMake(t);
      break;
    }
    case "n-topic":
      if (state.scene === "n-reveal" && state.nx.made) {
        state.nx.prev = state.nx.made.spec;
        state.conf = 100;
      }
      await nxMake(val);
      break;
    case "n-movie":
      state.nx.mt = reduceMotion() ? nextMovieLength() : 0;
      state.nx.mplaying = !reduceMotion();
      say("ai", "はじまりの話（AIが書いた三つの場面。絵は、AIが組み立てた模型を計算プログラムが動かしたもの）。");
      go("n-movie");
      if (state.nx.mplaying) nxLoop("movie");
      break;
    case "n-mskip":
      state.nx.mplaying = false;
      state.nx.mt = nextMovieLength();
      render();
      break;
    case "n-mreplay":
      state.nx.mt = 0;
      state.nx.mplaying = !reduceMotion();
      if (!state.nx.mplaying) state.nx.mt = nextMovieLength();
      render();
      if (state.nx.mplaying) nxLoop("movie");
      break;
    case "n-watch": {
      const m = state.nx.made!;
      state.nx.k = 0;
      state.nx.watch = 0;
      state.nx.ev = null;
      state.nx.revealed = false;
      state.nx.playing = false;
      state.mood = "smug";
      const r = m.spec.robot;
      const unit = r.metric === "halfTime" ? m.spec.clock.timeUnit : r.metric === "perCycle" ? m.spec.units.amount.unit : unitOf(m.spec, r.probe);
      say("bot", `${r.says} ${METRIC_NAME[r.metric]}は、見本A ${fmtv(m.verdict.robotA!)}、試作品B ${fmtv(m.verdict.robotB!)} ${unit}。区別できません。`);
      go("n-watch");
      break;
    }
    case "n-play":
      state.nx.playing = !state.nx.playing;
      render();
      if (state.nx.playing) nxLoop("watch");
      break;
    case "n-watchnext":
      state.nx.watch = (state.nx.watch + 1) % state.nx.made!.spec.watch.length;
      render();
      break;
    case "n-shot": {
      const m = state.nx.made!;
      const a = nxSeries("a");
      const b = nxSeries("b");
      const tol = SEE_REL * Math.max(1e-12, Math.max(...a) - Math.min(...a));
      const d = b[state.nx.k]! - a[state.nx.k]!;
      const ok = Math.abs(d) >= tol;
      const w = m.spec.watch[state.nx.watch]!;
      state.nx.ev = { ok, t: m.verdict.runA!.t[state.nx.k]!, d, label: w.label };
      state.nx.playing = false;
      if (ok) {
        state.mood = "shock";
        say("calc", `${w.label}、${fmtv(state.nx.ev.t)} ${m.spec.clock.timeUnit}で、ちがい ${fmtv(Math.abs(d))} ${unitOf(m.spec, w.probe)}。${fmtv(tol)} より大きい。ロボの一つの数字では、ここを見落としていた。`);
        render();
        await stamp("見落とし！", "hit");
        await damage(34);
      } else {
        say("calc", `この時刻では、ちがい ${fmtv(Math.abs(d))}。${fmtv(tol)} より小さく、見分けられない。別の時刻か、別の見るものを試そう。`);
        render();
      }
      break;
    }
    case "n-reveal": {
      const m = state.nx.made!;
      state.nx.revealed = true;
      state.mood = "down";
      const bp = m.spec.parts.find((p) => p.id === m.spec.B.part)!;
      const cp = m.spec.B.compensate ? m.spec.parts.find((p) => p.id === m.spec.B.compensate!.part) : undefined;
      say("ai", `${m.spec.B.reveal}${cp ? `（ロボの数字がそろうように、計算プログラムが「${cp.name}」を見本の ${fmtv(m.verdict.compensateFactor ?? 1)} 倍に合わせた。）` : ""} 違った部品：${bp.name}。`);
      state.record.push(`つづきの謎「${m.spec.title}」（${m.source === "live" ? "AIがいま組み立てた" : "AIが11/5に組み立てた記録"}）見落とし ✔`);
      go("n-reveal");
      break;
    }
    case "noop":
      break;
    case "restart":
      state.scene = "title";
      state.view = null;
      state.conf = 100;
      say("bot", "新しい試作品が届きました。私の検査で区別できなければ、同じとみなします。");
      render();
      break;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.panel) {
    state.panel = null;
    render();
  }
});

say("bot", "私はTEJUN。試作品の検査ロボです。決まった手順で測り、見本と区別できなければ、同じとみなします。");
// 鍛えなおしの場面から始める（#rt-vessel・#rt-membrane。確認用。軟骨は謎1で開けたBが要るので、この入口はない）
if (location.hash === "#rt-vessel" || location.hash === "#rt-membrane") {
  const c = location.hash.slice(4) as RetrainCase;
  state.rt = { c, slots: [], tempo: "walk", step: 0, phase: "pre", t: c === "vessel" ? 10 : 0, hint: 0, done: false };
  state.panel = null;
  say("bot", `私は、決められた数字しか見られません。${RT_PAGE[c].page}の検査で見る数字を、あなたが足してください。いままでの「${retrainSpec(c).firstRule}」に、二つまで足せます。`);
  state.scene = "rt";
}
// 「つづきの謎」から始める（#next。発表・確認用。謎1〜5を解かずに入れるが、記録には残らない）
if (location.hash === "#next") {
  void (async () => {
    state.nx.live = !!(await getSample());
    say("bot", "新しい題材でも同じです。私の決まった手順で区別できなければ、同じとみなします。");
    state.scene = "n-pick";
    render();
  })();
}
status().then((s) => {
  state.claude = s.claude;
  render();
});
render();
void shake;
