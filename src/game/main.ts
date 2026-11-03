// ミカタ・ラボ ゲーム版「検査ロボの盲点」（入口）。
// 事件1はサーバーのセッション（隠れた試料B・誤差つきの記録・比較器・Claude）を使う。
// 事件2・3は公開の式だけの計算（誤差なし）。検査ロボは定型ルールで動き、AIではない。
import "./game.css";
import { api, status, type Debrief, type Hint, type PredictionChoice, type PublicSessionView } from "../api.js";
import { BASE, CANDIDATES, type CandidateId } from "../../server/model/public.js";
import { compare } from "../../server/model/comparator.js";
import { fitCandidate, predictedCurve } from "../../server/model/fit.js";
import { dentAfterRelease, judgePhoto, RECOVERY_MAX, SHAPE_TOLERANCE } from "../../server/model/recovery.js";
import { DUEL_ROUNDS, DUEL_SLIDERS, duelMaterial, FINAL_CHECK, HIDDEN_NEED, judgeDuel, ROBOT_PASS, type DuelResult } from "../../server/model/duel.js";
import {
  BASE_MEM,
  CASE3_B,
  deltaMv,
  halfTimeMs,
  HALF_TIME_TOL,
  HIDDEN1_NEED,
  HIDDEN2_NEED,
  judgeMemDuel,
  MEM_ROUNDS,
  MEM_SLIDERS,
  PULSE_MS,
  RECORD_MS,
  REST_MV,
  ROBOT_STEADY_TOL,
  SEE_DIFF,
  type MemDuelResult,
  type Membrane,
} from "../../server/model/membraneGame.js";
import { curveGraphSvg, HOLD_MAX } from "../curve.js";
import { CAND_COLOR } from "../draw.js";
import { carrySvg, thoughtSvg } from "../act2.js";
import { pushSpeedTable, storyFor } from "../story.js";
import { diffMeterSvg, factorySvg, memGraphSvg, membraneCameraSvg, padCameraSvg, recoveryMiniSvg, robotSvg, type Mood, type PadState } from "./draw.js";

type Screen = "title" | "c1-verdict" | "c1-run" | "c1-camera" | "c1-why" | "c1-reveal" | "c2" | "bridge" | "c3-camera" | "c3-why" | "c3-duel" | "finale";
type Push = 0.2 | 1 | 5;
interface MemPhoto {
  t: number;
  a: number;
  b: number;
  diff: number;
  ok: boolean;
}

const TIME_CHIPS = [0, 1, 2, 4, 6, 40];
/** 神経細胞の全体像（模式図）と、拡大する場所の枠 */
const NEURON_SVG = `<svg viewBox="0 0 150 60" aria-label="神経細胞の模式図と、拡大する膜の場所" role="img">
  <g fill="none" stroke="var(--g-soft)" stroke-width="2" stroke-linecap="round">
    <path d="M30 30 L8 12 M30 30 L6 34 M30 30 L14 52 M24 22 L16 6"/>
    <path d="M42 30 H140"/>
  </g>
  <circle cx="34" cy="30" r="12" fill="var(--g-pad-b)" stroke="var(--g-soft)" stroke-width="2"/>
  <rect x="78" y="20" width="22" height="20" rx="3" fill="none" stroke="var(--g-warn)" stroke-width="2.5"/>
</svg>`;
const MEM_CHIPS = [10, 30, 100, 105, 120, 150, 200];
const SPEED_NAME: Record<number, string> = { 0.2: "すばやく（0.2秒）", 1: "ふつう（1秒）", 5: "ゆっくり（5秒）" };
const LOOKS: Record<CandidateId, string> = {
  overall: "20秒待ったあとも、Aの線とずれたまま",
  instant: "押し終わりの高さが違う。下がり方の速さはAと同じ",
  relax: "下がり方の速さが違う（押し終わりの高さも少し変わる）",
  same: "どの押し方でも、Aの線と重なる",
};

const state = {
  screen: "title" as Screen,
  view: null as PublicSessionView | null,
  /** 押す前の公開ビュー。本人が説明を選ぶまでは、こちらの判定だけを見せる（判断を先取りしない） */
  boardView: null as PublicSessionView | null,
  claude: false,
  sound: false,
  busy: false,
  error: "",
  mood: "calm" as Mood,
  // 事件1
  bet: null as PredictionChoice | null,
  pad: { phase: "idle", press: 0, dentA: 0, dentB: 0, forceA: null, forceB: null, highlight: false } as PadState,
  clock: "",
  animating: false,
  curveId: "",
  recH: RECOVERY_MAX,
  playToken: 0,
  overlay: null as CandidateId | null,
  pickDraft: [] as CandidateId[],
  nextSpeed: null as Push | null,
  nextChoice: null as PredictionChoice | null,
  drawUntil: 99,
  hint: null as Hint | null,
  debrief: null as Debrief | null,
  // 事件2
  duelRound: 0,
  e1: 1,
  tau: 1,
  duelPhase: "design" as "design" | "scan" | "result",
  scanStep: 0,
  duelResult: null as DuelResult | null,
  duelCleared: [false, false],
  duelHint: 0,
  duelLog: [] as { round: number; e1: number; tau: number }[],
  // 事件3
  memT: RECORD_MS,
  memRan: false,
  memPhotos: [] as MemPhoto[],
  memWhy: null as "g" | "c" | null,
  memRound: 0,
  g: 1,
  c: 1,
  memPhase: "design" as "design" | "scan" | "result",
  memScan: 0,
  memResult: null as MemDuelResult | null,
  memCleared: [false, false],
  memHint: 0,
  memLog: [] as { round: number; g: number; c: number }[],
  copied: false,
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const sgn = (x: number, d = 3) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;

// ---------- 効果音（初期OFF） ----------
let audio: AudioContext | null = null;
function beep(kind: "shutter" | "scan" | "win" | "lose"): void {
  if (!state.sound) return;
  try {
    audio ??= new AudioContext();
    const seq: Record<typeof kind, [number, number][]> = {
      shutter: [[1200, 0.04], [700, 0.05]],
      scan: [[520, 0.06]],
      win: [[660, 0.09], [880, 0.09], [1320, 0.16]],
      lose: [[330, 0.12], [220, 0.2]],
    };
    let t = audio.currentTime;
    for (const [f, d] of seq[kind]) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      o.type = "triangle";
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + d);
      t += d;
    }
  } catch {
    /* 音が出せない環境では鳴らさない */
  }
}

// ---------- 共通の部品 ----------
const STEPS: { id: string; label: string; screens: Screen[] }[] = [
  { id: "01", label: "見破れ", screens: ["c1-verdict", "c1-run", "c1-camera", "c1-why", "c1-reveal"] },
  { id: "02", label: "仕掛けろ", screens: ["c2"] },
  { id: "03", label: "つなぐ", screens: ["bridge"] },
  { id: "04", label: "膜の盲点", screens: ["c3-camera", "c3-why", "c3-duel"] },
  { id: "05", label: "まとめ", screens: ["finale"] },
];

function header(): string {
  const cur = STEPS.findIndex((s) => s.screens.includes(state.screen));
  return `<header class="g-head">
    <div class="brand"><span class="slash">//</span> MIKATA LAB <span class="sub">BLIND SPOT</span></div>
    <ol class="steps">${STEPS.map((s, i) => `<li class="${i === cur ? "on" : i < cur ? "done" : ""}"><span>${s.id}</span>${s.label}</li>`).join("")}</ol>
    <div class="head-right">
      <span class="ai-chip ${state.claude ? "on" : ""}" title="画面の相棒はAI（Claude）です">${state.claude ? "相棒 Claude（AI）：事件1で参加" : "相棒 Claude（AI）：休止中・定型の手がかり"}</span>
      <button class="link" data-act="sound" aria-pressed="${state.sound}">効果音 ${state.sound ? "ON" : "OFF"}</button>
      <a class="link" href="lab.html">詳しい実験室</a>
    </div>
  </header>`;
}

function robot(line: string, mood: Mood = state.mood): string {
  return `<div class="robot ${mood}">
    <div class="robot-face">${robotSvg(mood)}</div>
    <div><p class="robot-name">KENSA-07・検査ロボ（決まった測り方で動く定型ルール。AIではありません）</p><p class="robot-line">${line}</p></div>
  </div>`;
}

function kicker(k: string, title: string, lead: string): string {
  return `<p class="kicker">${k}</p><h1>${title}</h1><p class="lead">${lead}</p>`;
}

function curve() {
  return state.view?.curves.find((c) => c.id === state.curveId) ?? null;
}

