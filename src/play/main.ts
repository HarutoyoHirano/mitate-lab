// 見立てラボ「検査ロボとの対決」（新しい画面）。一画面の舞台・メッセージ窓・コマンド。
// 謎1はサーバーのセッション（隠れた試料B・誤差つきの記録・比較器・Claude）を使う。
// 謎2〜4は公開の式だけの計算（誤差なし。謎3の血管B・謎4の膜Bは固定例）。検査ロボは定型ルールで動き、AIではない。
import "./play.css";
import { api, status, type Debrief, type Hint, type PredictionChoice, type PublicSessionView, type Translation } from "../api.js";
import { CANDIDATES, type CandidateId } from "../../server/model/public.js";
import { compare } from "../../server/model/comparator.js";
import { fitCandidate, predictedCurve } from "../../server/model/fit.js";
import { trueCurve } from "../curve.js";
import { BASE } from "../../server/model/public.js";
import { clampPeriod, STEP_PHASES, STEP_TOLERANCE, TAP_TO_PERIOD, TEMPOS, type StepPhase } from "../../server/model/steps.js";
import { DUEL_PERIOD, DUEL_ROUNDS, DUEL_SLIDERS, duelMaterial, duelSteps, HIDDEN_NEED, judgeDuel, ROBOT_PASS } from "../../server/model/duel.js";
import { BASE_VESSEL, BEAT_S, CASE_VESSEL_B, judgeSync, pressureAt, pumpFlow, summarize, VESSEL_ROBOT_TOL, VESSEL_SEE_DIFF, VESSEL_SLIDERS } from "../../server/model/vessel.js";
import { BASE_MEM, CASE3_B, deltaMv, HALF_TIME_TOL, HIDDEN1_NEED, HIDDEN2_NEED, judgeMemDuel, MEM_ROUNDS, MEM_SLIDERS, PULSE_MS, RECORD_MS, REST_MV, ROBOT_STEADY_TOL, SEE_DIFF } from "../../server/model/membraneGame.js";
import { answerMap, beatChart, beatLane, bubble, ghostPuck, heartCircuit, legsStage, loopStage, miniGraph, membraneGraph, membranePatch, nerveStage, nerveWhole, robotArt, introMovie, movieLength, type MovieId, slsModel, slsModelLabeled, ruleCard, syncChart, tankStage, type Mood } from "./art.js";
import { beep, floatDamage, reduceMotion, rollNumbers, shake, sleep, sound, stamp } from "./fx.js";

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
  | "end";
type Who = "bot" | "you" | "cl" | "calc" | "guide";
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
const WHO_LABEL: Record<Who, string> = { bot: "TEJUN-07（決まったルールで動く・AIではない）", you: "あなた", cl: "相棒 Claude（AI）・答えを知らない", calc: "検算（計算プログラム）", guide: "案内・手がかり（決まった文。AIではない）" };