// ---------- 画面 ----------
function renderTitle(): string {
  return `<section class="title">
    ${kicker("CASE FILE / 検査ロボの盲点", "同じに見える。<br>でも、測り方を変えると違う。", "3Dプリンタで作った人工の膝クッションA・B（仮想の試作品）。押して20秒後の力は、いつもの検査では区別できない。走ってすばやく押されたときも、足を上げた後の戻り方も同じ？")}
    <div class="card factory-card">
      ${factorySvg()}
      <div class="story">
        <p><strong>ここは</strong>再生医療ラボ（仮想）。3Dプリンタで、膝の骨と骨の間に入れる人工のクッションを試作している。クッションは一歩ごとに押され、足を上げると元へ戻る。</p>
        <p><strong>ロボの検査</strong>試作品は、検査ロボ KENSA-07 が調べる。押して、20秒待って、押し返す力を読む。見本Aとの差が ±0.03 以内なら「見本と区別できない」。いつも同じ手順で、それ以外は見ない。</p>
        <p><strong>事件</strong>新しい印刷条件で作ったクッションB。ロボの判定は「見本と区別できません」。でも、走るときのようにすばやく押されたら？ 次の一歩までに元へ戻る？ ロボが見ていないところを調べるのが、あなたの仕事。</p>
      </div>
    </div>
    ${robot("私はKENSA-07。試作品の検査ロボです。決まった手順（押して20秒後の力）で、見本と同じかを判定します。私の検査で区別できなければ、二つは同じとみなします。", "smug")}
    <div class="title-grid">
      <div class="card">
        <h2>あなたの任務</h2>
        <p class="note">できるようになること：一つの値だけを見る検査が何を見落とすかを、時間の記録で確かめ、理由を説明できる。</p>
        <ol class="missions">
          <li><strong>見破れ</strong>：ロボが見落とした瞬間を、時間を止めて証拠に撮る。なぜ違うのかを、力の記録で推理する</li>
          <li><strong>仕掛けろ</strong>：検査を鍛えるために、ロボの検査をすり抜ける試験用のクッションをつくる。ロボは測り方を変えてくる</li>
          <li><strong>膜の盲点</strong>：膝の動きや押された感じは、神経の膜の電気で脳へ伝わる。膜の模型にも同じ盲点がある。見破って、仕掛ける</li>
        </ol>
        <div class="actions"><button class="btn go big" data-act="start" ${state.busy ? "disabled" : ""}>事件1を始める</button></div>
        ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
      </div>
      <div class="card soft">
        <h2>この実験室について</h2>
        <p class="note">クッションと膜は、計算で作った仮想の試料です（クッションは、見本Aを押して十分に待った力を1とする目盛り）。ラボも試作品も架空で、実在の人工関節・軟骨・医療機器の性能を表すものではありません。ここでの「検査」は、ゲームの中の検査のルールで、臨床検査や実在の機器の手順ではありません。実在の材料や体の組織とも関係なく、診断や性能の判定はしません。</p>
        <table class="roles"><tr><th>検査ロボ KENSA-07</th><td>決まった一つの測り方で判定するプログラム（AIではない）</td></tr><tr><th>相棒 Claude（AI）</th><td>事件1で参加。隠れた答えを知らない</td></tr><tr><th>検算</th><td>教材の計算プログラムが、同じ記録で確かめる</td></tr></table>
        <p class="note">相棒のClaude（AI）は、隠れた答えを知りません。あなたと同じ記録だけで考えます。試す回数で減点はしません。</p>
        <details><summary>先生用の設定</summary>
          <div class="teacher">
            <label>合言葉<input type="password" id="t-pass" autocomplete="off"></label>
            <label>隠れた原因<select id="t-cause"><option value="">ランダム</option>
              <option value="instantUp">上乗せのかたさが大きい</option><option value="instantDown">上乗せのかたさが小さい</option>
              <option value="relaxSlow">上乗せ分がやわらぐのが遅い</option><option value="relaxFast">上乗せ分がやわらぐのが速い</option></select></label>
            <label>乱数の種（整数）<input id="t-seed" inputmode="numeric"></label>
            <button class="btn ghost small" data-act="start-teacher">先生モードで始める</button>
          </div>
        </details>
      </div>
    </div>
  </section>`;
}

function renderVerdict(): string {
  const r = state.view!.intro;
  return `<section>
    ${kicker("CASE 01 / THE NEW PRINT", "検査ロボの盲点を、見破れ。", "まず、ロボのいつもの検査。新しい印刷条件のクッションBを、ふつう（1秒）に押して、20秒後の力だけを見ます。")}
    ${robot(`20秒後の力：見本A ${r.base.toFixed(3)}（基準）／試料B ${r.force.toFixed(3)}（測定）。差 ${sgn(r.diff)}。許容差 ±${r.tolerance} の内側。<strong>私の検査では、区別できません。</strong>`, "smug")}
    <div class="card">
      <h2>本当に同じ？ 予想してから、押して・保って・離してみよう</h2>
      <p class="note">押す→深さを保つ（20秒）→押し板を離す。離したあと、へこみがどう戻るかを見ます。</p>
      <div class="bets">${(
        [
          ["midSame", "途中も同じ", "20秒後が同じなら、戻り方も同じはず"],
          ["midDiffer", "途中は違うかも", "どこかで差が出そう"],
          ["unknown", "まだ分からない", "見てから考える"],
        ] as const
      )
        .map(([id, l, s]) => `<button class="bet ${state.bet === id ? "on" : ""}" data-act="bet" data-val="${id}" aria-pressed="${state.bet === id}"><strong>${l}</strong><span>${s}</span></button>`)
        .join("")}</div>
      <div class="actions"><button class="btn go big" data-act="run" ${!state.bet || state.busy ? "disabled" : ""}>押して、離してみる</button></div>
      ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    </div>
  </section>`;
}

function renderRun(): string {
  return `<section>
    ${kicker("CASE 01 / THE MISSING MOMENT", "押す → 保つ → 離す", "押し板は同じ深さで止まったまま。力センサの数字を見ていよう。")}
    <div class="card cam">
      <div class="cam-head"><span>RECOVERY CAMERA / 仮想の膝クッション</span><strong>${esc(state.clock)}</strong></div>
      ${padCameraSvg(state.pad)}
    </div>
  </section>`;
}

function dents(h: number): { a: number; b: number } {
  const c = curve()!;
  const rec = c.recovery.find((p) => Math.abs(p.h - h) < 1e-9) ?? c.recovery[c.recovery.length - 1]!;
  return { a: dentAfterRelease(BASE, c.pushSeconds, rec.h), b: rec.dent };
}

function camPad(): PadState {
  const d = dents(state.recH);
  return { phase: "release", press: 1, dentA: d.a, dentB: d.b, forceA: null, forceB: null, highlight: judgePhoto(d.b, d.a).distinguishable };
}

function renderCamera(): string {
  const v = state.view!;
  const c = curve()!;
  const mine = v.photos.filter((p) => p.curveId === c.id);
  const found = mine.some((p) => p.distinguishable);
  const betLine =
    state.bet && found
      ? state.bet === "midSame"
        ? "あなたの予想「途中も同じ」→ 途中に違いがあった。予想が外れた。ここが発見！"
        : state.bet === "midDiffer"
          ? "あなたの予想「途中は違うかも」→ そのとおり、途中に違いがあった。"
          : "見てから考える、でよし。途中に違いがあった。"
      : "";
  return `<section>
    ${kicker("CASE 01 / THE MISSING MOMENT", found ? "盲点、発見。" : "時間を戻して、違いが見える瞬間を探せ。", found ? "離して40秒後の形だけを見ていたら、見落としていた違いです。" : "最後の形は、よく似ている。でも、次の一歩（歩けば約1秒後）までに、どれだけ戻っている？ 時間を戻し、違いが見える瞬間を証拠にしよう。")}
    ${robot(found ? "その瞬間は……見ていなかった。私の検査は、20秒後の力だけです。" : "離して40秒後の形も、ほぼ同じに見えます。（私が測るのは、深さを保って20秒後の力だけです）", found ? "shock" : "smug")}
    <div class="card cam">
      <p class="timeband">押す（1秒）→ 保つ（20秒。ロボはこの最後の力を測る）→ <strong>離す（0〜40秒。いま見ているところ）</strong></p>
      <div class="cam-head"><span>RECOVERY CAMERA / 離した後のへこみ（計算と記録から描いた図）</span><strong id="cam-time">離して ${state.recH.toFixed(1)} 秒後</strong></div>
      <div id="cam-live">${padCameraSvg(camPad())}</div>
      <div class="cam-ctl">
        <div class="chips">${TIME_CHIPS.map((h) => `<button class="chip ${Math.abs(state.recH - h) < 1e-9 ? "on" : ""}" data-act="rec-h" data-val="${h}">${h === 0 ? "直後" : h === 40 ? "40秒後" : `${h}秒`}</button>`).join("")}</div>
        <label class="slider-row">離してから <input type="range" id="rec-h" min="0" max="${RECOVERY_MAX}" step="0.5" value="${state.recH}"> 秒</label>
        <button class="btn ghost small" data-act="rec-play">${state.playToken % 2 === 1 ? "一時停止" : "▶ 離したところから再生"}</button>
      </div>
      <div class="actions">
        <button class="btn go" data-act="photo" ${state.busy ? "disabled" : ""}>この瞬間を証拠にする</button>
        <span class="note">へこみの差が ${SHAPE_TOLERANCE} を超えたら「違いが見えた」。何度撮り直しても減点なし。</span>
      </div>
      <div class="mini-wrap"><span class="note">へこみの戻りの記録（下ほど深い。点線＝A、線＝B）</span><div id="mini-live">${recoveryMiniSvg(c.recovery, (h) => dentAfterRelease(BASE, c.pushSeconds, h), state.recH, 40)}</div></div>
    </div>
    ${
      mine.length
        ? `<div class="photos">${mine
            .map(
              (p) => `<figure class="photo ${p.distinguishable ? "ok" : ""}">
          <div class="ph-stamp">${p.distinguishable ? "違いが見えた" : "区別できない"}</div>
          <figcaption>離して${p.h.toFixed(1)}秒後<br>A ${p.dentA.toFixed(3)}（基準）／B ${p.dentB.toFixed(3)}（測定）<br>差 ${sgn(p.diff)}</figcaption></figure>`,
            )
            .join("")}</div>`
        : ""
    }
    ${betLine ? `<p class="bet-line">${betLine}</p>` : ""}
    <div class="actions">
      ${found ? `<button class="btn go big" data-act="to-why">なぜ違う？ 力の記録で推理する</button>` : `<button class="btn ghost" data-act="to-why" ${mine.length ? "" : "disabled"}>分からないので、力の記録も見てみる</button>`}
    </div>
  </section>`;
}

function overlayFit() {
  const c = curve();
  if (!c || !state.overlay) return null;
  const end = state.view!.records.find((r) => r.id === `${c.id}@0`);
  if (!end) return null;
  const iv = compare(state.view!.records).candidates[state.overlay].interval;
  return fitCandidate(state.overlay, c.pushSeconds, end.force, iv);
}

function renderWhy(): string {
  const v = state.view!;
  const c = curve()!;
  const fit = overlayFit();
  const awaiting = v.awaitingPick && c.studentPick === null;
  const bv = awaiting && state.boardView ? state.boardView : v;
  const yMax = Math.max(2.4, ...v.curves.flatMap((x) => x.b.map((p) => p.force + 0.2)));
  const narrowed = !awaiting && v.overall === "narrowed";
  const live = bv.candidates.filter((x) => x.status !== "inconsistent" || (!awaiting && c.excluded.includes(x.id)));
  const recommend = v.hintStage >= 3 ? v.planBySpeed.filter((p) => p.decisivePairs.length > 0).map((p) => p.pushSeconds) : [];
  const check =
    !awaiting && c.studentPick !== null
      ? c.studentPick === "unsure"
        ? `<p class="check">あなた：分からない → 検算：${c.excluded.length ? c.excluded.map((x) => `「${CANDIDATES[x].label}」`).join("") + "が合わない" : "この曲線で合わなくなった説明はない"}</p>`
        : (() => {
            const same = [...c.studentPick].sort().join() === [...c.excluded].sort().join();
            return `<p class="check ${same ? "agree" : "differ"}"><strong>${same ? "検算：あなたの判断と一致" : "検算：あなたの判断と違う。どこを見た？"}</strong>　判定：${c.excluded.length ? c.excluded.map((x) => `「${CANDIDATES[x].label}」`).join("") + "が合わない" : "合わない説明はない"}</p>`;
          })()
      : "";
  return `<section>
    ${kicker("CASE 01 / WHY", narrowed ? "正体が、一つに絞れた。" : "なぜ違う？ 合わない説明を外せ。", "写真は「違いがある」手がかり。理由を調べるため、同じ実験で記録した<strong>保持中の押し返す力</strong>を見ます（判定は力の記録で行います）。")}
    <div class="why-grid">
      <div class="card">
        <div class="cam-head"><span>FORCE RECORD / ${SPEED_NAME[c.pushSeconds]}押したときの押し返し</span><strong>点線＝見本A、青＝試料B（誤差 ±${v.error}）</strong></div>
        ${curveGraphSvg({ pushSeconds: c.pushSeconds, b: c.b, until: state.drawUntil, yMax, big: true, error: v.error, overlay: fit ? { points: predictedCurve(fit.params, c.pushSeconds), color: CAND_COLOR[fit.candidate] } : undefined })}
        ${fit ? `<p class="note">「${CANDIDATES[fit.candidate].label}」の線（押し終わりの高さに合わせた）。${fit.candidate === "same" ? "違いがなければ、Bは点線と重なるはず。" : "途中（2秒後・20秒後）も、測ったBと重なっている？"}</p>` : `<p class="note">右の説明の「線を重ねる」で、その説明が正しい場合の線を重ねて試せます。</p>`}
        ${v.curves.length > 1 ? `<div class="chips">${v.curves.map((x) => `<button class="chip ${x.id === c.id ? "on" : ""}" data-act="show-curve" data-id="${x.id}">${SPEED_NAME[x.pushSeconds]}</button>`).join("")}</div>` : ""}
      </div>
      <div class="card">
        <h2>${awaiting ? "この曲線と合わない説明はどれ？" : "説明のカード"}</h2>
        <p class="note">どれも「Aと一つだけ違う」説明です。${awaiting ? "合わないと思うカードを押して外し（いくつでも）、検算しよう。" : ""}「合わない」＝この説明の値を決められた範囲でどう選んでも、測った点の誤差の幅に線を通せないこと。「検算」＝教材の計算プログラム（AIではない）が、同じ記録で確かめた結果。</p>
        <ul class="cands">${live
          .map((x) => {
            const out = x.status === "inconsistent";
            const on = state.pickDraft.includes(x.id);
            return `<li class="cand ${out ? "out" : ""} ${on ? "picked" : ""}" style="--c:${CAND_COLOR[x.id]}">
              <button class="cand-main" data-act="toggle-pick" data-id="${x.id}" ${!awaiting ? "disabled" : ""} aria-pressed="${on}">
                <strong>${x.label}</strong><span>${LOOKS[x.id]}</span></button>
              <button class="ov ${state.overlay === x.id ? "on" : ""}" data-act="overlay" data-id="${x.id}">${state.overlay === x.id ? "重ねている" : "線を重ねる"}</button>
              ${out ? `<span class="stamp">合わない</span>` : on ? `<span class="stamp draft">外す</span>` : !awaiting && x.status === "undetermined" ? `<span class="stamp draft">まだ判断できない</span>` : ""}
              ${narrowed && v.narrowedTo === x.id ? `<span class="stamp win">決着</span>` : ""}
            </li>`;
          })
          .join("")}</ul>
        ${awaiting ? `<div class="actions"><button class="btn go" data-act="submit-pick" ${state.busy ? "disabled" : ""}>${state.pickDraft.length ? "外して、検算する" : "合わない説明はない、で検算する"}</button><button class="btn ghost small" data-act="pick-unsure" ${state.busy ? "disabled" : ""}>分からない</button></div>` : check}
        ${!awaiting ? `<p class="overall">${v.overallLabel}</p>` : ""}
        ${
          !awaiting && !narrowed
            ? `<div class="next">
          ${v.overall === "onlyWidened" ? `<p class="note">通常の誤差では合う説明がない。同じ押し方でもう一度測る（再測定）のも正当。候補が足りないと決めつけない。</p>` : v.candidates.some((x) => x.status === "undetermined") ? `<p class="note">「まだ判断できない」＝誤差を2倍に広げたときだけ合う説明（確率ではない）。</p>` : ""}
          <p><strong>別の押し方で確かめよう。</strong>押し終わりの力（曲線の高さ）は、Aと比べてどうなる？</p>
          <div class="chips">${([0.2, 1, 5] as Push[]).map((p) => `<button class="chip ${state.nextSpeed === p ? "on" : ""}" data-act="next-speed" data-val="${p}">${SPEED_NAME[p]}${recommend.includes(p) ? "・分かれやすい" : ""}</button>`).join("")}</div>
          <div class="chips">${(
            [
              ["same", "ほぼ同じ"],
              ["higher", "Bが高い"],
              ["lower", "Bが低い"],
              ["unknown", "まだ分からない"],
            ] as const
          )
            .map(([id, l]) => `<button class="chip ${state.nextChoice === id ? "on" : ""}" data-act="next-choice" data-val="${id}">${l}</button>`)
            .join("")}</div>
          <button class="btn go" data-act="push-again" ${!state.nextSpeed || !state.nextChoice || state.busy ? "disabled" : ""}>予想して、押す</button>
        </div>`
            : ""
        }
        ${narrowed && !awaiting ? `<div class="actions"><button class="btn go big" data-act="reveal" ${state.busy ? "disabled" : ""}>正体を開ける</button></div>` : ""}
        <div class="partner">
          <button class="btn ghost small" data-act="hint" ${state.busy || v.hintsLeft <= 0 ? "disabled" : ""}>${state.claude ? "相棒（Claude）に聞く" : "手がかりを見る"}</button>
          ${state.hint ? `<div class="hint"><span class="src">${state.hint.source === "claude" ? "Claude（AI）・答えを知らない相棒" : "定型の手がかり"}</span><p>${esc(state.hint.text)}</p></div>` : ""}
        </div>
      </div>
    </div>
    ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
  </section>`;
}