const state = {
  scene: "title" as Scene,
  claude: false,
  busy: false,
  error: "",
  conf: 100,
  mood: "smug" as Mood,
  panel: null as null | "about" | "card",
  line: { who: "bot" as Who, text: "", rest: [] as string[] },
  view: null as PublicSessionView | null,
  debrief: null as Debrief | null,
  evidence: [] as Evidence[],
  sel: null as string | null,
  // 謎1
  say: 0,
  bet: null as PredictionChoice | null,
  period: 3,
  taps: [] as number[],
  runId: "",
  shown: 0,
  playing: null as number | null,
  dents: { a: 0.6, b: 0.6, contact: false, impact: false },
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
  dd: null as null | { a: number; b: number; contact: boolean; impact: boolean },
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const mvs = (v: number) => v.toFixed(1).replace("-", "−");
const sgn = (x: number, d = 3) => {
  const s = Math.abs(x).toFixed(d);
  return `${Number(s) === 0 ? "±" : x > 0 ? "+" : "−"}${s}`;
};
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
  2: { chap: "謎2 仕掛けろ", goal: "はじまりの話：検査を鍛えなおす", go: "enter-c2", label: "設計台へ", sub: "ロボの検査規則を見る" },
  3: { chap: "謎3 脈の見落とし", goal: "はじまりの話：人工血管と検査ロボ", go: "enter-c3", label: "試験装置へ", sub: "ロボの話を聞く" },
  4: { chap: "謎4 膜の見落とし", goal: "はじまりの話：神経の端の膜と検査ロボ", go: "enter-c4", label: "膜の実験台へ", sub: "ロボの話を聞く" },
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
  const lines: [string, string, string][] = [
    ["証言 1 / 2", `「20秒後の力は、A ${r.base.toFixed(3)}・B ${r.force.toFixed(3)}」`, `「差 ${sgn(r.diff)}。『同じ』の幅 ±${r.tolerance} の内側」`],
    ["証言 2 / 2", "「だから、AとBは", "　同じ軟骨です」"],
  ];
  const [lab, l1, l2] = lines[Math.min(state.say, 1)]!;
  const asked = state.say >= 2;
  return {
    chap: "謎1 見破れ",
    goal: "ロボの証言を聞き、確かめ方を考えよう",
    svg: `${ruleCard(40, 40, "検査規則 第1版", ["① 1秒かけて押しこみ、止める", "② 20秒待つ", "③ 押し返す力を読む", "④ 差 ±0.03 以内 → 同じ"], null, false)}
      ${bubble(370, 70, lab, l1, l2, 500)}${robotArt(state.mood, 960, 40, 0.95)}<text x="40" y="270" fill="var(--soft)" font-size="15">力の数字は、見本Aが落ち着いたときの力を1とした数</text>`,
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
function stepMax(run: NonNullable<ReturnType<typeof currentRun>>, k: number): { phase: StepPhase; diff: number } {
  let best: { phase: StepPhase; diff: number } = { phase: "land", diff: 0 };
  for (const ph of STEP_PHASES) {
    const d = run.b[k]![ph] - run.a[k]![ph];
    if (Math.abs(d) > Math.abs(best.diff)) best = { phase: ph, diff: d };
  }
  return best;
}
function tempoName(p: number): string {
  let best = TEMPOS[0]!;
  for (const t of TEMPOS) if (Math.abs(Math.log(t.period / p)) < Math.abs(Math.log(best.period / p))) best = t;
  return Math.abs(best.period - p) < 1e-9 ? best.label : `${best.label}に近い`;
}

function c1Run(): View {
  const run = currentRun();
  const v = state.view!;
  const notes = Array.from({ length: 12 }, (_, k) => {
    const shown = !!run && k < state.shown;
    const m = run && shown ? stepMax(run, k) : null;
    return { shown, hot: !!m && Math.abs(m.diff) > STEP_TOLERANCE, sel: state.note === k, shot: !!run && v.runPhotos.some((p) => p.runId === run.id && p.step === k) };
  });
  const sel = run && state.note !== null ? stepMax(run, state.note) : null;
  const diff = state.playing !== null ? state.dents.b - state.dents.a : sel ? sel.diff : null;
  const have = state.evidence.some((e) => e.case === 1 && e.id.startsWith("run"));
  return {
    chap: "謎1 見破れ",
    goal: run ? "赤く光った一歩を押して、証拠にしよう" : "テンポを決めて、12歩走らせよう",
    svg: `${beatLane(60, 16, notes, state.playing)}
      ${legsStage({ dentA: state.dents.a, dentB: state.dents.b, contact: state.dents.contact, impact: state.dents.impact, labelA: "見本 A（計算した値）", labelB: "軟骨 B（測った値・測るたびに ±0.01 ぶれる）", diff, hot: diff !== null && Math.abs(diff) > STEP_TOLERANCE, y0: 30, scale: 0.92 })}`,
    html: `<div class="tempo">
      ${TEMPOS.map((t) => {
        const runs = v.runs.filter((r) => Math.abs(r.period - t.period) < 1e-9);
        const best = runs.length ? Math.max(...runs.flatMap((r) => r.b.map((_, k) => Math.abs(stepMax(r, k).diff)))) : null;
        return `<button class="${Math.abs(state.period - t.period) < 1e-9 ? "on" : ""}" data-act="tempo" data-val="${t.period}" ${state.playing !== null ? "disabled" : ""}><span>${t.label}</span>${best !== null ? `<i class="tbar" style="width:${Math.min(100, (best / 0.2) * 100).toFixed(0)}%;background:${best > STEP_TOLERANCE ? "var(--stamp)" : "var(--you)"}"></i><small>いちばん大きい差 ${best.toFixed(3)}</small>` : "<small>まだ走らせていない</small>"}</button>`;
      }).join("")}
      <button class="drum" data-act="tap" ${state.playing !== null ? "disabled" : ""}>叩いて<br>決める</button>
    </div>`,
    who: state.line.who,
    text: state.line.text,
    sub: `いまのテンポ：${tempoName(state.period)}（一歩 ${state.period.toFixed(2)} 秒。計算の中の時間で、本当の歩く速さとは合わせていない）。数字＝へこみ（軟骨が押されてうすくなった量。試験台で押しこむ深さを1としたときの割合）。赤い丸＝AとBの差が「同じ」とみなす幅 ${STEP_TOLERANCE} を超えた一歩。`,
    cmds: [
      { act: "go-run", label: run ? "もう一度走らせる" : "12歩、走らせる", sub: "テンポを変えてもよい", hot: !run, disabled: state.playing !== null || state.busy },
      { act: "shot", label: "この一歩を証拠に", sub: state.note !== null ? `${state.note + 1}歩目（差がいちばん大きい点）` : "拍を押して選ぶ", hot: state.note !== null, disabled: state.note === null || state.busy },
      { act: "to-present", label: "ロボに証拠を見せる", sub: "証拠ファイルを開く", disabled: !have, hot: have && state.note === null },
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
      cmds: [{ act: "to-bench", label: "なぜ違う？ 試験台で調べる", sub: "押し返す力を記録して、説明ごとの予想の線（影武者）と見比べる", hot: true, disabled: state.busy }],
    };
  return presentView(1, ["「だから、AとBは", "　同じ軟骨です」"], base, "ロボに、違いが見えた証拠を見せよう");
}

// ---------- 謎1：影武者の面通し ----------
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
      const res = prevOut ? `<span class="res">前の記録で合わない</span>` : outNow ? `<span class="res">検算：合わない</span>` : back ? `<span class="res back">検算：実は記録と合う</span>` : narrowed && v.narrowedTo === id ? `<span class="res win">正体</span>` : "";
      return `<button class="ghost ${broken ? "broken" : ""} ${state.summoned === id ? "summoned" : ""}" style="--c:${COLOR[id]}" data-act="tag" data-val="${id}" ${!awaiting || prevOut ? "disabled" : ""} aria-label="影武者：${CANDIDATES[id].label}">
        <span class="gname">${CANDIDATES[id].label}</span>
        <span class="glook">${LOOK[id]}</span>
        ${broken ? ghostPuck(COLOR[id], true) : `<svg viewBox="0 0 200 110" class="model" aria-hidden="true">${slsModel({ hl: id === "same" ? null : id, color: COLOR[id], mark: "？" })}</svg>`}
        <span class="gpart">${PART[id]}</span>
        ${fit ? miniGraph({ b: c.b, line: predictedCurve(fit.params, c.pushSeconds), lineColor: COLOR[id], a: trueCurve(BASE, c.pushSeconds), push: c.pushSeconds, yMax, w: 240, h: 170 }) : ""}
        <span class="tag ${tag ?? ""}">${tag === "match" ? "合う" : tag === "out" ? "合わない" : tag === "unsure" ? "分からない" : "札をつける"}</span>
        ${res}
      </button>`;
    })
    .join("");
  const cmds: Cmd[] = awaiting
    ? [
        { act: "check", label: "札をつけた影武者を検算する", sub: allTagged ? "計算プログラムがまとめて確かめる" : `あと ${live.filter((id) => !state.tags[id]).length} 体`, hot: allTagged, disabled: !allTagged || state.busy },
        { act: "words", label: state.claude ? "相棒（Claude）に相談" : "あなたの言葉に近い影武者を探す", sub: "あなたの言葉から影武者を呼ぶ", ghost: true },
        { act: "hint", label: state.claude ? "相棒に、見どころを聞く" : "手がかりを見る", ghost: true, disabled: v.hintsLeft <= 0 || state.busy },
      ]
    : narrowed
      ? [{ act: "reveal", label: "正体を開ける", hot: true, disabled: state.busy }]
      : [
          ...([0.2, 1, 5] as const).map((p) => ({ act: "push", val: String(p), label: `${SPEED[p]}押す`, sub: p === state.nextSpeed ? "押し終わった瞬間の高さを予想してから" : "", hot: state.nextSpeed === p })),
        ];
  return {
    chap: "謎1 なぜ？",
    goal: awaiting ? `${SPEED[c.pushSeconds]}押した記録。影武者すべてに札をつけたら、検算できる` : narrowed ? "正体が一つに絞れた" : "まだ影武者が残る。別の速さで押そう",
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
  return {
    chap: "謎1 解決",
    goal: "Bの正体が分かった",
    svg: `${robotArt("down", 1000, 80, 0.75)}
      <g transform="translate(40,40)"><rect width="920" height="330" rx="18" fill="var(--paper)"/>
        <text x="30" y="46" fill="var(--paper-soft)" font-size="18" font-weight="900">正体（答え合わせ）</text>
        <foreignObject x="30" y="64" width="370" height="250"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#2a2216;font-size:21px;font-weight:800;line-height:1.6">${esc(d.explanation)}</div></foreignObject>
        <text x="430" y="46" fill="var(--paper-soft)" font-size="15" font-weight="900">人工軟骨を、ばねとダンパの模型に見立てると</text>
        ${slsModelLabeled(430, 70, state.view?.narrowedTo === "instant" || state.view?.narrowedTo === "relax" || state.view?.narrowedTo === "overall" ? state.view.narrowedTo : null, "Bは、光った部品が見本と違った")}</g>`,
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

function c2(): View {
  const round = DUEL_ROUNDS[state.round]!;
  const p = duelMaterial(state.e1, state.tau);
  const r = judgeDuel(round, p);
  const show = state.duelPhase !== "design";
  const k = 11;
  const a = duelSteps(BASE)[k]!;
  const b = duelSteps(p)[k]!;
  const ph = round.robot.phase;
  return {
    chap: "謎2 仕掛けろ",
    goal: `ロボの「次の一手」をすり抜け、別の点に違いを残す試作品をつくれ（ラウンド${round.id}）`,
    svg: `${ruleCard(30, 20, round.id === 1 ? "検査規則 第2版（走行検査を追加）" : "検査規則 第3版", ["① ゆっくり歩かせる（12歩）", `② 12歩目の${ph === "land" ? "着地直後" : "足を上げる直前"}を測る`, `③ 差 ±${ROBOT_PASS} 以内 → 同じ`, "④ 20秒後の力も見る"], 1, round.id === 2)}
      <g transform="translate(330,22)"><rect width="470" height="56" rx="28" fill="color-mix(in srgb, var(--bot) 18%, var(--panel))" stroke="var(--bot)" stroke-width="3"/>
        <circle cx="30" cy="28" r="16" fill="var(--bot)"/><circle cx="30" cy="28" r="6" fill="var(--panel)"/>
        <text x="58" y="36" fill="var(--bot)" font-size="19" font-weight="900">次の一手：${ph === "land" ? "着地直後（体重がかかった直後）" : "足を上げる直前（体重が抜ける直前）"}</text></g>
      ${legsStage(state.dd ? { dentA: state.dd.a, dentB: state.dd.b, contact: state.dd.contact, impact: state.dd.impact, labelA: "見本 A", labelB: "あなたの試作", diff: null, hot: false, x0: 300, y0: 110, scale: 0.62 } : { dentA: show ? (ph === "land" ? a.land : a.peak) : 0.6, dentB: show ? (ph === "land" ? b.land : b.peak) : 0.6, contact: show, impact: false, labelA: "見本 A", labelB: "あなたの試作", diff: show ? r.robot.diff : null, hot: show && !r.robot.ok, x0: 300, y0: 110, scale: 0.62 })}`,
    html: `<div class="knobs" style="left:1.5%;bottom:3%;width:25%">
        ${(["e1", "tau"] as const)
          .map((key) => {
            const s = DUEL_SLIDERS[key];
            return `<label><span>${s.label}<strong id="v-${key}">${state[key].toFixed(2)}</strong></span><input type="range" data-knob="${key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state[key]}" ${state.duelPhase === "judge" ? "disabled" : ""}></label>`;
          })
          .join("")}
        <span style="color:var(--soft);font-size:max(10px,0.9cqw)">待ったあとも残るかたさは1に固定。見本Aは二つとも1.00</span>
      </div>
      <div class="meters" style="right:1.5%;top:3%;width:28%">${
        show
          ? meter(`ロボが見る点（${ph === "land" ? "着地直後" : "足を上げる直前"}）：差を ${ROBOT_PASS} 以内に`, r.robot.a, r.robot.b, r.robot.diff, r.robot.ok, "pass", ROBOT_PASS, 0.3, "", 4) +
            meter(`ロボに見えない違い（${round.hidden.phase === "land" ? "着地直後" : "足を上げる直前"}）：差を ${HIDDEN_NEED} 以上に`, r.hidden.a, r.hidden.b, r.hidden.diff, r.hidden.ok, "hide", HIDDEN_NEED, 0.3, "", 4) +
            meter("第1版の検査（1秒かけて押し、20秒後の力）：差を 0.03 以内に", r.final.a, r.final.b, r.final.diff, r.final.ok, "pass", 0.03, 0.3, "", 4)
          : `<div class="meter"><b>ためしに走らせると、三つの目盛りが出る</b><span class="nums">何度でも走らせてよい。減点なし。</span></div>`
      }</div>`,
    who: state.line.who,
    text: state.line.text,
    extra: state.duelHint
      ? `<p class="sub">${round.id === 1 ? "押した直後だけ増えるかたさを上げると、着地直後のへこみは浅くなる。増えたかたさが消えていくまでの時間を長くすると、前の一歩のへこみが戻りきらず深くなる。打ち消し合わせると？" : "足を上げる直前は見本と同じにしたまま、着地直後だけ深くしたい。押した直後だけ増えるかたさを下げてみよう。"}${state.duelHint > 1 ? " まず増えるかたさだけを動かして、ロボが見る点の目盛りを見てから、消えていくまでの時間を足そう。" : ""}</p>`
      : "",
    cmds:
      state.duelPhase === "result" && state.duelCleared
        ? [{ act: round.id === 1 ? "duel-next" : "to-map", label: round.id === 1 ? "ラウンド2へ" : "答えの地図を開く", hot: true }]
        : [
            { act: "duel-test", label: "ためしに走らせる", sub: "何度でも。減点なし", hot: state.duelPhase === "design", disabled: state.duelPhase === "judge" },
            { act: "duel-go", label: "設計を固定して挑む", sub: "ロボが規則どおりに測る", hot: state.duelPhase === "test", disabled: state.duelPhase === "judge" },
            { act: "duel-hint", label: "ヒント", ghost: true },
          ],
  };
}

function mapCells(): number[][] {
  const out: number[][] = [];
  for (let i = 0; i <= 40; i++) {
    const row: number[] = [];
    for (let k = 0; k <= 72; k++) {
      const p = duelMaterial(+(0.2 + i * 0.05).toFixed(2), +(0.4 + k * 0.05).toFixed(2));
      row.push((judgeDuel(DUEL_ROUNDS[0]!, p).cleared ? 1 : 0) + (judgeDuel(DUEL_ROUNDS[1]!, p).cleared ? 2 : 0));
    }
    out.push(row);
  }
  return out;
}
let cellsCache: number[][] | null = null;

function c2Map(): View {
  cellsCache ??= mapCells();
  const marks = state.duelLog.map((s, i) => {
    const [e1, tau] = s.split(",").map(Number) as [number, number];
    return { col: Math.round((tau - 0.4) / 0.05), row: Math.round((e1 - 0.2) / 0.05), label: `あなた（ラウンド${i + 1}）` };
  });
  const n1 = cellsCache.flat().filter((x) => x === 1).length;
  const n2 = cellsCache.flat().filter((x) => x === 2).length;
  const n3 = cellsCache.flat().filter((x) => x === 3).length;
  return {
    chap: "謎2 クリア",
    goal: "答えの地図：あなたの設計は、どこにあった？",
    svg: `${answerMap(120, 30, 640, 380, cellsCache, marks, { x: "増えたかたさが消えていくまでの時間（0.4〜4）", y: "押した直後だけ増えるかたさ（0.2〜2.2）" })}
      <g transform="translate(820,60)"><rect width="22" height="22" fill="var(--you)"/><text x="32" y="18" fill="var(--ink)" font-size="18" font-weight="800">ラウンド1で通る ${n1} 通り</text>
      <rect y="40" width="22" height="22" fill="var(--bot)"/><text x="32" y="58" fill="var(--ink)" font-size="18" font-weight="800">ラウンド2で通る ${n2} 通り</text>
      <text y="110" fill="var(--gold)" font-size="20" font-weight="900">両方で通る：${n3} 通り</text>
      <text y="146" fill="var(--soft)" font-size="15">答えは一つではない。でも、</text><text y="170" fill="var(--soft)" font-size="15">測り方が変わると、通る場所も変わる。</text>
      <text y="206" fill="var(--soft)" font-size="13">（つまみを0.05ずつ変えたすべての組み合わせを、</text><text y="226" fill="var(--soft)" font-size="13">ロボと同じ判定で計算して塗った）</text></g>`,
    who: "bot",
    text: state.line.text,
    cmds: [{ act: "to-c3", label: "謎3：心臓と血管へ", sub: "血液の流れと圧力を、電気回路と同じ式で", hot: true }],
  };
}

// ---------- 謎3：拍動の盲点 ----------
const VA = summarize(BASE_VESSEL);
const VB = summarize(CASE_VESSEL_B);
function c3Stage(): string {
  return loopStage({ u: state.u, a: BASE_VESSEL, b: CASE_VESSEL_B, pa: pressureAt(BASE_VESSEL, state.u), pb: pressureAt(CASE_VESSEL_B, state.u), minA: VA.min, minB: VB.min, flow: pumpFlow(state.u) });
}
function c3Say(): View {
  const lines: [string, string, string][] = [
    ["証言 1 / 2", `「1回の脈の平均の圧：A ${VA.mean.toFixed(1)}・B ${VB.mean.toFixed(1)}」`, `「差 ${sgn(VB.mean - VA.mean, 1)} mmHg。区別できません」`],
    ["証言 2 / 2", "「だから、AとBは", "　同じ人工血管です」"],
  ];
  const [lab, l1, l2] = lines[Math.min(state.say, 1)]!;
  return {
    chap: "謎3 脈の見落とし",
    goal: "心臓と血管のまねをした試験装置の、人工血管。ロボの証言を聞こう",
    svg: `<g transform="translate(-40,40) scale(0.72)">${c3Stage()}</g>${bubble(560, 40, lab, l1, l2, 400)}${robotArt(state.mood, 1040, 120, 0.7)}`,
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
  if (state.line.who === "bot" && state.mood === "shock") v.cmds = [{ act: "to-sync", label: "なぜ違う？ 電気回路で同じ波をつくる", hot: true }];
  return v;
}
function c3Sync(): View {
  const mine = { r: state.syncR, c: state.syncC };
  const j = judgeSync(CASE_VESSEL_B, mine);
  const asked = state.vBet !== null;
  return {
    chap: "謎3 なぜ？",
    goal: asked ? "抵抗とコンデンサ（電気をためる部品）を動かして、血管Bの圧の波を電気回路でつくろう" : "平均は同じ。違うのはどっち？",
    svg: `${heartCircuit(40, 20, state.syncR, state.syncC)}${syncChart(500, 20, 740, 280, CASE_VESSEL_B, mine, j.both)}`,
    html: asked
      ? `<div class="knobs" style="left:1.5%;top:60%;width:34%">${(["r", "c"] as const)
          .map((k) => {
            const s = VESSEL_SLIDERS[k];
            const v = k === "r" ? state.syncR : state.syncC;
            return `<label><span>${s.label}<strong id="v-s${k}">${v.toFixed(2)}</strong></span><input type="range" data-sync="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}" ${state.syncDone ? "disabled" : ""}></label>`;
          })
          .join("")}</div>
        <div class="meters" style="left:39%;top:66%;width:58%;grid-template-columns:1fr 1fr">
          ${meter("平均の高さ（送る量が同じなら、抵抗Rで決まる）", j.target.mean, j.mine.mean, j.mine.mean - j.target.mean, j.meanOk, "pass", VESSEL_ROBOT_TOL, 30, "", 1).replace("A ", "血管B ").replace("あなた", "回路")}
          ${meter("高い圧と低い圧の差（主にコンデンサCで変わる。Rでも少し）", j.target.pulse, j.mine.pulse, j.mine.pulse - j.target.pulse, j.pulseOk, "pass", VESSEL_ROBOT_TOL, 30, "", 1).replace("A ", "血管B ").replace("あなた", "回路")}
        </div>`
      : "",
    who: state.line.who,
    text: state.line.text,
    cmds: !asked
      ? [
          { act: "v-bet", val: "r", label: "血管の出口の流れにくさ（抵抗）", sub: "その先の細い血管へ流れ出しにくい" },
          { act: "v-bet", val: "c", label: "血管のふくらみやすさ（コンデンサ）", sub: "ふくらんで受け止める量" },
          { act: "v-bet", val: "unknown", label: "まだ分からない", sub: "回路で確かめる" },
        ]
      : state.syncDone
        ? [{ act: "to-c4", label: "謎4：細胞の膜へ", sub: "同じ回路が、神経の膜の中にも", hot: true }]
        : [{ act: "sync-hint", label: "ヒント", ghost: true }],
  };
}

// ---------- 謎4：膜の盲点 ----------
function c4Say(): View {
  const a = REST_MV + deltaMv(BASE_MEM, PULSE_MS);
  const b = REST_MV + deltaMv(CASE3_B, PULSE_MS);
  const lines: [string, string, string][] = [
    ["証言 1 / 2", `「止める直前：A ${mvs(a)}、B ${mvs(b)}」`, `「差 ${sgn(b - a, 2)} mV。区別できません」`],
    ["証言 2 / 2", "「だから、AとBは", "　同じ膜です」"],
  ];
  const [lab, l1, l2] = lines[Math.min(state.say, 1)]!;
  return {
    chap: "謎4 膜の見落とし",
    goal: "膝の動きを脳へ伝える神経の膜の模型。ロボの証言を聞こう",
    svg: `${nerveWhole(16, 16, false)}<g transform="translate(310,224) scale(0.8)">${heartCircuit(0, 0, 1, 1, { src: "電流を送りこむもの＝押されると開く入口", cap: "電気をためる部品＝膜", res: "抵抗＝いつも開いている通り道", bat: "電池＝何もしていないときの −70 mV" })}</g>
      <text x="310" y="190" fill="var(--soft)" font-size="14">謎3と同じ回路に、電池（何もしていないときの −70 mV をつくる）が加わる。</text><text x="310" y="210" fill="var(--soft)" font-size="13">mV＝ミリボルト（1000分の1ボルト）</text>${bubble(640, 40, lab, l1, l2, 400)}${robotArt(state.mood, 1080, 160, 0.6)}`,
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
    goal: state.memChecked ? "膜Bは、電気をためやすい膜" : "二つの説明に札をつけて、検算しよう",
    svg: `<g transform="translate(0,40) scale(0.62)">${nerveStage(BASE_MEM, CASE3_B, 60, { a: "膜 A", b: "膜 B", revealB: state.memChecked })}</g>
      ${state.memChecked ? `<text x="16" y="370" fill="var(--gold)" font-size="16" font-weight="900">金の＋：同じくらいの電圧でも、膜Bは約${CASE3_B.c}倍の電気をためている＝電気をためやすい</text><text x="16" y="394" fill="var(--soft)" font-size="14">入る電流は同じなので、Bはたまるのに時間がかかり、上がるのも戻るのもゆっくりになる</text>` : `<text x="16" y="370" fill="var(--soft)" font-size="15">膜Bの電気のためやすさと通りやすさは「？」。グラフの形から推理しよう</text>`}`,
    html: `<div class="lineup" style="grid-template-columns:1fr;left:63%;right:2%;top:3%;bottom:3%">${cards
      .map((c) => {
        const tag = state.memWhy[c.id];
        const truthOut = c.id === "g";
        return `<button class="ghost ${state.memChecked && truthOut ? "broken" : ""}" style="--c:${c.id === "g" ? "#7bd88f" : "#4fe0d0"}" data-act="mtag" data-val="${c.id}" ${state.memChecked ? "disabled" : ""}>
          <span class="gname">${c.name}</span><span style="font-size:max(11px,1cqw);color:var(--soft)">${c.look}</span>
          <span class="tag ${tag ?? ""}">${tag === "match" ? "合う" : tag === "out" ? "合わない" : tag === "unsure" ? "分からない" : "札をつける"}</span>
          ${state.memChecked ? (truthOut ? `<span class="res">検算：合わない</span>` : `<span class="res win">正体</span>`) : ""}</button>`;
      })
      .join("")}</div>`,
    who: state.line.who,
    text: state.line.text,
    cmds: state.memChecked ? [{ act: "to-duel4", label: "膜に、仕掛けろ", hot: true }] : [{ act: "m-check", label: "検算する", sub: all ? "計算プログラムが確かめる" : `あと ${cards.filter((c) => !state.memWhy[c.id]).length} 枚`, hot: all, disabled: !all }],
  };
}
function c4Duel(): View {
  const round = MEM_ROUNDS[state.round]!;
  const m = { g: state.g, c: state.c };
  const r = judgeMemDuel(round.id, m);
  const show = state.duelPhase !== "design";
  return {
    chap: "謎4 仕掛けろ",
    goal: `ロボの「次の一手」をすり抜ける膜をつくれ（ラウンド${round.id}）`,
    svg: `${membranePatch(12, 6, 0.7, BASE_MEM, "膜 A", "A", true, state.memT || 105)}${membranePatch(12, 154, 0.7, m, "あなたの膜", "B", true, state.memT || 105)}
      ${membraneGraph({ GL: 420, GR: 850, GT: 40, GB: 250 }, BASE_MEM, m, state.memT || 105, { a: "膜 A", b: "あなたの膜", top: 18, notes: false })}
      ${ruleCard(880, 20, round.id === 1 ? "膜の検査規則 第1版" : "膜の検査規則 第2版", [round.id === 1 ? "① 止める直前の膜の電圧" : "① 上がった高さが半分に戻る時間", `② 差 ±${round.id === 1 ? ROBOT_STEADY_TOL + " mV" : HALF_TIME_TOL + " ms"} 以内 → 同じ`], 0, round.id === 2)}`,
    html: `<div class="knobs" style="left:1%;top:62%;width:27%">${(["g", "c"] as const)
      .map((k) => {
        const s = MEM_SLIDERS[k];
        return `<label><span>${s.label}<strong id="v-${k}">見本の ${state[k].toFixed(2)} 倍</strong></span><input type="range" data-knob="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state[k]}" ${state.duelPhase === "judge" ? "disabled" : ""}></label>`;
      })
      .join("")}</div>
      <div class="meters" style="left:30%;top:60%;width:37%">${
        show
          ? meter(`ロボが見る点（${round.robotLabel}）：小さく`, r.robot.a, r.robot.b, r.robot.diff, r.robot.ok, "pass", round.id === 1 ? ROBOT_STEADY_TOL : HALF_TIME_TOL, 8, round.id === 1 ? " mV" : " ms", 2) +
            meter(`ロボに見えない違い（${round.hiddenLabel}）：大きく`, r.hidden.a, r.hidden.b, r.hidden.diff, r.hidden.ok, "hide", round.id === 1 ? HIDDEN1_NEED : HIDDEN2_NEED, 8, " mV", 2)
          : `<div class="meter"><b>テストで、二つの目盛りが出る</b></div>`
      }</div>`,
    who: state.line.who,
    text: state.line.text,
    extra: state.duelHint ? `<p class="sub">${round.id === 1 ? "ロボが見るのは止める直前の高さだけ。十分長く流したときの高さは通りやすさで決まり、電気のためやすさは、上がり方と戻り方の速さを変える。" : "ロボが見るのは戻る時間だけ。戻るのにかかる時間は「ためやすさ÷通りやすさ」に比例する（ためやすいほど遅く、通りやすいほど速い）。"}${state.duelHint > 1 ? (round.id === 1 ? " 通りやすさは見本のままにして、ためやすさだけ動かすと？（大きすぎると、止める直前までに上がりきらない）" : " ためやすさと通りやすさを、同じ倍だけ（たとえばどちらも2倍に）変えると？") : ""}</p>` : "",
    cmds:
      state.duelPhase === "result" && state.duelCleared
        ? [{ act: round.id === 1 ? "mduel-next" : "to-end", label: round.id === 1 ? "ラウンド2へ" : "まとめへ", hot: true }]
        : [
            { act: "mduel-test", label: "テスト", sub: "何度でも", hot: state.duelPhase === "design" },
            { act: "mduel-go", label: "設計を固定して挑む", hot: state.duelPhase === "test" },
            { act: "duel-hint", label: "ヒント", ghost: true },
          ],
  };
}

// ---------- まとめ ----------
function shareText(): string {
  return ["見立てラボ「検査ロボの見落とし」", ...state.record].join("\n");
}
function endView(): View {
  return {
    chap: "まとめ",
    goal: "三つとも、同じ一つの電気回路で表せる。見方が変わると、見落とすところも変わる",
    svg: `${robotArt("down", 1040, 150, 0.6)}
      <text x="40" y="34" fill="var(--ink)" font-size="17" font-weight="900">見立ての二段</text>
      <text x="40" y="64" fill="var(--soft)" font-size="13">① 人工軟骨を、ばねとダンパの模型に</text>
      <g transform="translate(40,74) scale(0.95)">${slsModel({ hl: null })}</g>
      <text x="200" y="134" fill="var(--gold)" font-size="26" font-weight="900">→</text>
      <g transform="translate(236,74) scale(0.55)">${heartCircuit(0, 0, 1, 1, { src: "", cap: "", res: "" })}</g>
      <text x="236" y="222" fill="var(--soft)" font-size="13">② ばね＝コンデンサ、ダンパ＝抵抗</text>
      <text x="40" y="252" fill="var(--ink)" font-size="14" font-weight="800">③ 同じ回路が、血管にも神経の膜にもなる</text>
      <text x="40" y="276" fill="var(--soft)" font-size="13">血管：ポンプ・ふくらみやすさ・出口の流れにくさ</text>
      <text x="40" y="298" fill="var(--soft)" font-size="13">神経の膜：押されると開く入口・膜・いつも開いている通り道</text>
      <text x="40" y="330" fill="var(--soft)" font-size="12">軟骨（右のばね＋ダンパの組）と血管は、式の形が同じだけ（電気は流れていない）。</text>
      <text x="40" y="350" fill="var(--soft)" font-size="12">膜では本当に電気がたまり、イオンが動く。</text>
      <g transform="translate(520,30)">
        ${[
          ["最後の値だけ見ると", "途中の違いを見落とす（軟骨・膜）"],
          ["平均だけ見ると", "高い圧と低い圧の差を見落とす（血管）"],
          ["戻る速さだけ見ると", "高さの違いを見落とす（膜の仕掛け）"],
        ]
          .map(([a, b], i) => `<g transform="translate(0,${i * 90})"><rect width="460" height="76" rx="12" fill="var(--paper)"/><text x="18" y="32" fill="var(--paper-ink)" font-size="20" font-weight="900">${a}</text><text x="18" y="60" fill="var(--paper-soft)" font-size="16" font-weight="700">${b}</text></g>`)
          .join("")}
      </g>`,
    who: "bot",
    text: state.line.text,
    cmds: [
      { act: "panel", val: "card", label: "発見カードを開く", sub: "答えを書かない記録も", hot: true },
      { act: "restart", label: "別の試作品Bで、最初から", ghost: true },
    ],
  };
}

function titleView(): View {
  return {
    chap: "見立てラボ",
    goal: "同じに見える。でも、測り方を変えると違う。",
    svg: `<g transform="translate(60,40)">
        ${[
          ["謎1 見破れ", "3Dプリントの人工軟骨を、走らせて調べる", "かたさと力"],
          ["謎2 仕掛けろ", "ロボの検査をすり抜ける軟骨をつくる", "かたさと力"],
          ["謎3 脈の見落とし", "人工血管と心臓ポンプ", "流れと圧"],
          ["謎4 膜の見落とし", "神経の膜", "電気"],
        ]
          .map(([c, n, k], i) => `<g transform="translate(0,${i * 76})"><rect width="560" height="66" rx="12" fill="var(--paper)"/><text x="18" y="24" fill="var(--paper-soft)" font-size="14" font-weight="900">${c}</text><text x="18" y="52" fill="var(--paper-ink)" font-size="21" font-weight="900">${n}</text><text x="542" y="52" fill="var(--paper-soft)" font-size="14" font-weight="800" text-anchor="end">${k}</text></g>`)
          .join("")}
        <text x="0" y="346" fill="var(--soft)" font-size="15">人工軟骨＝膝の骨と骨の間でクッションになる軟骨の、代わりを目指す試作品（本物ではなく、計算でつくった）</text>
        <text x="0" y="370" fill="var(--soft)" font-size="15">体の一部をつくりなおす医療（再生医療）の、架空の研究所。試作品は、検査ロボ TEJUN-07 が決まった手順で調べる。</text>
        <text x="0" y="394" fill="var(--soft)" font-size="15">ロボが「区別できない」と言ったものの、見落としを見つけるのが、あなたの仕事。</text>
      </g>${robotArt("smug", 900, 40, 1)}`,
    who: "bot",
    text: state.line.text,
    cmds: [
      { act: "start", label: "謎1を始める", sub: "人工軟骨の見落とし", hot: true, disabled: state.busy },
      { act: "panel", val: "about", label: "このゲームについて", ghost: true },
    ],
  };
}

// ---------- 描画 ----------
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
  end: endView,
};

function discovery(): string[] {
  const out: string[] = [];
  const ph = state.view?.runPhotos.find((p) => p.distinguishable);
  if (ph) out.push(`謎1：ロボは「一回押して20秒後の力」で区別できなかった。走行テスト（${tempoName(ph.period)}）の${ph.step + 1}歩目に差 ${sgn(ph.diff)} を見つけた`);
  if (state.debrief) out.push(`謎1の正体：${state.debrief.explanation}`);
  if (state.duelLog.length) out.push(`謎2：${state.duelLog.map((s, i) => `ラウンド${i + 1}を（押した直後だけ増えるかたさ, 消えていくまでの時間）＝（${s}）で突破`).join("、")}`);
  if (state.syncDone) out.push(`謎3：平均の圧は同じ（${VA.mean.toFixed(1)} mmHg）でも、高い圧と低い圧の差が違った（A ${VA.pulse.toFixed(0)}／B ${VB.pulse.toFixed(0)} mmHg、模型の値）。血管Bは、ふくらみやすさ（コンデンサ）が半分`);
  if (state.memChecked) out.push(`謎4：止める直前の膜の電圧は同じでも、上がり方・戻り方が違った。膜Bは電気のためやすさが ${CASE3_B.c} 倍`);
  out.push("まだ言えないこと：教材が決めた式・値の範囲・ぶれの決まりの中での結果。実物の材料・血管・膜の性質を、この模型だけで決めたわけではない");
  return out;
}

function panelHtml(): string {
  if (!state.panel) return "";
  const body =
    state.panel === "about"
      ? `<h2>このゲームについて</h2>
      <table><tr><th>検査ロボ TEJUN-07</th><td>決まった一つの測り方で判定するプログラム（AIではない）。自信ゲージは、あなたが見落としを突くたびに減る（あなたの減点ではない）</td></tr>
      <tr><th>相棒 Claude（AI）</th><td>謎1で参加。隠れた答えを知らない。あなたと同じ記録だけで考える</td></tr>
      <tr><th>検算</th><td>教材の計算プログラム（AIではない）が、同じ記録で確かめる</td></tr></table>
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
      <span class="chap">${esc(v.chap)}</span><span class="goal">${esc(v.goal)}</span>
      <span class="conf" role="img" aria-label="検査ロボの自信 ${state.conf}">TEJUN-07 の自信<span class="bar"><i style="width:${state.conf}%"></i></span></span>
      <span class="ai">相棒 Claude（AI）${state.claude ? "" : "・休止中"}</span>
      <button class="mini-btn" data-act="sound" aria-pressed="${sound.on}">音 ${sound.on ? "ON" : "OFF"}</button>
      <button class="mini-btn" data-act="panel" data-val="card">発見カード</button>
      <button class="mini-btn" data-act="panel" data-val="about">？</button>
    </header>
    <div class="stage"><svg class="st" viewBox="0 0 1280 480" preserveAspectRatio="xMidYMid meet">${v.svg}</svg>${v.html ?? ""}</div>
    <div class="win">
      <div><span class="who ${v.who}">${WHO_LABEL[v.who]}</span><p class="text ${state.line.rest.length ? "more" : ""}" aria-live="polite" ${state.line.rest.length ? `data-act="more" role="button" tabindex="0"` : ""}>${esc(v.text)}</p>${state.line.rest.length ? `<p class="next-hint" data-act="more">▼ 続き（窓を押す）</p>` : ""}${v.sub ? `<p class="sub">${esc(v.sub)}</p>` : ""}${v.extra ?? ""}${state.error ? `<p class="sub" style="color:var(--stamp)">${esc(state.error)}</p>` : ""}</div>
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
      el.textContent = full.slice(0, i);
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
  const stepMs = reduce ? 0 : Math.min(900, Math.max(260, (run.period / TAP_TO_PERIOD) * 1000));
  const at = (d: { land: number; peak: number; lift: number; pre: number }, u: number) => (u < 0.5 ? d.land + (d.peak - d.land) * (u / 0.5) : d.lift + (d.pre - d.lift) * ((u - 0.5) / 0.5));
  for (let k = 0; k < run.b.length; k++) {
    if (state.scene !== "c1-run") break;
    state.playing = k;
    beep("step", k);
    const s0 = performance.now();
    for (;;) {
      const u = stepMs === 0 ? 1 : Math.min(1, (performance.now() - s0) / stepMs);
      state.dents = { a: at(run.a[k]!, Math.min(u, 0.999)), b: at(run.b[k]!, Math.min(u, 0.999)), contact: u < 0.5, impact: u < 0.12 };
      state.shown = k + (u >= 0.5 ? 1 : 0);
      const svg = app.querySelector("svg.st");
      if (svg) svg.innerHTML = VIEWS["c1-run"]().svg;
      if (u >= 1) break;
      await sleep(33);
    }
  }
  state.playing = null;
  state.shown = run.b.length;
  const hot = Array.from({ length: run.b.length }, (_, k) => k).filter((k) => Math.abs(stepMax(run, k).diff) > STEP_TOLERANCE);
  say("you", hot.length ? `${hot.length === 12 ? "12歩すべて" : hot.map((k) => k + 1).join("・") + "歩目"}が赤く光った。赤く光った一歩を押して、証拠にしよう。` : "どの一歩も、差は「同じ」とみなす幅の内側。テンポを変えてみよう。");
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
    const a = duelSteps(BASE);
    const b = duelSteps(duelMaterial(state.e1, state.tau));
    state.duelPhase = "judge";
    for (let k = 0; k < 12 && !reduce; k++) {
      const s0 = performance.now();
      beep("step", k);
      for (;;) {
        const u = Math.min(1, (performance.now() - s0) / 170);
        const at = (d: { land: number; peak: number; lift: number; pre: number }) => (u < 0.5 ? d.land + (d.peak - d.land) * (u / 0.5) : d.lift + (d.pre - d.lift) * ((u - 0.5) / 0.5));
        state.dd = { a: at(a[k]!), b: at(b[k]!), contact: u < 0.5, impact: u < 0.15 };
        const svg = app.querySelector("svg.st");
        if (svg) svg.innerHTML = VIEWS.c2().svg;
        if (u >= 1) break;
        await sleep(30);
      }
    }
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
  state.dd = null;
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
    say("bot", "……私の規則では、区別できません。");
    if (kind === "c2") state.duelLog.push(`${state.e1.toFixed(2)}, ${state.tau.toFixed(2)}`);
    state.record.push(`${kind === "c2" ? "謎2 🦵" : "謎4 ⚡"} ラウンド${state.round + 1} すり抜け ✔`);
    render();
    await stamp("すり抜けた！", "win", 0.5);
    await damage(12);
    say("calc", `ロボの点は通過。ロボに見えない違い（${hiddenName}）には差 ${sgn(r.hidden.diff, kind === "c2" ? 3 : 2)}${kind === "c2" ? "" : " mV"} が残っている。`);
  } else {
    state.mood = "smug";
    const reason = !r.robot.ok ? "見つけました。私の規則で測った点に、差があります。" : "私の規則では、区別できません。";
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
      note: null,
      curveId: "",
      tags: {},
      c1Hit: false,
      round: 0,
      duelLog: [],
      record: [],
      syncDone: false,
      vBet: null,
      memChecked: false,
      memWhy: {},
      panel: null,
    });
    state.mood = "smug";
    const it = r.view.intro;
    introLine = `いつもの検査の結果です。押して20秒後の力。B ${it.force.toFixed(3)}、見本A ${it.base.toFixed(3)}。差は「同じ」とみなす幅の内側。`;
    say("guide", "はじまりの話：新しい試作品Bができて、検査ロボが調べた。何が起きたのか、見てみよう。");
    state.scene = "movie";
    state.movieId = 1;
    state.movieT = reduceMotion() ? movieLength(1) : 0;
    state.moviePlaying = !reduceMotion();
  });
}

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "t-pass") {
    const w = app.querySelector<HTMLElement>("#t-cause-wrap");
    if (w) w.hidden = t.value.length === 0;
    return;
  }
  if (t.dataset.knob) {
    const k = t.dataset.knob as "e1" | "tau" | "g" | "c";
    state[k] = Number(t.value);
    state.duelPhase = "design";
    const lab = app.querySelector(`#v-${k}`);
    if (lab) lab.textContent = k === "g" || k === "c" ? `見本の ${state[k].toFixed(2)} 倍` : state[k].toFixed(2);
    if (state.scene === "c4-duel") {
      const svg = app.querySelector("svg.st");
      if (svg) svg.innerHTML = VIEWS["c4-duel"]().svg;
    }
    // つまみを動かしたら、前のテストの目盛りは古い。テストし直すまで目盛りを隠す
    const meters = app.querySelector(".meters");
    if (meters && (state.scene === "c2" || state.scene === "c4-duel")) {
      const tmp = document.createElement("div");
      tmp.innerHTML = VIEWS[state.scene]().html ?? "";
      const nm = tmp.querySelector(".meters");
      if (nm) meters.innerHTML = nm.innerHTML;
    }
  } else if (t.dataset.sync) {
    if (t.dataset.sync === "r") state.syncR = Number(t.value);
    else state.syncC = Number(t.value);
    const j = judgeSync(CASE_VESSEL_B, { r: state.syncR, c: state.syncC });
    if (j.both && !state.syncDone) {
      state.syncDone = true;
      state.mood = "shock";
      say("calc", `重なった。血管Bはコンデンサ ${state.syncC.toFixed(2)}（見本 1.50）＝ふくらみやすさが半分。ポンプが送る量が同じなので、平均の圧は抵抗だけで決まり、ロボには同じに見えた。ふくらんで受け止める量はAとBでほぼ同じ。Bはふくらみにくいので、同じ量を受け止めるのに圧が大きく上下する。${state.vBet === "c" ? "予想どおり。" : state.vBet === "r" ? "予想は外れた。ここが発見。" : ""}`);
      state.record.push("謎3 ❤️ 見落とし ✔ 回路で同じ波 ✔");
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
      if (state.say === 1) say("bot", "見本と区別できないものは、同じとみなします。それが私の規則です。");
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
    case "tempo":
      state.period = Number(val);
      state.taps = [];
      render();
      break;
    case "tap": {
      const now = performance.now();
      const last = state.taps[state.taps.length - 1];
      if (last !== undefined && now - last > 3000) state.taps = [];
      state.taps = [...state.taps, now].slice(-5);
      if (state.taps.length >= 2) {
        const iv = (state.taps[state.taps.length - 1]! - state.taps[0]!) / (state.taps.length - 1) / 1000;
        state.period = Math.round(clampPeriod(iv * TAP_TO_PERIOD) * 100) / 100;
      }
      render();
      break;
    }
    case "go-run":
      if (!v) return;
      await guard(async () => {
        const r = await api.run(v.sessionId, state.period);
        state.view = r.view;
        state.runId = r.runId;
      });
      if (state.runId) {
        say("you", `${tempoName(state.period)}で走らせる。`);
        await playRun();
      }
      break;
    case "note": {
      const k = Number(val);
      if (k >= state.shown || state.playing !== null) return;
      state.note = k;
      const run = currentRun()!;
      const m = stepMax(run, k);
      state.dents = { a: run.a[k]![m.phase], b: run.b[k]![m.phase], contact: true, impact: false };
      render();
      break;
    }
    case "shot": {
      if (!v || state.note === null) return;
      const run = currentRun()!;
      const k = state.note;
      const m = stepMax(run, k);
      await guard(async () => {
        state.view = (await api.runPhoto(v.sessionId, run.id, k, m.phase)).view;
      });
      const p = state.view!.runPhotos.find((x) => x.runId === run.id && x.step === k && x.phase === m.phase);
      if (p) {
        const id = `run:${run.id}:${k}:${m.phase}`;
        if (!state.evidence.some((x) => x.id === id))
          state.evidence.push({ id, case: 1, title: `走行テスト・${tempoName(run.period)}`, line: `${k + 1}歩目`, big: `差 ${sgn(p.diff)}`, ok: p.distinguishable });
        say("you", p.distinguishable ? `${k + 1}歩目を証拠ファイルに入れた。差 ${sgn(p.diff)}。「同じ」とみなす幅を超えている。` : `${k + 1}歩目を証拠に入れた。でも差 ${sgn(p.diff)} は「同じ」とみなす幅の内側。`);
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
        say("bot", !ev ? "それは私の検査そのものです。違いは写っていませんよ。" : "その瞬間の差は、「同じ」とみなす幅の内側です。それでは、同じでないとは言えません。");
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
        say("guide", "試験台で、1秒かけて押しこみ（ふつう）、その深さで止めて力を記録した。影武者＝「この説明が正しいとしたら、Bはこう動くはず」という線。どれも押し終わった瞬間の高さはBに合わせてある。違いが出るとしたら、その後。");
        go("c1-line");
      }
      break;
    case "tag": {
      const id = val as CandidateId;
      const order: (Tag | undefined)[] = [undefined, "match", "out", "unsure"];
      const cur = state.tags[id];
      state.tags = { ...state.tags, [id]: order[(order.indexOf(cur) + 1) % order.length] };
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
        win?.insertAdjacentHTML("beforeend", `<div class="words"><input id="words" maxlength="200" placeholder="例：Bの方がねばっこい" aria-label="あなたの説明"><button class="choice" data-act="words">近い影武者を探す</button></div>`);
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
        say("you", `「${CANDIDATES[id].label}」の影武者を前に呼んだ。記録と合っている？`);
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
        say("guide", "新しい記録。影武者の線も、この押し方に合わせ直した。残った影武者に札をつけよう。");
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
        state.record.push("謎1 🔍 影武者の見比べ → 正体 ✔");
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
      await stamp("規則改訂", "miss");
      break;
    case "to-map":
      state.mood = "down";
      say("bot", "測り方を変えると、通る場所も変わる……。その地図は、私には描けません。");
      go("c2-map");
      break;
    // 謎3
    case "to-c3":
      state.moviePlaying = false;
      startMovie(3, "はじまりの話：舞台は心臓と血管へ。人工血管の試作品Bを、ロボが調べた。");
      break;
    case "enter-c3":
      state.moviePlaying = false;
      state.say = 0;
      state.mood = "smug";
      state.vPlaying = !reduceMotion();
      say("bot", "ラボの、心臓と血管のまねをした試験装置です。ポンプが1回の脈ごとに液（血液のかわり）を送り、人工血管がふくらんで受け止めます。");
      go("c3-say");
      vLoop();
      break;
    case "c3-next":
      state.say++;
      say("bot", state.say === 1 ? "平均が同じなら、同じ血管です。それが私の規則です。" : "……1回の脈の平均を測れば十分です。脈の途中まで見る必要はありません。");
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
      say("guide", "血管の式は、電気回路と同じ形（血管に電気が流れているわけではない）。ポンプ＝電流を送りこむもの（つながる先にかかわらず、決まった量を送り出す）。血管のふくらみやすさ＝コンデンサ（電気をためる部品。ためるほど電圧が上がる）。血管の出口の先の細い管＝抵抗。つまみで回路をつくり、血管Bの圧の波に重ねてみよう。");
      render();
      break;
    case "sync-hint":
      say("guide", "ポンプが送る量が同じなら、平均の高さは抵抗Rで決まる（平均の流れ×R）。高い圧と低い圧の差は、主にコンデンサCで変わる。まず平均のメーターを合わせ、次に差のメーター。");
      render();
      break;
    // 謎4
    case "to-c4":
      state.moviePlaying = false;
      startMovie(4, "はじまりの話：舞台は神経の膜へ。膝が押された感じを伝える膜の試作品Bを、ロボが調べた。");
      break;
    case "enter-c4":
      state.moviePlaying = false;
      state.say = 0;
      state.mood = "smug";
      say("bot", "最後は、膝の動きを脳へ伝える神経の端の膜の模型です。押している100ミリ秒（0.1秒）のあいだ、入口から決まった量の電流が入り、離すと止まります。");
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
      say("you", "止める直前は同じ。違うのは、イオンの通りやすさ？ 電気のためやすさ？ 札をつけよう。");
      go("c4-why");
      break;
    case "mtag": {
      const id = val as "g" | "c";
      const cur = state.memWhy[id];
      state.memWhy = { ...state.memWhy, [id]: cur === undefined ? "match" : cur === "match" ? "out" : cur === "out" ? "unsure" : undefined };
      render();
      break;
    }
    case "m-check": {
      state.memChecked = true;
      const right = state.memWhy.g === "out" && state.memWhy.c === "match";
      say("calc", `通りやすさだけが違うなら、長く流したときの上がった高さ（電流×抵抗。抵抗＝通りにくさ）が変わるはず。でも記録は、止める直前の高さが同じで、途中の上がり方と戻り方だけが遅い。高さを変えずに速さだけ変わるのは、電気のためやすさのほう（違いは一つだけ、という約束のもとで）。だから「通りやすさ」は合わない。膜Bは電気のためやすさが ${CASE3_B.c} 倍。${right ? "あなたの札と一致。" : "あなたの札と違うところがある。"}`);
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
      await stamp("規則改訂", "miss");
      break;
    case "to-end":
      state.mood = "down";
      say("bot", "手順を一つに決めると、私には見えないものがある。……次の試作品は、どう測りますか？");
      state.conf = 0;
      go("end");
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

say("bot", "私はTEJUN-07。試作品の検査ロボです。決まった手順で測り、見本と区別できなければ、同じとみなします。");
status().then((s) => {
  state.claude = s.claude;
  render();
});
render();
void shake;