function renderReveal(): string {
  const d = state.debrief!;
  const v = state.view!;
  const story = storyFor(d.truth, d.base);
  const key = v.curves.find((c) => c.id === d.keyCurves[0]?.id) ?? v.curves[v.curves.length - 1]!;
  const t = pushSpeedTable(d.truth, d.base);
  const max = Math.max(...t.rows.map((r) => Math.abs(r.diff)));
  const yMax = Math.max(2.4, ...v.curves.flatMap((x) => x.b.map((p) => p.force + 0.2)));
  return `<section>
    ${kicker("CASE 01 / SOLVED", "事件1、解決。", esc(d.explanation))}
    ${robot("私の検査は、20秒後しか見ていなかった。走る人の膝は、20秒も待ってくれないのに。……では、私の検査を鍛えてください。すり抜ける試作品を作れますか？", "shock")}
    <div class="why-grid">
      <div class="card">
        <div class="cam-head"><span>あなたが測った曲線（${SPEED_NAME[key.pushSeconds]}）</span><strong>点の線＝Bの正体の値で計算（答え合わせで開示）</strong></div>
        ${curveGraphSvg({ pushSeconds: key.pushSeconds, b: key.b, until: 99, yMax, big: true, error: v.error, bTrue: d.truth })}
        <p>${story.summary}</p>
      </div>
      <div class="card">
        <h2>もう一つの驚き：押し方で、差の大きさが変わる</h2>
        <table class="speeds">${t.rows
          .map((r) => `<tr class="${r.pushSeconds === t.best ? "best" : ""}"><td>${SPEED_NAME[r.pushSeconds]}</td><td class="num">${sgn(r.diff)}</td><td><span class="bar" style="width:${Math.round((Math.abs(r.diff) / max) * 110)}px"></span></td></tr>`)
          .join("")}</table>
        <p class="note">押し終わりの力の差（B−A。開示した値で計算、誤差なし）。</p>
        <p><strong>どの違いを調べたいかで、よい測り方が変わる。速く押せばよいとは限らない。</strong></p>
        <div class="actions"><button class="btn go big" data-act="to-c2">事件2：今度は、あなたが仕掛ける</button></div>
      </div>
    </div>
  </section>`;
}

function meterRow(title: string, tag: string, a: number, b: number, diff: number, ok: boolean, kind: "robot" | "hidden" | "final", pass: number, range: number, goal: string, unit = "", digits = 3): string {
  return `<div class="meter ${ok ? "ok" : "ng"}">
    <div class="meter-head"><strong>${title}</strong><span class="tag t-${kind}">${tag}</span></div>
    ${diffMeterSvg(diff, kind, pass, range, unit)}
    <p class="meter-nums">A ${a.toFixed(digits)}${unit}／あなた ${b.toFixed(digits)}${unit}　差 ${sgn(diff, digits)}${unit}　<span class="goal">目標：${goal}</span> <span class="ok-mark">${ok ? "✓" : "・"}</span></p>
  </div>`;
}

function renderDuel(): string {
  const round = DUEL_ROUNDS[state.duelRound]!;
  const p = duelMaterial(state.e1, state.tau);
  const r = judgeDuel(round, p);
  const scanning = state.duelPhase === "scan";
  const shown = state.duelPhase === "result" ? state.duelResult : null;
  const prevFails = state.duelRound === 1 && state.duelLog.length > 0;
  const lines = [
    meterRow(`ロボが見るところ：${round.robot.label}`, "目標：ここは小さく（ロボに同じと見せる）", r.robot.a, r.robot.b, r.robot.diff, r.robot.ok, "robot", ROBOT_PASS, 0.6, `差の大きさ ${ROBOT_PASS} 以下`),
    meterRow(`あなたが隠す違い：${round.hidden.label}`, "目標：ここは大きく（違いを残す）", r.hidden.a, r.hidden.b, r.hidden.diff, r.hidden.ok, "hidden", HIDDEN_NEED, 0.6, `差の大きさ ${HIDDEN_NEED} 以上`),
    meterRow(`最後の検査：${FINAL_CHECK.label}`, "事件1のいつもの検査", r.final.a, r.final.b, r.final.diff, r.final.ok, "final", 0.03, 0.3, "差 0.03 以内"),
  ];
  return `<section>
    ${kicker(`DUEL ${round.id} / ${round.id === 1 ? "THE QUICK CHECK" : "A DIFFERENT VIEW"}`, round.id === 1 ? "検査を鍛える：すり抜ける試作品をつくれ。" : "ロボが検査の手順を更新した。次の一手は？", round.id === 1 ? "ロボの検査では見本と同じに見えるのに、別の瞬間には違いが残る試験用のクッションをつくる。見逃しを見つけて、検査を強くするためのテストです。" : "前のラウンドの試作品は、もう通らない。")}
    ${robot(scanning ? "設計を固定しました。宣言した測り方で、検査を始めます。" : shown ? (shown.cleared ? "私の検査では、区別できません。……でも、別の測り方なら違う？" : !shown.robot.ok || !shown.final.ok ? "見つけました。その素材は、見本と違います。" : "区別できません。……でも、隠す違いも残っていませんね。見本と同じものを出しても、すり抜けたことにはなりません。") : round.robotLine, scanning ? "scan" : shown ? (shown.cleared ? "shock" : "smug") : "calm")}
    ${prevFails && state.duelPhase === "design" && !judgeDuel(round, duelMaterial(state.duelLog[state.duelLog.length - 1]!.e1, state.duelLog[state.duelLog.length - 1]!.tau)).cleared && state.e1 === state.duelLog[state.duelLog.length - 1]!.e1 && state.tau === state.duelLog[state.duelLog.length - 1]!.tau ? `<p class="bet-line">前のラウンドで通った素材は、この測り方では見つかってしまう。つまみを動かして作り直そう。</p>` : ""}
    <div class="duel-grid">
      <div class="card">
        <h2>試験用のクッションを調整</h2>
        ${(["e1", "tau"] as const)
          .map((k) => {
            const s = DUEL_SLIDERS[k];
            return `<label class="knob"><span>${s.label}<strong id="v-${k}">${state[k].toFixed(2)}</strong></span>
            <input type="range" id="k-${k}" data-knob="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state[k]}" ${scanning ? "disabled" : ""}></label>`;
          })
          .join("")}
        <p class="note">待ったあとも残るかたさは、見本と同じ 1 に固定。見本Aは、二つとも 1.00 です。最後の検査（事件1のいつもの検査）は、20秒たつと上乗せ分がほとんど消えるので、このつまみの範囲ではいつも通ります。</p>
        <button class="btn ghost small" data-act="duel-hint">${state.duelHint === 0 ? "調整のヒント" : state.duelHint === 1 ? "もう少しヒント" : "ヒント（最後）"}</button>
        ${state.duelHint >= 1 ? `<p class="hint-text">${round.id === 1 ? "すばやく押した直後は、押している短い間に上乗せ分がどれだけたまるかで決まる。2秒後は、その上乗せ分がどれだけ残っているかで決まる。「やわらぐ時間」を長くすると、どちらが大きく変わる？" : "2秒後に上乗せ分をほとんど残さないなら、やわらぐ時間を短めに。すばやく押した直後の高さは、上乗せのかたさで動かせる。"}</p>` : ""}
        ${state.duelHint >= 2 ? `<p class="hint-text">${round.id === 1 ? "例：やわらぐ時間を 2.8 前後にして、上乗せのかたさを少し下げて（0.9〜1.0）、ロボが見る瞬間の差を小さくする。" : "例：上乗せのかたさを 0.45、やわらぐ時間を 1.5 前後。"}</p>` : ""}
      </div>
      <div class="card">
        <div class="cam-head"><span>DESIGN PREVIEW / 設計の予測（誤差なしの計算）</span><strong>見本A と あなたの素材</strong></div>
        <div class="meters ${scanning ? "scanning" : ""}" id="meters">${scanning ? lines.slice(0, state.scanStep).join("") + `<div class="scan-line">測定中…</div>` : lines.join("")}</div>
        ${
          shown
            ? `<div class="result ${shown.cleared ? "win" : "lose"}">
              <p class="big">${shown.cleared ? "検査を、すり抜けた。" : !shown.robot.ok || !shown.final.ok ? "見つかった。" : "違いが残っていない。"}</p>
              <p>${shown.cleared ? `ロボの検査も最後の検査も通過。でも「${round.hidden.label}」には違いが残った。` : !shown.robot.ok ? `ロボが見る瞬間（${round.robot.label}）の差が、通過の幅 ±${ROBOT_PASS} を超えた。この瞬間の高さを決めるのは、どちらのつまみ？` : !shown.final.ok ? "最後の検査（20秒後）で見本と違った。" : `ロボは通った。でも「${round.hidden.label}」の差が小さすぎて、見本とほぼ同じ素材になっている。違いを残そう。`}</p>
              <div class="actions">${shown.cleared ? (state.duelRound === 0 ? `<button class="btn go" data-act="duel-next">次のラウンドへ</button>` : `<button class="btn go big" data-act="to-bridge">見方を変える：同じ式は、電気でも書ける</button>`) : `<button class="btn go" data-act="duel-retry">調整し直す</button>`}</div>
            </div>`
            : `<div class="actions"><button class="btn go big" data-act="duel-go" ${scanning ? "disabled" : ""}>この素材で、検査に挑む</button></div>`
        }
      </div>
    </div>
  </section>`;
}

function renderBridge(): string {
  const d = state.debrief!;
  const v = state.view!;
  const key = v.curves.find((c) => c.id === d.keyCurves[0]?.id) ?? v.curves[0]!;
  const story = storyFor(d.truth, d.base);
  return `<section>
    ${kicker("BRIDGE / SAME SHAPE", "同じ式は、電気回路でも書ける。", "事件1のBの「深さを保っている間の押し返す力」を、電気回路に置きかえると……")}
    <div class="why-grid">
      <div class="card">${carrySvg(d.truth, key.pushSeconds)}
        <p class="note">線：Bの押し返す力（開示した値で計算）　点線：見本A　紫の面：上乗せ分（回路では、コンデンサC1と抵抗Rを並列につないだ部分の電圧）。コンデンサ＝電荷をためる部品、抵抗＝電流の流れにくさ、電圧＝電気を押し出す力の差　丸：回路の電圧（同じ時間だけ一定の電流を流して止める）。変形↔電荷、押す速さ↔電流、押し返す力↔電圧と読みかえると、同じ式になる。素材の中に回路があるわけではない（式の形が同じだけ）。離した後のへこみの戻りは、回路には重ねていない。</p>
      </div>
      <div class="card">
        <h2>力の線と、電圧の丸が一本に重なる</h2>
        <p>${story.circuit}</p>
        <p><strong>では、本物の電気が流れている場所――神経細胞の膜――にも、同じ盲点はあるだろうか？</strong></p>
        <p class="note">膜では、イオンが動く（化学）と電流になり（電気）、膜電位（生物の信号のもと）が変わる。電荷がたまり、イオンが通り道を抜けるという電気の現象が、実際に起きている。</p>
        <div class="actions"><button class="btn go big" data-act="to-c3">事件3：膜の盲点へ</button></div>
      </div>
    </div>
  </section>`;
}

function memDiffAt(t: number): number {
  return deltaMv(CASE3_B, t) - deltaMv(BASE_MEM, t);
}

function renderC3Camera(): string {
  const found = state.memPhotos.some((p) => p.ok);
  const stopA = REST_MV + deltaMv(BASE_MEM, PULSE_MS);
  const stopB = REST_MV + deltaMv(CASE3_B, PULSE_MS);
  return `<section>
    ${kicker("CASE 03 / MEMBRANE", found ? "膜にも、盲点があった。" : "膜の盲点を、見破れ。", "膝の動きや押された感じは、神経の膜の電気で脳へ伝わる。ラボには、その神経細胞の膜の一部分を拡大した模型がある。新しい模型Bも、ロボの判定は「区別できません」。静止しているとき、細胞の中は外より約70 mV低い（−70 mV）。電極から同じ大きさの電流を膜Aと膜Bに100ミリ秒入れて止め、膜電位（膜の内と外の電位の差）がどう上がり、どう戻るかを見る。")}
    ${robot(found ? "その瞬間は……見ていなかった。私は、長く流した後の電位しか測っていません。" : `長く流した後（止める直前）の電位：膜A ${stopA.toFixed(1)} mV／膜B ${stopB.toFixed(1)} mV。差 ${(stopB - stopA).toFixed(2)} mV（${ROBOT_STEADY_TOL} mV 以内）。<strong>区別できません。</strong>`, found ? "shock" : "smug")}
    <div class="card cam">
      <div class="neuron">${NEURON_SVG}<p class="note">神経細胞の、枠で囲んだ膜の一部分を拡大して見る。左が基準の膜A、右が調べる膜B。</p></div>
      <div class="cam-head"><span>MEMBRANE CAMERA / 膜の断面（模型）</span><strong id="mem-time">流し始めから ${state.memT.toFixed(0)} ミリ秒${state.memT <= PULSE_MS ? "（電流を流している）" : "（止めた後）"}</strong></div>
      <div id="mem-live">${membraneCameraSvg(BASE_MEM, CASE3_B, state.memT, { a: "膜 A", b: "膜 B", bNote: "調べる膜" }, Math.abs(memDiffAt(state.memT)) > SEE_DIFF)}</div>
      <div id="mem-graph">${memGraphSvg(BASE_MEM, CASE3_B, state.memRan ? RECORD_MS : state.memT, state.memT, state.memPhotos.map((p) => p.t))}</div>
      <p class="note">＋と−：電流を入れて、静止時（−70 mV）から<strong>増えた分</strong>の電荷だけを描いている（静止時にも、内側に−・外側に＋の電荷がたまっている）。緑の柱：イオンの通り道。上向きの矢印：通り道から外へ出るイオンの正味の流れ。橙の矢印：電極から入れる電流。図は計算から描いた模式図、値は計算値（誤差なし）。時間は実際の神経の膜と同じ程度のミリ秒。</p>
      ${
        state.memRan
          ? `<div class="cam-ctl">
        <div class="chips">${MEM_CHIPS.map((t) => `<button class="chip ${state.memT === t ? "on" : ""}" data-act="mem-t" data-val="${t}">${t === 100 ? "止める直前" : t > 100 ? `止めて${t - 100}ms` : `${t}ms`}</button>`).join("")}</div>
        <label class="slider-row">流し始めから <input type="range" id="mem-t" min="0" max="${RECORD_MS}" step="1" value="${state.memT}"> ミリ秒</label>
      </div>
      <div class="actions"><button class="btn go" data-act="mem-photo">この瞬間を証拠にする</button><span class="note">膜電位の差が ${SEE_DIFF} mV を超えたら「違いが見えた」。</span></div>`
          : `<div class="actions"><button class="btn go big" data-act="mem-run">電流を入れて、止める</button></div>`
      }
    </div>
    ${state.memPhotos.length ? `<div class="photos">${state.memPhotos.map((p) => `<figure class="photo ${p.ok ? "ok" : ""}"><div class="ph-stamp">${p.ok ? "違いが見えた" : "区別できない"}</div><figcaption>${p.t <= PULSE_MS ? `流して${p.t}ms` : `止めて${p.t - PULSE_MS}ms`}<br>A ${p.a.toFixed(1)}／B ${p.b.toFixed(1)} mV<br>差 ${sgn(p.diff, 1)} mV</figcaption></figure>`).join("")}</div>` : ""}
    <div class="actions">${found ? `<button class="btn go big" data-act="to-c3why">なぜ違う？ 推理する</button>` : ""}</div>
  </section>`;
}

function renderC3Why(): string {
  const w = state.memWhy;
  return `<section>
    ${kicker("CASE 03 / WHY", w === "c" ? "膜Bは、容量が大きい膜だった。" : "膜Bは、どこが違う？", "膜の模型には、性質が二つある。どちらか一つだけが、膜Aと違う。")}
    <div class="why-grid">
      <div class="card">
        <h2>説明のカード</h2>
        <ul class="cands">
          <li class="cand ${w === "g" ? "out" : ""}" style="--c:var(--g-channel-edge)"><button class="cand-main" data-act="mem-why" data-val="g" ${w === "c" ? "disabled" : ""}><strong>イオンの通りやすさが違う</strong><span>通り道の数が違う＝抵抗が違う</span></button>${w === "g" ? `<span class="stamp">合わない</span>` : ""}</li>
          <li class="cand" style="--c:var(--g-accent)"><button class="cand-main" data-act="mem-why" data-val="c" ${w === "c" ? "disabled" : ""}><strong>膜の容量が違う</strong><span>容量＝電位を同じだけ上げるのに要る電荷の量</span></button>${w === "c" ? `<span class="stamp win">決着</span>` : ""}</li>
        </ul>
        ${
          w === "g"
            ? `<p class="check differ"><strong>それだと、記録と合わない。</strong>通りやすさだけが違うなら、長く流したときに落ち着く電位（上がり幅＝電流×抵抗）が変わり、写真で撮ったくらいの差（1 mV超）が止める直前にも残るはず。でも止める直前の差は ${(deltaMv(CASE3_B, PULSE_MS) - deltaMv(BASE_MEM, PULSE_MS)).toFixed(2)} mV だけだった。もう一つのカードは？</p>`
            : ""
        }
        ${
          w === "c"
            ? `<p class="check agree"><strong>この説明なら、記録と合う。膜Bは容量が ${CASE3_B.c} 倍（通りやすさは同じ）。</strong>同じ電流を入れても、より多くの電荷がたまらないと電位が上がらないので、上がるのも戻るのも遅い。流し続けて落ち着いた電位は同じなので、長く流した後だけを見ると区別できない。カメラの「＋」の数（増えた電荷）を見比べてみよう。</p>
               <p>戻るのにかかる時間の目安＝<strong>時定数</strong>は、容量×抵抗（膜A ${(10).toFixed(0)} → 膜B ${(10 * CASE3_B.c).toFixed(0)} ミリ秒）。止めた時の上がり分が半分になるまでの時間は、時定数の約0.7倍（${halfTimeMs(BASE_MEM).toFixed(1)} → ${halfTimeMs(CASE3_B).toFixed(1)} ミリ秒）。事件1の「上乗せ分がやわらぐ時間」と同じ形の量です。</p>
               <p class="note">電荷＝電気の量（ここではイオンが運ぶ）。実際の膜の容量は主に面積で決まり、同じ種類の膜なら面積あたりはほぼ一定。ここでは比べるために容量だけを変えた模型です。</p>
               <div class="actions"><button class="btn go big" data-act="to-c3duel">膜に、仕掛けろ</button></div>`
            : `<p class="note">ヒント：ロボの検査（長く流した後の電位）では、区別できなかった。それぞれの説明が正しければ、その値はどうなるはず？</p>`
        }
      </div>
      <div class="card">
        ${memGraphSvg(BASE_MEM, CASE3_B, RECORD_MS, null, state.memPhotos.map((p) => p.t))}
        <p class="note">点線＝膜A、線＝膜B。止める直前（100ミリ秒）はほぼ同じ。上がり方と戻り方が違う。</p>
      </div>
    </div>
  </section>`;
}

function renderC3Duel(): string {
  const round = MEM_ROUNDS[state.memRound]!;
  const m: Membrane = { g: state.g, c: state.c };
  const r = judgeMemDuel(round.id, m);
  const scanning = state.memPhase === "scan";
  const shown = state.memPhase === "result" ? state.memResult : null;
  const robotRow =
    round.id === 1
      ? meterRow(`ロボが見るところ：${round.robotLabel}`, "目標：ここは小さく", r.robot.a, r.robot.b, r.robot.diff, r.robot.ok, "robot", ROBOT_STEADY_TOL, 6, `差 ${ROBOT_STEADY_TOL} mV 以内`, " mV", 1)
      : meterRow(`ロボが見るところ：${round.robotLabel}`, "目標：ここは小さく", r.robot.a, r.robot.b, r.robot.diff, r.robot.ok, "robot", HALF_TIME_TOL, 12, `差 ${HALF_TIME_TOL} ms 以内`, " ms", 1);
  const hiddenRow =
    round.id === 1
      ? meterRow(`あなたが隠す違い：${round.hiddenLabel}`, "目標：ここは大きく", r.hidden.a, r.hidden.b, r.hidden.diff, r.hidden.ok, "hidden", HIDDEN1_NEED, 6, `差 ${HIDDEN1_NEED} mV 以上`, " mV", 1)
      : meterRow(`あなたが隠す違い：${round.hiddenLabel}`, "目標：ここは大きく", r.hidden.a, r.hidden.b, r.hidden.diff, r.hidden.ok, "hidden", HIDDEN2_NEED, 12, `差 ${HIDDEN2_NEED} mV 以上`, " mV", 1);
  const lines = [robotRow, hiddenRow];
  return `<section>
    ${kicker(`MEMBRANE DUEL ${round.id}`, round.id === 1 ? "膜に、仕掛けろ。" : "ロボが測り方を変えた。", round.id === 1 ? "イオンの通りやすさと膜の容量を調整して、ロボの検査をすり抜ける膜をつくれ。" : "今度は戻る速さを見られる。それでも違いを残せる？")}
    ${robot(scanning ? "設計を固定しました。検査を始めます。" : shown ? (shown.cleared ? "……区別できません。でも、あなたの膜は見本と違う。" : !shown.robot.ok ? "見つけました。その膜は、見本と違います。" : "区別できません。……でも、隠す違いも残っていませんね。") : round.robotLine, scanning ? "scan" : shown ? (shown.cleared ? "shock" : "smug") : "calm")}
    <div class="duel-grid">
      <div class="card">
        <h2>あなたの膜を調整</h2>
        ${(["g", "c"] as const)
          .map((k) => {
            const s = MEM_SLIDERS[k];
            return `<label class="knob"><span>${s.label}（膜Aの何倍）<strong id="v-${k}">×${state[k].toFixed(2)}</strong></span>
            <input type="range" id="k-${k}" data-knob="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state[k]}" ${scanning ? "disabled" : ""}></label>`;
          })
          .join("")}
        <p class="note">抵抗＝1÷通りやすさ（通りやすさ2倍なら抵抗は半分）。流し続けたときの上がり幅＝電流×抵抗、戻るのにかかる時間の目安（時定数）＝容量×抵抗。容量＝電位を同じだけ上げるのに要る電荷の量。</p>
        <button class="btn ghost small" data-act="mem-hint">${state.memHint === 0 ? "調整のヒント" : "もう少しヒント"}</button>
        ${state.memHint >= 1 ? `<p class="hint-text">${round.id === 1 ? "長く流した後の電位は、通りやすさだけで決まる。容量は、上がり方・戻り方の速さだけを変える。" : "戻る速さ（容量×抵抗）を同じに保ったまま、上がり幅（電流×抵抗）を変えるには？ 二つのつまみを同じ向きに動かしてみよう。"}</p>` : ""}
        ${state.memHint >= 2 ? `<p class="hint-text">${round.id === 1 ? "例：通りやすさ ×1.00 のまま、容量を ×2.5 か ×0.45 に。" : "例：通りやすさ ×0.7、容量 ×0.7（抵抗は大きく、容量は小さく。容量×抵抗は同じ）。"}</p>` : ""}
      </div>
      <div class="card">
        ${memGraphSvg(BASE_MEM, m, RECORD_MS, null)}
        <div class="meters ${scanning ? "scanning" : ""}" id="meters">${scanning ? lines.slice(0, state.memScan).join("") + `<div class="scan-line">測定中…</div>` : lines.join("")}</div>
        ${
          shown
            ? `<div class="result ${shown.cleared ? "win" : "lose"}">
            <p class="big">${shown.cleared ? "検査を、すり抜けた。" : !shown.robot.ok ? "見つかった。" : "違いが残っていない。"}</p>
            <p>${shown.cleared ? (round.id === 1 ? "落ち着いた電位は同じ。でも止めた直後の戻り方が違う。" : "戻る速さは同じ。でも電位の高さが違う。抵抗を大きく・容量を小さく（＝通りやすさと容量を同じ向きに小さく）すると、時定数（容量×抵抗）は同じでも、膜としては別物になる。") : !shown.robot.ok ? "ロボが見る値に、差が出すぎた。" : `ロボは通った。でも「${round.hiddenLabel}」の差が小さすぎる。違いを残そう。`}</p>
            ${shown.cleared && round.id === 2 ? `<p class="note">事件1の候補の一つ「上乗せのかたさが違う」素材も、回路に置きかえると抵抗とコンデンサの両方が変わり、その積（時定数）だけが同じになる。素材と膜で、同じ形の盲点。</p>` : ""}
            <div class="actions">${shown.cleared ? (state.memRound === 0 ? `<button class="btn go" data-act="mem-next">次のラウンドへ</button>` : `<button class="btn go big" data-act="to-finale">まとめへ</button>`) : `<button class="btn go" data-act="mem-retry">調整し直す</button>`}</div>
          </div>`
            : `<div class="actions"><button class="btn go big" data-act="mem-go" ${scanning ? "disabled" : ""}>この膜で、検査に挑む</button></div>`
        }
      </div>
    </div>
  </section>`;
}

function discovery(): string[] {
  const v = state.view;
  const d = state.debrief;
  const out: string[] = [];
  const ph = v?.photos.find((p) => p.distinguishable);
  out.push(`事件1 見破れ：ロボは「20秒後の力」で区別できなかった。${ph ? `離して${ph.h.toFixed(1)}秒後のへこみに差 ${sgn(ph.diff)}（判定幅 ${SHAPE_TOLERANCE}）を撮った。` : ""}`);
  if (d) out.push(`事件1 正体：${d.explanation}（押した回数 ${d.observationCount} 回。回数の多少は優劣ではない）`);
  const dl = state.duelLog;
  if (dl.length) out.push(`事件2 仕掛けろ：${dl.map((x) => `ラウンド${x.round}を 上乗せのかたさ ${x.e1.toFixed(2)}・やわらぐ時間 ${x.tau.toFixed(2)} で突破`).join("、")}`);
  const mp = state.memPhotos.find((p) => p.ok);
  if (mp) out.push(`事件3 膜：ロボは「長く流した後の電位」で区別できなかった。${mp.t <= PULSE_MS ? `流して${mp.t}ms` : `止めて${mp.t - PULSE_MS}ms`}後に差 ${sgn(mp.diff, 1)} mV を撮った。膜Bは容量が ${CASE3_B.c} 倍`);
  const ml = state.memLog;
  if (ml.length) out.push(`事件3 仕掛けろ：${ml.map((x) => `ラウンド${x.round}を 通りやすさ ×${x.g.toFixed(2)}・容量 ×${x.c.toFixed(2)} で突破`).join("、")}`);
  out.push("まだ言えないこと：これは教材が決めた式・値の範囲・誤差の決まりを前提にした結果。実物の材料や体の組織・膜の性質を、このモデルだけで決めたわけではない");
  return out;
}

function renderFinale(): string {
  return `<section>
    ${kicker("CASE CLOSED / BLIND SPOTS", "見方が変わると、盲点も変わる。", "三つの事件で見つけた盲点は、同じ形をしていた。")}
    ${robot("手順を一つに決めると、私には見えないものがある。……次の試作品は、どう測りますか？", "shock")}
    <div class="blind3">
      <div class="card"><p class="num">1</p><h3>最後の値だけ見ると</h3><p>途中の違い（上乗せの大きさ・やわらぐ速さ・戻る速さ）を見落とす。素材でも、膜でも。</p></div>
      <div class="card"><p class="num">2</p><h3>戻る速さ（時定数）だけ見ると</h3><p>高さの違い（上がり幅）を見落とす。時定数が同じでも、別物のことがある。</p></div>
      <div class="card"><p class="num">3</p><h3>測り方を変えると</h3><p>見える違いが変わる。違いを言うには、何をそろえて、いつ・どう測ったかを書く。</p></div>
    </div>
    <div class="card">
      <h2>今回の発見（記録から）</h2>
      <ul class="disc">${discovery().map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="actions"><button class="btn ghost" data-act="copy">${state.copied ? "コピーしました" : "文字でコピー"}</button><a class="btn ghost" href="lab.html">詳しい実験室で、自分で測り方を設計する</a><button class="btn ghost" data-act="restart">別の試料Bで、最初から</button></div>
      <p class="note">氏名などは集めていません。記録はこの実行中だけサーバーに置きます。</p>
    </div>
    <details class="card extra"><summary>おまけ：暴走する膜――もしも、イオンの通り道が「マイナスの抵抗」のように働いたら？（思考実験）</summary>
      ${thoughtSvg(true)}
      <p>抵抗をマイナスにすると、止めた後に基準へ戻らず、差が時間とともに大きくなる（グラフは枠の上端で止めている）。</p>
      <p class="note">ふつうの抵抗器や素材は、ひとりでにマイナスにはならない（エネルギーが湧いて出ることになる）。外からエネルギーを入れる仕組みがあるときだけ、マイナスの抵抗のように働く区間ができる。神経の膜では、電位が上がるとナトリウムの通り道が開いてさらに上がる（正のフィードバック）。この思考実験は、その跳ね上がりの始まりだけを直線で近づけたもの。マイナスなのは「電圧が少し上がったときの電流の変わり方（傾き）」で、部品の抵抗値そのものではない。実際の神経では通り道が電位と時間で開き閉じするので、跳ね上がりはやがて止まり、元に戻る（この模型にはその仕組みがない）。エネルギー源は、ポンプが保つイオンの濃さの差。</p>
    </details>
  </section>`;
}

function render(): void {
  const body: Record<Screen, () => string> = {
    title: renderTitle,
    "c1-verdict": renderVerdict,
    "c1-run": renderRun,
    "c1-camera": renderCamera,
    "c1-why": renderWhy,
    "c1-reveal": renderReveal,
    c2: renderDuel,
    bridge: renderBridge,
    "c3-camera": renderC3Camera,
    "c3-why": renderC3Why,
    "c3-duel": renderC3Duel,
    finale: renderFinale,
  };
  const y = window.scrollY;
  app.innerHTML = `${header()}<main class="g-wrap">${body[state.screen]()}<p class="foot">ゲーム試作・仮想の試料の計算例。検査ロボは決められた測定ルールで動きます。事件1の記録には測定誤差があり、事件2・3は誤差なしの計算です。</p></main>`;
  window.scrollTo(0, y);
}

function go(s: Screen): void {
  state.screen = s;
  state.error = "";
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
}

// ---------- 再生 ----------
function valueAt(pts: readonly { t: number; force: number }[], t: number): number {
  let last = 0;
  for (const p of pts) {
    if (p.t > t + 1e-9) break;
    last = p.force;
  }
  return last;
}

async function playRun(): Promise<void> {
  const c = curve()!;
  const T = c.pushSeconds;
  const reduce = reduceMotion();
  state.animating = true;
  go("c1-run");
  const seg = async (ms: number, f: (u: number) => void) => {
    const s0 = performance.now();
    for (;;) {
      const u = ms === 0 ? 1 : Math.min(1, (performance.now() - s0) / ms);
      f(u);
      render();
      if (u >= 1) break;
      await sleep(40);
    }
  };
  await seg(reduce ? 0 : 1200, (u) => {
    const t = u * T;
    state.pad = { phase: "push", press: u, dentA: 0, dentB: 0, forceA: valueAt(c.a, t), forceB: valueAt(c.b, t), highlight: false };
    state.clock = `押しています… ${t.toFixed(1)}秒`;
  });
  await seg(reduce ? 0 : 3600, (u) => {
    const h = u * HOLD_MAX;
    state.pad = { phase: "hold", press: 1, dentA: 0, dentB: 0, forceA: valueAt(c.a, T + h), forceB: valueAt(c.b, T + h), highlight: false };
    state.clock = `深さを保ったまま ${h.toFixed(1)}秒（早送り）：押し板は止まっているのに、力は下がる`;
  });
  await sleep(reduce ? 0 : 500);
  await seg(reduce ? 0 : 4200, (u) => {
    // 最初の6秒を一定の倍率でゆっくり、その後40秒まで速く
    const h = u < 0.75 ? (u / 0.75) * 6 : 6 + ((u - 0.75) / 0.25) * 34;
    const hh = Math.round(h * 2) / 2;
    const d = { a: dentAfterRelease(BASE, T, hh), b: c.recovery.find((p) => Math.abs(p.h - hh) < 1e-9)?.dent ?? 0 };
    state.pad = { phase: "release", press: 1, dentA: d.a, dentB: d.b, forceA: null, forceB: null, highlight: false };
    state.clock = `押し板を離した。離して ${hh.toFixed(1)} 秒（${hh <= 6 ? "1.4倍速" : "早送り"}）`;
  });
  state.recH = RECOVERY_MAX;
  state.animating = false;
  go("c1-camera");
}

function updateCamLive(): void {
  const c = curve();
  if (!c) return;
  const el = document.querySelector("#cam-live");
  if (el) el.innerHTML = padCameraSvg(camPad());
  const t = document.querySelector("#cam-time");
  if (t) t.textContent = `離して ${state.recH.toFixed(1)} 秒後`;
  const mini = document.querySelector("#mini-live");
  if (mini) mini.innerHTML = recoveryMiniSvg(c.recovery, (h) => dentAfterRelease(BASE, c.pushSeconds, h), state.recH, 40);
  const sl = document.querySelector<HTMLInputElement>("#rec-h");
  if (sl && Number(sl.value) !== state.recH) sl.value = String(state.recH);
  document.querySelectorAll<HTMLButtonElement>("[data-act=rec-h]").forEach((b) => b.classList.toggle("on", Math.abs(Number(b.dataset.val) - state.recH) < 1e-9));
}

function updateMemLive(): void {
  const el = document.querySelector("#mem-live");
  if (el) el.innerHTML = membraneCameraSvg(BASE_MEM, CASE3_B, state.memT, { a: "膜 A", b: "膜 B", bNote: "調べる膜" }, Math.abs(memDiffAt(state.memT)) > SEE_DIFF);
  const g = document.querySelector("#mem-graph");
  if (g) g.innerHTML = memGraphSvg(BASE_MEM, CASE3_B, state.memRan ? RECORD_MS : state.memT, state.memT, state.memPhotos.map((p) => p.t));
  const t = document.querySelector("#mem-time");
  if (t) t.textContent = `流し始めから ${state.memT.toFixed(0)} ミリ秒${state.memT <= PULSE_MS ? "（電流を流している）" : "（止めた後）"}`;
  const sl = document.querySelector<HTMLInputElement>("#mem-t");
  if (sl && Number(sl.value) !== state.memT) sl.value = String(state.memT);
  document.querySelectorAll<HTMLButtonElement>("[data-act=mem-t]").forEach((b) => b.classList.toggle("on", Number(b.dataset.val) === state.memT));
}

function updateKnobs(): void {
  if (state.screen === "c2") {
    for (const k of ["e1", "tau"] as const) {
      const v = document.querySelector(`#v-${k}`);
      if (v) v.textContent = state[k].toFixed(2);
    }
  } else {
    for (const k of ["g", "c"] as const) {
      const v = document.querySelector(`#v-${k}`);
      if (v) v.textContent = `×${state[k].toFixed(2)}`;
    }
  }
  // 予測の欄だけ描き直す（つまみの操作を途切れさせない）
  const html = state.screen === "c2" ? renderDuel() : renderC3Duel();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const cards = tmp.querySelectorAll(".duel-grid > .card");
  const live = document.querySelectorAll(".duel-grid > .card");
  if (cards[1] && live[1]) live[1].innerHTML = cards[1].innerHTML;
}

async function scan(kind: "c2" | "c3"): Promise<void> {
  const steps = kind === "c2" ? 3 : 2;
  const reduce = reduceMotion();
  if (kind === "c2") {
    state.duelPhase = "scan";
    state.duelResult = judgeDuel(DUEL_ROUNDS[state.duelRound]!, duelMaterial(state.e1, state.tau));
  } else {
    state.memPhase = "scan";
    state.memResult = judgeMemDuel(MEM_ROUNDS[state.memRound]!.id, { g: state.g, c: state.c });
  }
  for (let i = 0; i <= steps; i++) {
    if (kind === "c2") state.scanStep = i;
    else state.memScan = i;
    render();
    beep("scan");
    await sleep(reduce ? 0 : 850);
  }
  if (kind === "c2") {
    state.duelPhase = "result";
    if (state.duelResult!.cleared) {
      state.duelCleared[state.duelRound] = true;
      state.duelLog.push({ round: state.duelRound + 1, e1: state.e1, tau: state.tau });
    }
    beep(state.duelResult!.cleared ? "win" : "lose");
  } else {
    state.memPhase = "result";
    if (state.memResult!.cleared) {
      state.memCleared[state.memRound] = true;
      state.memLog.push({ round: state.memRound + 1, g: state.g, c: state.c });
    }
    beep(state.memResult!.cleared ? "win" : "lose");
  }
  render();
}

// ---------- 操作 ----------
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

async function startSession(body: Record<string, unknown>): Promise<void> {
  await guard(async () => {
    const r = await api.start(body);
    state.view = r.view;
    Object.assign(state, {
      bet: null,
      curveId: "",
      recH: RECOVERY_MAX,
      overlay: null,
      pickDraft: [],
      nextSpeed: null,
      nextChoice: null,
      hint: null,
      debrief: null,
      duelRound: 0,
      e1: 1,
      tau: 1,
      duelPhase: "design",
      duelResult: null,
      duelCleared: [false, false],
      duelHint: 0,
      duelLog: [],
      memT: 0,
      memRan: false,
      memPhotos: [],
      memWhy: null,
      memRound: 0,
      g: 1,
      c: 1,
      memPhase: "design",
      memResult: null,
      memCleared: [false, false],
      memHint: 0,
      memLog: [],
      copied: false,
    });
    state.screen = "c1-verdict";
  });
}

async function animateCurve(): Promise<void> {
  const c = curve()!;
  const reduce = reduceMotion();
  state.animating = true;
  const total = c.pushSeconds + HOLD_MAX;
  const ms = reduce ? 0 : 3200;
  const s0 = performance.now();
  for (;;) {
    const u = ms === 0 ? 1 : Math.min(1, (performance.now() - s0) / ms);
    state.drawUntil = u * total;
    render();
    if (u >= 1) break;
    await sleep(40);
  }
  state.drawUntil = 99;
  state.animating = false;
  render();
}

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "rec-h") {
    state.playToken += state.playToken % 2; // 再生中なら止める
    state.recH = Number(t.value);
    updateCamLive();
  } else if (t.id === "mem-t") {
    state.memT = Number(t.value);
    updateMemLive();
  } else if (t.dataset.knob) {
    const k = t.dataset.knob as "e1" | "tau" | "g" | "c";
    state[k] = Number(t.value);
    if (state.screen === "c2") state.duelPhase = "design";
    else state.memPhase = "design";
    updateKnobs();
  }
});

app.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = el.dataset.act!;
  const v = state.view;
  switch (act) {
    case "sound":
      state.sound = !state.sound;
      render();
      break;
    case "start":
      await startSession({});
      break;
    case "start-teacher": {
      const pass = (document.querySelector<HTMLInputElement>("#t-pass")?.value ?? "").trim();
      const cause = document.querySelector<HTMLSelectElement>("#t-cause")?.value || undefined;
      const seedText = document.querySelector<HTMLInputElement>("#t-seed")?.value.trim();
      await startSession({ teacherPassphrase: pass, cause, seed: seedText ? Number(seedText) : undefined });
      break;
    }
    case "bet":
      state.bet = el.dataset.val as PredictionChoice;
      render();
      break;
    case "run":
      if (!v || !state.bet) return;
      state.boardView = v;
      await guard(async () => {
        const r = await api.observeCurve(v.sessionId, 1, crypto.randomUUID(), state.bet!, "");
        state.view = r.view;
        state.curveId = r.curveId;
      });
      if (state.curveId) await playRun();
      break;
    case "rec-h":
      state.recH = Number(el.dataset.val);
      state.playToken += state.playToken % 2;
      updateCamLive();
      break;
    case "rec-play": {
      if (state.playToken % 2 === 1) {
        state.playToken++;
        render();
        return;
      }
      const token = ++state.playToken;
      render();
      const s0 = performance.now();
      const ms = reduceMotion() ? 0 : 4300; // 0〜6秒を約1.4倍速
      for (;;) {
        if (state.playToken !== token) return;
        const u = ms === 0 ? 1 : Math.min(1, (performance.now() - s0) / ms);
        state.recH = Math.round(u * 6 * 2) / 2;
        updateCamLive();
        if (u >= 1) break;
        await sleep(40);
      }
      if (state.playToken === token) state.playToken++;
      render();
      break;
    }
    case "photo":
      if (!v) return;
      state.playToken += state.playToken % 2;
      await guard(async () => {
        const before = v.photos.some((p) => p.distinguishable);
        state.view = (await api.photo(v.sessionId, state.curveId, state.recH)).view;
        const now = state.view.photos.find((p) => p.curveId === state.curveId && Math.abs(p.h - state.recH) < 1e-9);
        beep("shutter");
        if (now?.distinguishable && !before) setTimeout(() => beep("win"), 160);
      });
      break;
    case "to-why":
      state.pickDraft = [];
      state.overlay = null;
      go("c1-why");
      break;
    case "overlay":
      state.overlay = state.overlay === el.dataset.id ? null : (el.dataset.id as CandidateId);
      render();
      break;
    case "toggle-pick": {
      const id = el.dataset.id as CandidateId;
      state.pickDraft = state.pickDraft.includes(id) ? state.pickDraft.filter((x) => x !== id) : [...state.pickDraft, id];
      render();
      break;
    }
    case "submit-pick":
    case "pick-unsure":
      if (!v) return;
      await guard(async () => {
        state.view = (await api.pick(v.sessionId, state.curveId, act === "pick-unsure" ? "unsure" : state.pickDraft)).view;
        state.pickDraft = [];
        state.boardView = null;
        if (state.view.overall === "narrowed") beep("win");
      });
      break;
    case "show-curve":
      state.curveId = el.dataset.id!;
      state.overlay = null;
      render();
      break;
    case "next-speed":
      state.nextSpeed = Number(el.dataset.val) as Push;
      render();
      break;
    case "next-choice":
      state.nextChoice = el.dataset.val as PredictionChoice;
      render();
      break;
    case "push-again":
      if (!v || !state.nextSpeed || !state.nextChoice) return;
      state.boardView = v;
      await guard(async () => {
        const r = await api.observeCurve(v.sessionId, state.nextSpeed!, crypto.randomUUID(), state.nextChoice!, "");
        state.view = r.view;
        state.curveId = r.curveId;
        state.overlay = null;
        state.nextSpeed = null;
        state.nextChoice = null;
        state.hint = null;
      });
      await animateCurve();
      break;
    case "hint":
      if (!v) return;
      await guard(async () => {
        const r = await api.hint(v.sessionId);
        state.view = r.view;
        state.hint = r.hint;
      });
      break;
    case "reveal":
      if (!v) return;
      await guard(async () => {
        const r = await api.finish(v.sessionId);
        state.view = r.view;
        state.debrief = r.debrief;
      });
      if (state.debrief) go("c1-reveal");
      break;
    case "to-c2":
      state.duelRound = 0;
      state.duelPhase = "design";
      go("c2");
      break;
    case "duel-go":
      await scan("c2");
      break;
    case "duel-retry":
      state.duelPhase = "design";
      state.duelResult = null;
      render();
      break;
    case "duel-next":
      state.duelRound = 1;
      state.duelPhase = "design";
      state.duelResult = null;
      state.duelHint = 0;
      go("c2");
      break;
    case "duel-hint":
      state.duelHint = Math.min(2, state.duelHint + 1);
      render();
      break;
    case "to-bridge":
      go("bridge");
      break;
    case "to-c3":
      state.memT = 0;
      go("c3-camera");
      break;
    case "mem-run": {
      const reduce = reduceMotion();
      const ms = reduce ? 0 : 5200;
      const s0 = performance.now();
      for (;;) {
        const u = ms === 0 ? 1 : Math.min(1, (performance.now() - s0) / ms);
        state.memT = Math.round(u * RECORD_MS);
        updateMemLive();
        if (u >= 1) break;
        await sleep(40);
      }
      state.memRan = true;
      state.memT = RECORD_MS;
      render();
      break;
    }
    case "mem-t":
      state.memT = Number(el.dataset.val);
      updateMemLive();
      break;
    case "mem-photo": {
      const t = state.memT;
      if (state.memPhotos.some((p) => p.t === t)) return;
      const a = REST_MV + deltaMv(BASE_MEM, t);
      const b = REST_MV + deltaMv(CASE3_B, t);
      const before = state.memPhotos.some((p) => p.ok);
      state.memPhotos.push({ t, a, b, diff: b - a, ok: Math.abs(b - a) > SEE_DIFF });
      beep("shutter");
      if (Math.abs(b - a) > SEE_DIFF && !before) setTimeout(() => beep("win"), 160);
      render();
      break;
    }
    case "to-c3why":
      go("c3-why");
      break;
    case "mem-why":
      state.memWhy = el.dataset.val as "g" | "c";
      if (state.memWhy === "c") beep("win");
      render();
      break;
    case "to-c3duel":
      state.memRound = 0;
      state.memPhase = "design";
      go("c3-duel");
      break;
    case "mem-go":
      await scan("c3");
      break;
    case "mem-retry":
      state.memPhase = "design";
      state.memResult = null;
      render();
      break;
    case "mem-next":
      state.memRound = 1;
      state.memPhase = "design";
      state.memResult = null;
      state.memHint = 0;
      go("c3-duel");
      break;
    case "mem-hint":
      state.memHint = Math.min(2, state.memHint + 1);
      render();
      break;
    case "to-finale":
      go("finale");
      break;
    case "copy":
      try {
        await navigator.clipboard.writeText(["ミカタ・ラボ 今回の発見", ...discovery().map((x) => `・${x}`)].join("\n"));
        state.copied = true;
      } catch {
        state.error = "コピーできませんでした。画面の文字を選んでコピーしてください。";
      }
      render();
      break;
    case "restart":
      state.screen = "title";
      state.view = null;
      render();
      break;
  }
});

status().then((s) => {
  state.claude = s.claude;
  render();
});
render();
