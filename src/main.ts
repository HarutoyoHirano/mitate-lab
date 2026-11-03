// ミカタ・ラボの画面。サーバーから受け取る公開ビューだけで描く。
import { BASE, CANDIDATE_IDS, CANDIDATES, PUSH_SECONDS, TEST_TOLERANCE, judgeAgainstBase, type CandidateId, type PushSeconds } from "../server/model/public.js";
import { forceAfterPush, forceDuringPush } from "../server/model/sls.js";
import type { Permeability } from "../server/model/circuit.js";
import { MISSIONS, missionResult, SLIDERS, testDiffs, type MissionId } from "../server/model/make.js";
import { act2Answer, act2GraphSvg, carrySvg, circuitSvg, membraneSvg, GUESS_LABEL, PERM_LABEL, RUN_COLORS, runAct2, thoughtSvg, THOUGHT_GUESS_LABEL, type Act2Guess, type Act2Run, type Lens, type ThoughtGuess } from "./act2.js";
import { api, status, type Debrief, type Hint, type PredictionChoice, type PublicSessionView, type Translation } from "./api.js";
import { benchSvg, CAND_COLOR, dentCloseupSvg, recoveryGraphSvg, SPEED_LABEL } from "./draw.js";
import { dentAfterRelease, judgePhoto, RECOVERY_MAX, RECOVERY_STEP, SHAPE_TOLERANCE } from "../server/model/recovery.js";
import { curveGraphSvg, HOLD_MAX, makeGraphSvg, makeYMax, shapeThumb } from "./curve.js";
import { fitCandidate, predictedCurve } from "../server/model/fit.js";
import { compare } from "../server/model/comparator.js";
import { decisiveNote, pushSpeedTable, storyFor } from "./story.js";
import type { MaterialParams } from "../server/model/public.js";

type Phase = "start" | "intro" | "lab" | "debrief" | "make" | "act2" | "reflect" | "done";
type CurveView = PublicSessionView["curves"][number];

const SHAPE_LABEL: Record<PredictionChoice, string> = { same: "ほぼ同じ", higher: "Bが高い", lower: "Bが低い", unknown: "まだ分からない", midSame: "途中も同じ", midDiffer: "途中は違うかも" };
const DIR_WORD: Record<"same" | "higher" | "lower", string> = { same: "Aとほぼ同じ", higher: "Aより高い", lower: "Aより低い" };

/** この説明が正しければ、曲線のどこがどう違うか */
const LOOKS: Record<CandidateId, string> = {
  overall: "20秒待ったあとも、Aの線とずれたまま",
  instant: "押し終わりの高さが違う。上乗せ分が半分になるまでの時間はAと同じで、待つと重なる",
  relax: "上乗せ分が半分になるまでの時間が違う（そのため押し終わりの高さも変わりうる）。待つと重なる",
  same: "どの押し方でも、Aの線と重なる",
};

const state = {
  phase: "start" as Phase,
  claude: false,
  view: null as PublicSessionView | null,
  /** 押している間は、判定（候補の状態）を押す前のまま見せる。曲線を見終わってから明かす */
  boardView: null as PublicSessionView | null,
  push: 0.2 as PushSeconds,
  choice: null as PredictionChoice | null,
  /** 曲線を見たあと、本人が「合わなくなった」と選んでいる説明（検算の前） */
  pickDraft: [] as CandidateId[],
  /** Claudeが参照した記録を強調する */
  highlight: null as { curveId: string; times: number[] } | null,
  hookDone: false,
  /** 離した後の戻りで、いま見ている時刻（離してからの秒） */
  recH: 2,
  /** 押し板を上げた後か（試験機にへこみを描く） */
  released: false,
  /** 離して戻る様子を再生している間 */
  releasing: false,
  /** 曲線の欄で見ているもの：押し返す力（深さを保つ間）／へこみの戻り（離した後） */
  graphTab: "force" as "force" | "dent",
  /** 「この説明で重ねてみる」で重ねている候補 */
  overlay: null as CandidateId | null,
  hookArrow: NaN,
  reason: "",
  busy: false,
  animating: false,
  press: 0,
  benchTarget: "B" as "A" | "B" | "both",
  flash: false,
  clock: "",
  arrows: null as { a: number; b: number } | null,
  introDone: false,
  shownCurveId: null as string | null,
  drawUntil: 0,
  hint: null as Hint | null,
  translation: null as Translation | null,
  myCandidates: [] as CandidateId[],
  stampNow: [] as CandidateId[],
  error: "",
  debrief: null as Debrief | null,
  mission: "hideFromUsual" as MissionId | "free",
  mat: { eInf: 1, e1: 1, tau: 1 },
  passed: { hideFromUsual: false, hideFromQuick: false } as Record<MissionId, boolean>,
  stampMission: false,
  lens: "circuit" as Lens,
  lensFlip: false,
  perm: "easier" as Permeability,
  act2Guess: null as Act2Guess | null,
  act2Runs: [] as Act2Run[],
  act2Saved: false,
  thoughtGuess: null as ThoughtGuess | null,
  thoughtShown: false,
  thoughtOpen: false,
  freshBanner: false,
  /** 膜の図のアニメーション（電流を入れ始めてからの時刻） */
  memRun: null as Permeability | null,
  memT: null as number | null,
  copied: false,
};

const app = document.querySelector<HTMLDivElement>("#app")!;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** 候補名を並べる（候補名の中に「違う」があるので、「」で区切る） */
function candList(ids: readonly CandidateId[]): string {
  return ids.map((id) => `「${CANDIDATES[id].label}」`).join("");
}

function speedName(T: number): string {
  return `${SPEED_LABEL[T]}（${T}秒）`;
}

const STEPS: { id: Phase[]; label: string }[] = [
  { id: ["intro"], label: "いつもの検査" },
  { id: ["lab"], label: "曲線で見抜く" },
  { id: ["debrief"], label: "答え合わせ" },
  { id: ["make"], label: "素材をつくる" },
  { id: ["act2"], label: "見方を変える" },
  { id: ["reflect", "done"], label: "振り返り" },
];

function topbar(): string {
  const cur = STEPS.findIndex((s) => s.id.includes(state.phase));
  return `<header class="topbar">
    <div class="brand">ミカタ・ラボ <span class="sub-brand">詳しい実験室</span> <a class="to-game" href="./">ゲーム版へ</a></div>
    ${state.phase === "start" ? `<div class="spacer"></div>` : `<ol class="steps">${STEPS.map((s, i) => `<li class="${i < cur ? "done" : i === cur ? "now" : ""}"><span>${i + 1}</span>${s.label}</li>`).join("")}</ol>`}
    <span class="ai-badge ${state.claude ? "" : "off"}">${state.claude ? "Claude（AI）が相棒として参加中" : "Claude（AI）は休止中：定型のヒントで進めます"}</span>
  </header>`;
}

// ---------- いまの目的・次にやること ----------
function missionBar(): string {
  const v = state.view;
  let goal = "";
  let next = "";
  if (state.phase === "intro") {
    goal = "いつもの検査で、試料Bが見本Aと区別できるかを確かめる";
    next = state.introDone ? "「途中を見てみる」を押す" : "Bを押して、20秒後の値を測っています";
  } else if (state.phase === "lab" && v) {
    const c = latestCurve();
    goal = "押してからの押し返しの変化（曲線）を見て、いつもの検査が見落としていた違いを見つけ、なぜ違うのかを絞り込む";
    if (state.animating) next = "曲線が伸びていくのを見る。Aの線（点線）と、どこでずれて、どこで重なる？";
    else if (c && c.studentPick === null && !v.photos.some((p) => p.curveId === c.id)) next = "「② へこみの戻り」で「離してから〔 〕秒」のつまみを動かし、AとBのへこみに違いが見える時刻を探して「この瞬間を撮る」";
    else if (c && c.studentPick === null) next = state.graphTab === "dent" ? "撮れたら「① 押し返す力」に戻り、右の候補から、この曲線と合わなくなった説明を選んで検算する" : "右の候補から「この曲線と合わなくなった説明」を選んで、検算する（分からなければ「分からない」）";
    else if (v.overall === "narrowed") next = "決着しました。「答え合わせへ」で、Bの正体を確かめる（別の速さで確かめてもよい）";
    else if (!state.choice) next = v.curves.length === 0 ? "① 押す速さを選ぶ → ② 深さを保っている間もAと同じかを予想する → ③ 押して、曲線を見る" : "① 押す速さを選ぶ → ② 押し終わりの力（曲線の高さ）を予想する → ③ 押して、曲線を見る";
    else next = "予想を選びました。押して、曲線が伸びていくのを見る";
  } else if (state.phase === "debrief") {
    goal = "Bの正体と、どの押し方が決め手になったかを確かめる";
    next = "読み終えたら「素材をつくってみる」へ";
  } else if (state.phase === "make") {
    goal = "わかったことを使って、条件に合う素材を自分でつくる";
    next = "つまみを動かして、二つの検査の判定が変わるのを見る。両方の条件がそろえばミッション達成";
  } else if (state.phase === "act2") {
    goal = "調べたBを電気回路に置きかえ、その時間の変化が細胞の膜ではどう見えるかを確かめる";
    next = act2Answer(state.act2Runs) ? "結果を見たら振り返りへ（思考実験は「さらに先」）" : "予想を保存して、「そのまま」と「通りやすくする」を両方試す";
  } else if (state.phase === "reflect" || state.phase === "done") {
    goal = "今回の発見を一枚にまとめる";
    next = "自動で埋まった欄を確かめ、一言ずつ足して保存する";
  }
  if (!goal) return "";
  return `<div class="mission"><div><span class="m-label">いまの目的</span>${goal}</div><div><span class="m-label next">次にやること</span>${next}</div></div>`;
}

// ---------- 開始画面 ----------
function renderStart(): string {
  const a0 = forceAfterPush(BASE, 1, 0);
  return `${topbar()}<main class="wrap"><section class="start">
    <div class="start-copy">
      <p class="kicker">見方を変える実験室</p>
      <h1>同じに見える。<br>でも、測り方を変えると違う。</h1>
      <p class="lead start-q">体に触れる柔らかいパッドA・B。押して20秒後の力は同じ。<br><strong>押している途中も、離したあとの戻り方も同じ？</strong></p>
      <div class="body-hook">
        <p class="hook-q">ゲルのような軟らかい試験片（見本A）を、試験機で押し込み、その深さで止めます。押し返す力も同じままでしょうか？</p>
        ${
          state.hookDone
            ? `<p><strong>押し板は同じ深さで止まったまま。なのに、押し返す力は ${a0.toFixed(2)} から ${forceAfterPush(BASE, 1, 20).toFixed(2)} へ下がりました。</strong></p>
               <p class="note">深さは固定、測っているのは押し返す力。この素材には「時間とともに押し返しがやわらぐ」性質があります。医療の計測でも、いつ・どう測るかで見える性質が変わることがあります。</p>
               <details class="spring"><summary>ばねならどうなる？</summary><p class="note">ふつうのばねは、深さを保てば押し返す力は一定のまま（力＝かたさ×深さ）で、離せばすぐ元の長さに戻ります。止めたのに力が下がるのは、ばねだけでは説明できない、時間がかかわる性質です。</p></details>`
            : `<div class="actions"><button class="btn" data-act="hook" ${state.animating ? "disabled" : ""}>Aを押し込んで、深さを保つ</button></div>`
        }
      </div>
      <p>ミカタ・ラボでは、性質が分かっている<strong>見本A</strong>と、調べたい<strong>試料B</strong>を比べます。</p>
      <ol class="goals">
        <li><strong>違いを見抜く</strong>：いつもの検査では区別できなくても、押し方を変えると見える違いを見つける</li>
        <li><strong>理由を説明する</strong>：何が違うのかを、曲線を証拠にして言う</li>
        <li><strong>素材をつくる</strong>：わかったことを使って、検査をすり抜ける素材をつくる</li>
        <li><strong>見方をつなぐ</strong>：調べたBを電気回路に置きかえ、細胞の膜の言葉で言い直す</li>
      </ol>
      <div class="actions"><button class="btn big" data-act="start">実験を始める</button></div>
      <p class="note">パッドは計算で作った仮想の素材で、電極ではありません。ここでは同じ素材の試験片で調べます。試験片は計算で作った仮想の素材です（Aを押して十分に待ったあとの力を1とする目盛り）。実在の材料や体の組織、試験機を再現したものではありません。画面の「Claude（AI）」はAIで、隠れた答えを知りません。</p>
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
      ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    </div>
    <div class="pane bench-pane bench hero-bench">${benchSvg("A", state.press, false, Number.isFinite(state.hookArrow) ? { a: state.hookArrow, b: NaN } : null)}
      <p class="bench-cap">${state.clock || "試験機：押し板で試験片を押し込み、力センサで押し返す力を測る（右の矢印の長さ＝押し返す力）。<br><strong>A＝見本</strong>（性質が分かっている）　<strong>B＝試料</strong>（調べたい）。見た目はそっくり"}</p></div>
  </section></main>`;
}

// ---------- いつもの検査 ----------
function renderIntro(): string {
  const v = state.view!;
  const r = v.intro;
  return `${topbar()}<main class="wrap">${missionBar()}<section class="intro">
    <div class="pane bench-pane bench">${benchSvg("B", state.press, state.flash, { a: NaN, b: state.introDone ? r.force : NaN })}</div>
    <div class="intro-side">
      <p class="clock">${state.clock || "いつもの検査：ふつう（1秒）に押して、20秒後の値を測る"}</p>
      <p class="note">いつもの検査は、Bの20秒後の値を、見本Aの<strong>あらかじめ分かっている値</strong>と比べます。</p>
      <details class="rule-detail"><summary>「区別できない」の決まり</summary><p class="note">差が ±${r.tolerance} 以内なら「見本と区別できない」とする――これが<strong>検査の決まり（判定の許容差）</strong>です。Aは基準カードの値で、測りません。それとは別に、測るたびに値は最大 ±${v.error} ぶれます（<strong>測定の誤差</strong>）。</p></details>
      <div class="twin">
        <div class="meter ghost"><span class="tag">見本 A（基準カードの値）</span><strong>${r.base.toFixed(3)}</strong></div>
        <div class="meter"><span class="tag">試料 B（測定）</span><strong>${state.introDone ? r.force.toFixed(3) : "—"}</strong></div>
      </div>
      ${
        state.introDone
          ? `<p class="diffline">差 ${r.diff >= 0 ? "+" : "−"}${Math.abs(r.diff).toFixed(3)}（許容差 ±${r.tolerance} ${r.indistinguishable ? "の内側" : "の外側"}）</p>
             <p class="same">${r.indistinguishable ? "判定：見本と区別できない。…本当に同じ？" : "判定：見本と違う"}</p>
             <p>${r.indistinguishable ? "いつもの検査では、BをAと区別できませんでした。ただし「同じ素材」と決まったわけではありません。" : ""}<br><strong>いつもの検査は、押してから20秒後しか見ていません。</strong>押している途中や、離したあとの戻り方では、何が起きているのでしょう？</p>
             <div class="actions"><button class="btn big" data-act="to-lab">途中を見てみる</button></div>`
          : `<p class="note">押して、そのまま20秒待っています（早送り）。</p>`
      }
    </div>
  </section></main>`;
}

// ---------- 曲線で見抜く ----------
function latestCurve(): CurveView | null {
  const v = state.view;
  return v ? (v.curves[v.curves.length - 1] ?? null) : null;
}

function shownCurve(): CurveView | null {
  const v = state.view!;
  if (state.shownCurveId) return v.curves.find((c) => c.id === state.shownCurveId) ?? null;
  return latestCurve();
}

function yMaxFor(v: PublicSessionView): number {
  let m = 2.2;
  for (const c of v.curves) for (const p of c.b) m = Math.max(m, p.force + 0.2);
  for (const T of PUSH_SECONDS) m = Math.max(m, forceDuringPush(BASE, T, T) + 0.2);
  return Math.min(4, Math.ceil(m * 2) / 2);
}

/** 本人がまだ「合わなくなった説明」を選んでいない曲線があるか（あれば、候補の判定は開かない） */
function awaitingPick(): CurveView | null {
  const c = latestCurve();
  return c && c.studentPick === null && !state.animating ? c : null;
}

function renderLab(): string {
  const v = state.view!;
  const waiting = awaitingPick();
  // 本人が選ぶまでは、押す前の判定のまま見せる
  const bv = (state.animating || waiting) && state.boardView ? state.boardView : v;
  const narrowed = bv.overall === "narrowed";
  const lock = state.animating || state.busy || !!waiting;
  const curve = shownCurve();
  const yMax = yMaxFor(v);
  const T = curve?.pushSeconds ?? state.push;
  const until = state.animating ? state.drawUntil : T + HOLD_MAX;
  const hl = state.highlight && curve && state.highlight.curveId === curve.id ? state.highlight.times : [];
  return `${topbar()}<main class="wrap">${missionBar()}<section class="lab">
    <div class="pane bench-pane">
      <div class="bench" id="lab-bench">${labBench()}</div>
      <div class="recorder ${state.animating ? "lit" : ""}" aria-live="polite"><span class="cam" aria-hidden="true"></span><span class="rec-label">${state.clock || "押し返しの記録計"}</span></div>
      <div class="choose">
        <div><div class="field-label">① 押す速さ</div>
          <div class="seg speed">${PUSH_SECONDS.map((x) => `<button data-set="push" data-val="${x}" aria-pressed="${x === state.push}" ${lock ? "disabled" : ""}>${SPEED_LABEL[x]}<small>${x}秒で押す</small></button>`).join("")}</div>
        </div>
        <div><div class="field-label">${v.curves.length === 0 ? "② 予想：20秒後は区別できなかったB。<strong>深さを保っている間（押し終わって0.5〜5秒）</strong>も同じ？" : "② 予想：Bの<strong>押し終わりの力（曲線の高さ）</strong>は、Aと比べて？"}</div>
          <div class="shapes">${(v.curves.length === 0 ? (["midSame", "midDiffer", "unknown"] as PredictionChoice[]) : (["same", "higher", "lower", "unknown"] as PredictionChoice[])).map((c) => `<button class="shape" data-set="choice" data-val="${c}" aria-pressed="${state.choice === c}" ${lock ? "disabled" : ""}>${shapeThumb(c)}<span>${SHAPE_LABEL[c]}</span></button>`).join("")}</div>
        </div>
        <input class="reason" id="reason" maxlength="200" placeholder="そう思った理由（ひとこと・任意）" value="${esc(state.reason)}" ${lock ? "disabled" : ""}>
        <div class="go-row">
          <button class="btn go" data-act="observe-curve" ${!state.choice || lock ? "disabled" : ""}>③ 押して、曲線を見る</button>
          ${state.claude ? `<button class="btn claude" data-act="claude-observe" ${!state.choice || lock ? "disabled" : ""} title="予想を選んだこの押し方を、Claude（AI）が許可された操作で実行します">相棒に押してもらう</button>` : ""}
        </div>
      </div>
    </div>
    <div class="pane graph-pane">
      <div class="graph-head"><h2>${curve ? `${speedName(curve.pushSeconds)}押したときの押し返し` : "押し返しの変化（曲線）"}</h2><span class="count">押した回数 ${v.curves.length}</span></div>
      ${resultBanner(curve)}
      ${curve && (!state.animating || state.releasing) ? graphTabs() : ""}
      ${curve && state.graphTab === "dent" && (!state.animating || state.releasing) ? recoveryPanel(curve) : `
      ${curveGraphSvg({ pushSeconds: T, b: curve ? curve.b : null, until, yMax, big: true, error: v.error, highlight: hl, overlay: overlayFor(curve) ?? undefined })}
      ${overlayNote(curve)}
      <div class="legend">
        <span><svg width="26" height="10"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--ink-soft)" stroke-width="2.5" stroke-dasharray="6 4"/></svg>見本A（基準カードの線）</span>
        <span><svg width="18" height="16"><circle cx="9" cy="8" r="6" fill="#fff" stroke="var(--claude)" stroke-width="3"/></svg>試料B：判定に使う記録（縦線は誤差 ±${v.error}）</span>
        <span><svg width="12" height="10"><circle cx="6" cy="5" r="2.5" fill="var(--claude)" opacity="0.5"/></svg>Bの細かい記録（表示用）</span>
        <span>右端の「20秒」が、いつもの検査の時刻</span>
      </div>`}
      ${v.curves.length > 1 ? `<div class="minis">${v.curves.map((c) => `<button class="mini ${curve && c.id === curve.id ? "on" : ""}" data-act="show-curve" data-id="${c.id}" ${state.animating ? "disabled" : ""}>${curveGraphSvg({ pushSeconds: c.pushSeconds, b: c.b, until: 99, yMax, big: false, error: v.error, title: speedName(c.pushSeconds) })}</button>`).join("")}</div>` : ""}
    </div>
    <div class="pane board">
      ${waiting ? pickBoard(bv, waiting) : judgedBoard(bv)}
      ${claudeNote()}
      <div class="words">
        <input id="words" maxlength="200" placeholder="あなたの説明（例：Bの方がねばっこい）">
        <button class="btn small claude" data-act="words" ${state.busy ? "disabled" : ""}>候補に置きかえる</button>
      </div>
      ${translationBlock()}
      <div class="actions" style="margin-top:10px">
        <button class="btn claude" data-act="hint" ${state.busy || v.hintsLeft <= 0 || state.animating ? "disabled" : ""}>${state.claude ? "相棒に手がかりを聞く" : "手がかりを見る"}</button>
        ${narrowed ? "" : `<button class="btn ghost small" data-act="finish" ${lock ? "disabled" : ""}>ここで終えて答え合わせ</button>`}
      </div>
      ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    </div>
  </section></main>`;
}

/** 曲線の欄の切り替え：押し返す力（深さを保つ間）と、へこみの戻り（離した後） */
function graphTabs(): string {
  const tab = (id: "force" | "dent", label: string, sub: string) =>
    `<button role="tab" class="gtab ${state.graphTab === id ? "on" : ""}" data-act="graph-tab" data-val="${id}" aria-selected="${state.graphTab === id}" ${state.animating ? "disabled" : ""}><strong>${label}</strong><span>${sub}</span></button>`;
  return `<div class="gtabs" role="tablist">${tab("force", "① 押し返す力", "深さを保っている間")}${tab("dent", "② へこみの戻り", "押し板を離した後")}</div>`;
}

/** 試験機：保持中は押し板と矢印、離した後は押し板を上げてへこみを描く */
function labBench(): string {
  const c = shownCurve();
  if (state.released && c) {
    const d = dentsAt(c, state.recH);
    return benchSvg(state.benchTarget, state.press, false, null, { a: d.a, b: d.b });
  }
  return benchSvg(state.benchTarget, state.press, state.flash, state.arrows);
}

/** 曲線 c の記録で、離して h 秒後のAとBのへこみ（Bは記録した値。Aは基準の値） */
function dentsAt(c: CurveView, h: number): { a: number; b: number } {
  const rec = c.recovery.find((p) => Math.abs(p.h - h) < 1e-9) ?? c.recovery[0]!;
  return { a: dentAfterRelease(BASE, c.pushSeconds, rec.h), b: rec.dent };
}

/** 離した後の戻り：グラフと拡大図、再生バー、証拠写真 */
function recoveryPanel(c: CurveView): string {
  const v = state.view!;
  const mine = v.photos.filter((p) => p.curveId === c.id);
  return `<section class="rec-panel" aria-label="離した後の戻り">
    <h3>押し板を離すと…へこみはどう戻る？ <span class="note">時間を止めて、違いが見える瞬間を撮ろう</span></h3>
    <p class="note">ここからは押し板を離すので、押し返す力はゼロ。測るのは<strong>へこみの深さ</strong>（押し込んだ深さ＝1 とした割合）。離した瞬間に一部はすぐ戻り、残りがゆっくり戻ります。点線は見本A（基準の線・測らない）、青は試料B（測った記録、誤差 ±0.01）。</p>
    <div id="rec-live">${recLiveHtml(c)}</div>
    <div class="rec-controls">
      <button class="btn small ghost" data-act="rec-play" ${state.busy || state.releasing ? "disabled" : ""}>▶ 離したところから再生（はじめはゆっくり。つまみで止まる）</button>
      <label class="rec-slider">離してから <input type="range" id="rec-h" min="0" max="${RECOVERY_MAX}" step="${RECOVERY_STEP}" value="${state.recH}" ${state.releasing ? "disabled" : ""}> <strong id="rec-h-val">${state.recH.toFixed(1)}</strong> 秒</label>
      <button class="btn small shoot" data-act="photo" data-id="${c.id}" ${state.busy || state.releasing ? "disabled" : ""}>この瞬間を撮る</button>
    </div>
    ${mine.length ? `<div class="photos">${mine.map((p) => `<div class="photo ${p.distinguishable ? "ok" : ""}"><strong>${p.distinguishable ? "★ ここなら違いが見えた" : "この瞬間では区別できない"}</strong><span>離して${p.h.toFixed(1)}秒後のへこみ：A（基準）${p.dentA.toFixed(3)}／B（測定）${p.dentB.toFixed(3)}　差（B−A）${p.diff >= 0 ? "+" : "−"}${Math.abs(p.diff).toFixed(3)}${Math.abs(p.diff) > 0.005 ? (p.diff > 0 ? "：Bのほうが深い＝戻りが遅い" : "：Bのほうが浅い＝戻りが速い") : ""}</span></div>`).join("")}</div>
      ${mine.some((p) => p.distinguishable) ? `<p class="note">最後（40秒後）だけを見たら、見落としていた違いです。${mine.some((p) => !p.distinguishable) ? "区別できなかった写真も、記録として正当です。" : ""}</p>` : `<p class="note">この時刻では区別できませんでした。つまみを動かして、別の時刻でも撮ってみよう。</p>`}` : ""}
    <p class="note">AとBのへこみの差が <strong>${SHAPE_TOLERANCE}</strong> を超えたら「違いが見えた」とします。これは、いつもの検査の力の許容差 ±${TEST_TOLERANCE} とは別に決めた幅です（たまたま同じ数）。</p>
  </section>`;
}

function recLiveHtml(c: CurveView): string {
  const d = dentsAt(c, state.recH);
  const photoHs = state.view!.photos.filter((p) => p.curveId === c.id).map((p) => p.h);
  const rec = state.releasing ? c.recovery.filter((p) => p.h <= state.recH + 1e-9) : c.recovery;
  return `<div class="rec-grid">
    <div class="closeup">${dentCloseupSvg(d.a, d.b, state.recH, !state.releasing && judgePhoto(d.b, d.a).distinguishable)}</div>
    <div>${recoveryGraphSvg(rec, (h) => dentAfterRelease(BASE, c.pushSeconds, h), state.recH, photoHs)}</div>
  </div>`;
}

/** 再生バーを動かしたとき：拡大図・グラフ・試験機だけを描き直す（入力の操作を途切れさせない） */
function updateRecLive(): void {
  const c = shownCurve();
  if (!c) return;
  const live = document.querySelector<HTMLDivElement>("#rec-live");
  if (live) live.innerHTML = recLiveHtml(c);
  const val = document.querySelector("#rec-h-val");
  if (val) val.textContent = state.recH.toFixed(1);
  const slider = document.querySelector<HTMLInputElement>("#rec-h");
  if (slider && Number(slider.value) !== state.recH) slider.value = String(state.recH);
  state.released = true;
  const bench = document.querySelector<HTMLDivElement>("#lab-bench");
  if (bench) bench.innerHTML = labBench();
}

/** 重ねる候補の予測線（押し終わりの測定値に合わせる。公開モデルと証拠だけ） */
function overlayFit(c: CurveView | null) {
  if (!c || !state.overlay || state.animating) return null;
  const end = state.view!.records.find((r) => r.id === `${c.id}@0`);
  if (!end) return null;
  // 押し終わりの高さに合わせた値を、これまでの記録全体と矛盾しない区間に収める（区間がなければ押し終わりに合わせたまま）
  const iv = compare(state.view!.records).candidates[state.overlay].interval;
  return fitCandidate(state.overlay, c.pushSeconds, end.force, iv);
}

function overlayFor(c: CurveView | null) {
  const fit = overlayFit(c);
  if (!fit || !c) return null;
  return { points: predictedCurve(fit.params, c.pushSeconds), color: CAND_COLOR[fit.candidate] };
}

function overlayNote(c: CurveView | null): string {
  const fit = overlayFit(c);
  if (!fit || !c) return "";
  const v = state.view!;
  const at = (h: number) => v.records.find((r) => r.id === `${c.id}@${h}`)!;
  const pred = (h: number) => forceAfterPush(fit.params, c.pushSeconds, h);
  const rows = [0, 2, 20]
    .map((h) => {
      const dv = at(h).force - pred(h);
      return `<tr><td>${h === 0 ? "押し終わり" : `${h}秒後`}</td><td>${pred(h).toFixed(2)}</td><td>${at(h).force.toFixed(2)}</td><td>${dv >= 0 ? "+" : "−"}${Math.abs(dv).toFixed(2)}</td></tr>`;
    })
    .join("");
  const head =
    fit.candidate === "same"
      ? "「違いはない」なら、Bは見本Aの線（点線）と重なるはず。"
      : fit.matched
        ? `「${CANDIDATES[fit.candidate].label}」で、押し終わりの高さを測った値に合わせた線です（これまでの記録と矛盾しない範囲で）。途中（2秒後・20秒後）も、測ったBと重なっていますか？`
        : `「${CANDIDATES[fit.candidate].label}」では、この説明で変えてよい値を決められた範囲の中でどう変えても、押し終わりの高さに届きません（いちばん近い線を表示）。`;
  return `<div class="overlay-note" style="border-color:${CAND_COLOR[fit.candidate]}">
    <p>${head}</p>
    <table><tr><th></th><th>この説明の線</th><th>測ったB</th><th>ずれ</th></tr>${rows}</table>
    <p class="note">押し終わりの値にも誤差（±${v.error}）があるので、正しい説明でも線全体が少しずれることがあります。小さなずれだけで「合わない」と決めず、検算で確かめましょう。</p>
    <button class="btn ghost small" data-act="overlay" data-id="">重ねた線を消す</button>
  </div>`;
}

function overlayButton(id: CandidateId): string {
  if (!shownCurve()) return "";
  const on = state.overlay === id;
  return `<button class="ov-btn ${on ? "on" : ""}" data-act="overlay" data-id="${on ? "" : id}" style="--c:${CAND_COLOR[id]}" ${state.animating ? "disabled" : ""}>${on ? "重ねている" : "この説明で重ねてみる"}</button>`;
}

/** 曲線を見たあと：本人が「合わなくなった説明」を選ぶ（比較器の判定はまだ開かない） */
function pickBoard(bv: PublicSessionView, c: CurveView): string {
  return `<h2>この曲線で、合わなくなった説明はどれ？</h2>
    <p class="note">「この説明で重ねてみる」で、その説明の線を重ねて試せます。合わないと思う説明の名前を押すと「合わない」の印が付きます（もう一度押すと外れます。いくつでも）。選んだら、プログラムの判定で検算します。</p>
    <ul>${bv.candidates
      .filter((x) => x.status !== "inconsistent")
      .map((x) => {
        const on = state.pickDraft.includes(x.id);
        return `<li class="cand pick ${on ? "picked" : ""}">
          <button class="pick-btn" data-act="toggle-pick" data-id="${x.id}" aria-pressed="${on}">
            <span class="swatch" style="background:${CAND_COLOR[x.id]}"></span>
            <span class="name">${x.label}<span class="looks">${LOOKS[x.id]}</span></span>
            <span class="st">${on ? "合わない" : "—"}</span></button>${overlayButton(x.id)}</li>`;
      })
      .join("")}</ul>
    ${bv.candidates.some((x) => x.status === "inconsistent") ? `<p class="note">前の曲線で合わなくなった説明：${candList(bv.candidates.filter((x) => x.status === "inconsistent").map((x) => x.id))}</p>` : ""}
    <div class="actions">
      <button class="btn go" data-act="submit-pick" data-id="${c.id}" ${state.busy ? "disabled" : ""}>${state.pickDraft.length ? "これで検算する" : "合わなくなった説明はない、で検算する"}</button>
      <button class="btn ghost small" data-act="pick-unsure" data-id="${c.id}" ${state.busy ? "disabled" : ""}>分からない</button>
    </div>`;
}

/** 検算を開いた後：比較器の判定とハンコ。本人の選択との一致・違いを示す */
function judgedBoard(bv: PublicSessionView): string {
  const narrowed = bv.overall === "narrowed";
  const c = latestCurve();
  let check = "";
  if (c && c.studentPick !== null && !state.animating) {
    if (c.studentPick === "unsure") check = `<p class="check">あなた：分からない → 判定：${c.excluded.length ? candList(c.excluded) + "が合わなくなった" : "この曲線で合わなくなった説明はない"}</p>`;
    else {
      const mine = [...c.studentPick].sort().join(",");
      const sys = [...c.excluded].sort().join(",");
      const same = mine === sys;
      check = `<p class="check ${same ? "agree" : "differ"}"><strong>${same ? "検算：あなたの判断と一致" : "検算：あなたの判断と違う。どこを見た？"}</strong><br>
        あなた：${c.studentPick.length ? candList(c.studentPick) : "合わない説明はない"}<br>
        判定：${c.excluded.length ? candList(c.excluded) : "合わない説明はない"}</p>`;
    }
  }
  return `<h2>なぜ違う？ 説明の候補 <span class="note">（どれもAと一つだけ違う）</span></h2>
    ${check}
    <ul>${bv.candidates
      .map((x) => {
        const stamp = x.status === "inconsistent" ? `<span class="hanko no ${state.stampNow.includes(x.id) ? "now" : ""}">合わない</span>` : narrowed && bv.narrowedTo === x.id ? `<span class="hanko yes now">決着</span>` : "";
        const mine = state.view!.confirmedCandidates.includes(x.id);
        return `<li class="cand ${x.status} ${narrowed && bv.narrowedTo === x.id ? "decided" : ""} ${mine ? "mine" : ""}">
          <span class="swatch" style="background:${CAND_COLOR[x.id]}"></span>
          <span class="name">${x.label}<span class="looks">${LOOKS[x.id]}</span>${mine ? `<span class="mine-tag">あなたの説明</span>` : ""}</span>
          <span class="st">${x.statusLabel}</span>${stamp}${overlayButton(x.id)}</li>`;
      })
      .join("")}</ul>
    <p class="overall ${bv.overall}">${narrowed ? "決着！ " : ""}${bv.overallLabel}</p>
    <p class="rule">「まだ判断できない」は、誤差を2倍に広げたときだけ合うという意味です（確率ではありません）。</p>
    ${narrowed ? `<button class="btn big go" data-act="finish">答え合わせへ</button><p class="note">念のため、別の速さで確かめてもかまいません。</p>` : ""}`;
}

/** 曲線を言葉にする：押し終わった直後／2秒後／20秒後に、BはAと比べてどうか（許容差で判定） */
function describeCurve(v: PublicSessionView, c: CurveView): string {
  const word = (h: number, strong: string, weak: string) => {
    const r = v.records.find((x) => x.id === `${c.id}@${h}`)!;
    const j = judgeAgainstBase(r.force, r.baseForce);
    return j.indistinguishable ? "Aとほぼ同じ" : j.diff > 0 ? strong : weak;
  };
  return `押し終わった直後：${word(0, "Aより強く押し返す", "Aより弱く押し返す")}　→　0.5秒後：${word(0.5, "Aより強い", "Aより弱い")}　→　2秒後：${word(2, "Aより強い", "Aより弱い")}　→　5秒後：${word(5, "Aより強い", "Aより弱い")}　→　20秒後：${word(20, "Aより強い", "Aより弱い")}`;
}

function resultBanner(c: CurveView | null): string {
  const v = state.view!;
  if (!c || state.animating) return `<div class="result idle">${state.animating ? "測っています…" : "押す速さを選び、予想を選んで押すと、ここに結果が出ます。"}</div>`;
  const p = c.prediction;
  const mid = p && (p.choice === "midSame" || p.choice === "midDiffer");
  const first = v.curves[0]?.id === c.id;
  const midDiff = [0.5, 2, 5].some((h) => {
    const r = v.records.find((x) => x.id === `${c.id}@${h}`);
    return r ? !judgeAgainstBase(r.force, r.baseForce).indistinguishable : false;
  });
  const head =
    !p || p.choice === "unknown"
      ? first
        ? `深さを保っている間（0.5〜5秒後）は、${midDiff ? "Aと区別できる差があった" : "Aと区別できなかった"}。何が見えた？`
        : `押し終わりの力は${DIR_WORD[c.endDirection]}。何が見えた？`
      : c.predictionHit
        ? mid
          ? p.choice === "midDiffer"
            ? "予想どおり！ 深さを保っている間（0.5〜5秒後）は違った"
            : "予想どおり。深さを保っている間（0.5〜5秒後）も区別できなかった"
          : "予想どおり！"
        : mid
          ? p.choice === "midSame"
            ? "予想が外れた！ 深さを保っている間（0.5〜5秒後）は違った。ここが発見のチャンス"
            : "予想が外れた。深さを保っている間（0.5〜5秒後）も区別できなかった"
          : `予想が外れた！ ここが発見のチャンス（押し終わりの力は${DIR_WORD[c.endDirection]}）`;
  const cls = !p || p.choice === "unknown" ? "idle" : c.predictionHit ? "hit" : "miss";
  return `<div class="result ${cls} ${state.freshBanner && c.id === latestCurve()?.id ? "fresh" : ""}">
    <strong>${head}</strong>
    <span class="what">${describeCurve(v, c)}</span>
    ${p?.reason ? `<span class="note">あなたの理由：「${esc(p.reason)}」</span>` : ""}
  </div>`;
}

function evidenceLabel(id: string): string {
  if (id === "intro-B") return "いつもの検査の記録";
  const [cid, h] = id.split("@");
  const c = state.view?.curves.find((x) => x.id === cid);
  if (!c) return "記録";
  const t = Number(h);
  return `${SPEED_LABEL[c.pushSeconds]}押した曲線の${t === 0 ? "押し終わり" : `${t}秒後`}`;
}

function claudeNote(): string {
  const h = state.hint;
  if (!h) return "";
  const stageName = ["予想を選ぶ", "どこに注目するか", "比べ方", "試す押し方"][h.stage - 1];
  const ev = h.evidenceIds.filter((id) => id.includes("@"));
  return `<div class="claude-note fresh" aria-live="polite">
    <div class="who"><span class="ai-dot"></span>${h.source === "claude" ? "Claude（AI）のメモ" : "手がかり（定型）"} ・ ${stageName}</div>
    <p>${esc(h.text)}</p>
    ${ev.length ? `<div class="chips">${ev.map((id) => `<button class="chip ev" data-act="show-evidence" data-id="${esc(id)}">根拠：${evidenceLabel(id)}</button>`).join("")}</div>` : ""}
    ${h.suggestion ? `<button class="btn small claude" data-act="use-suggestion" data-push="${h.suggestion.pushSeconds}">この押し方にする：${speedName(h.suggestion.pushSeconds)}</button>` : ""}
    <div class="src">${h.source === "claude" ? "あなたと同じ記録と判定だけを見て書いています。答えは知りません。" : "定型のヒントです（AIは休止中、または応答を使えませんでした）。"}</div>
  </div>`;
}

function translationBlock(): string {
  const t = state.translation;
  if (!t) return "";
  const ids = t.candidateIds.length ? t.candidateIds : (["overall", "instant", "relax", "same"] as CandidateId[]);
  return `<div class="claude-note fresh">
    <div class="who"><span class="ai-dot"></span>${t.source === "claude" ? "Claude（AI）の確認" : "確認"}</div>
    <p>${esc(t.confirmQuestion)}</p>
    <div class="chips">${ids.map((id) => `<button class="chip" style="color:${CAND_COLOR[id]}" data-act="confirm-cand" data-id="${id}">${CANDIDATES[id].label}</button>`).join("")}</div>
  </div>`;
}

// ---------- 答え合わせ ----------
/** 決め手の曲線（合わなくなった説明が最も多い曲線。なければ最後の曲線） */
function keyCurve(v: PublicSessionView): CurveView | null {
  let best: CurveView | null = null;
  for (const c of v.curves) if (!best || c.excluded.length > best.excluded.length) best = c;
  return best;
}

function renderDebrief(): string {
  const d = state.debrief!;
  const v = state.view!;
  const names = { eInf: "待ったあとも残るかたさ（E∞）", e1: "押した直後だけ上乗せされるかたさ（E1）", tau: "上乗せ分がやわらぐ時間の目安（τ）" } as const;
  const keys = d.keyCurves.map((k) => `<li><strong>${speedName(k.pushSeconds)}押した曲線</strong><br>→ ${candList(k.excluded)}が合わなくなった</li>`).join("");
  const story = storyFor(d.truth, d.base);
  const kc = keyCurve(v);
  const yMax = yMaxFor(v);
  return `${topbar()}<main class="wrap">${missionBar()}<section class="page">
    <p class="kicker">答え合わせ</p>
    <h1 class="reveal-head">${esc(d.explanation)}</h1>
    <div class="two">
      <div class="pane">
        <h2>${kc ? `あなたが測った曲線（${speedName(kc.pushSeconds)}）` : "あなたの記録"}</h2>
        ${kc ? curveGraphSvg({ pushSeconds: kc.pushSeconds, b: kc.b, until: 99, yMax, big: true, error: v.error, bTrue: d.truth }) : `<p class="note">曲線は測りませんでした。</p>`}
        <div class="legend">
          <span><svg width="26" height="10"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--ink-soft)" stroke-width="2.5" stroke-dasharray="6 4"/></svg>見本A</span>
          <span><svg width="18" height="16"><circle cx="9" cy="8" r="6" fill="#fff" stroke="var(--claude)" stroke-width="3"/></svg>あなたが測ったB</span>
          <span><svg width="26" height="10"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--relax)" stroke-width="2.5" stroke-dasharray="2 4"/></svg>Bの正体の値で計算した線（終わったので開示）</span>
        </div>
        <p class="note">もし一瞬で押し込めたら（実際にはできない理想の場合）、押し終わりの力は E∞＋E1（Aなら 1＋1＝2）になります。実際は押している間にも上乗せ分がやわらぐので2より小さくなり、押す速さで変わります（Aでは、ふつう ${forceAfterPush(BASE, 1, 0).toFixed(2)}、すばやく ${forceAfterPush(BASE, 0.2, 0).toFixed(2)}）。深さを1にしているので、かたさと力は同じ数字になります。</p>
      </div>
      <div class="pane">
        <h2>あなたの決め手</h2>
        <ol class="keys">${keys || "<li>説明を退けた曲線はありませんでした。</li>"}</ol>
        <p class="note">押した回数は${d.observationCount}回。回数の多い少ないは優劣ではありません。</p>
        <table class="vals"><tr><th></th><th>見本A</th><th>試料B</th></tr>
        ${(["eInf", "e1", "tau"] as const).map((k) => `<tr class="${d.truth[k] !== d.base[k] ? "diff" : ""}"><td>${names[k]}</td><td>${d.base[k]}</td><td>${d.truth[k].toFixed(2)}</td></tr>`).join("")}</table>
        <p class="note">ばね二つとダンパ一つの「標準線形固体」という簡単なモデルです。</p>
      </div>
    </div>
    <div class="bridge pane">
      <h2>つまり</h2>
      <p>${story.summary}</p>
      <p>${decisiveNote(v.records, kc?.id ?? null, v.overall === "narrowed")}</p>
    </div>
    <div class="pane speed-table">
      <h2>もう一つの驚き：押し方を変えると、差の大きさが変わる</h2>
      ${speedTableHtml(d.truth, d.base, v)}
      <p><strong>どの違いを調べたいかで、よい測り方が変わる。速く押せばよいとは限らない。</strong></p>
      <p class="note">この表は押し終わりの力だけです。あなたの決め手は、押し終わりだけでなく、そのあとの下がり方（途中の点）で決まることもあります。押し終わりの力が同じでも、下がり方で分かれる説明があります（曲線の画面の「この説明で重ねてみる」）。</p>
    </div>
    <div class="bridge pane">
      <p><strong>では、あなたは「いつもの検査をすり抜ける素材」を自分でつくれるでしょうか？</strong></p>
    </div>
    <div class="actions" style="margin-top:20px"><button class="btn big" data-act="to-make">素材をつくってみる</button></div>
  </section></main>`;
}

/** 答え合わせ：押し方ごとの押し終わりの差（開示した値で計算。差が最も大きい押し方に印） */
function speedTableHtml(truth: MaterialParams, base: MaterialParams, v: PublicSessionView): string {
  const t = pushSpeedTable(truth, base);
  const used = new Set(v.curves.map((c) => c.pushSeconds));
  const max = Math.max(...t.rows.map((r) => Math.abs(r.diff)));
  return `<table class="vals speeds"><tr><th>押し方</th><th>押し終わりの力の差（B−A、誤差なしの計算値）</th><th></th><th>あなたは</th></tr>
    ${t.rows
      .map(
        (r) => `<tr class="${r.pushSeconds === t.best ? "diff" : ""}"><td>${speedName(r.pushSeconds)}</td><td class="num">${r.diff >= 0 ? "+" : "−"}${Math.abs(r.diff).toFixed(3)}</td>
        <td><span class="bar" style="width:${Math.round((Math.abs(r.diff) / max) * 120)}px"></span>${r.pushSeconds === t.best ? " 差の大きさがいちばん大きい（＋−は向き）" : ""}</td><td>${used.has(r.pushSeconds) ? "測った" : "—"}</td></tr>`,
      )
      .join("")}</table>`;
}

// ---------- 素材をつくる挑戦 ----------
function renderMake(): string {
  const tabs = [...MISSIONS.map((m) => ({ id: m.id as MissionId | "free", label: m.title, done: state.passed[m.id] })), { id: "free" as const, label: "自由づくり", done: false }];
  return `${topbar()}<main class="wrap">${missionBar()}<section class="page make">
    <p class="kicker">素材をつくる</p>
    <h1>いつもの検査をすり抜ける素材を、つくれるか？</h1>
    <div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" class="${state.mission === t.id ? "on" : ""}" data-act="mission" data-val="${t.id}">${t.done ? "✓ " : ""}${esc(t.label)}</button>`).join("")}</div>
    <div class="make-grid">
      <div class="pane sliders">
        ${(["eInf", "e1", "tau"] as const)
          .map((k) => {
            const s = SLIDERS[k];
            return `<label class="slider"><span>${s.label}<strong id="val-${k}">${state.mat[k].toFixed(2)}</strong></span>
              <input type="range" id="sl-${k}" data-mat="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${state.mat[k]}"></label>`;
          })
          .join("")}
        <p class="note">見本Aは、三つとも 1.00 です。まず一つだけ動かして、どの検査の値が変わるかを見てみよう。</p>
        <button class="btn ghost small" data-act="reset-mat">見本と同じに戻す</button>
      </div>
      <div id="make-live"></div>
    </div>
    <div class="actions" style="margin-top:18px"><button class="btn big" data-act="to-act2">次へ：見方を変える</button></div>
  </section></main>`;
}

function updateMakeLive(): void {
  const el = document.querySelector<HTMLDivElement>("#make-live");
  if (!el) return;
  const p = state.mat;
  const d = testDiffs(p);
  const sign = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(3)}`;
  let head = "";
  let usualOk = true;
  let quickOk = true;
  if (state.mission !== "free") {
    const m = MISSIONS.find((x) => x.id === state.mission)!;
    const r = missionResult(m.id, p);
    usualOk = r.usualOk;
    quickOk = r.quickOk;
    const firstPass = r.passed && !state.passed[m.id];
    if (r.passed) state.passed[m.id] = true;
    const one = state.mission === "hideFromUsual";
    head = `<div class="goal-box ${r.passed ? "pass" : ""}">
      <p class="goal">${esc(m.goal)}</p>
      <ul class="checks">
        <li class="${r.usualOk ? "ok" : ""}">${r.usualOk ? "✓" : "・"} いつもの検査（ふつうに押して20秒後）${one ? `で「見本と区別できない」（差が ±${TEST_TOLERANCE} 以内）` : "で「見本と違う」（差が 0.1 以上）"}：見本との差 ${sign(d.usual)}</li>
        <li class="${r.quickOk ? "ok" : ""}">${r.quickOk ? "✓" : "・"} すばやい検査（すばやく押した直後）${one ? "で違いがバレる（差が 0.15 以上）" : `で「見本と区別できない」（差が ±${TEST_TOLERANCE} 以内）`}：見本との差 ${sign(d.quick)}</li>
      </ul>
      ${r.passed ? `<span class="hanko yes big-stamp ${firstPass ? "now" : ""}">達成</span><p class="win">${one ? "いつもの検査をすり抜けた！ 違いは「押した直後」や「やわらいでいく途中」に隠れています。" : "逆もできた！ すばやく押す検査だけでも、見落とす違いがあります。"}</p>` : ""}
    </div>`;
  } else {
    head = `<div class="goal-box"><p class="goal">好きな素材をつくって、曲線がどう変わるかを見よう。</p>
      <ul class="checks"><li>いつもの検査の差 ${sign(d.usual)}</li><li>すばやい検査の差 ${sign(d.quick)}</li></ul></div>`;
  }
  const yMax = makeYMax(p);
  el.innerHTML = `${head}
    <div class="make-graphs">
      <div class="pane">${makeGraphSvg(p, 1, 20, "いつもの検査：ふつう（1秒）に押して20秒後", usualOk, yMax)}</div>
      <div class="pane">${makeGraphSvg(p, 0.2, 0, "すばやい検査：すばやく（0.2秒）押した直後", quickOk, yMax)}</div>
    </div>
    <p class="note">点線：見本A　緑の線：あなたの素材　縦の点線：検査の時刻（白丸がA、緑の丸があなたの素材）。二つのグラフは同じ縦軸です。</p>`;
  for (const k of ["eInf", "e1", "tau"] as const) {
    const v = document.querySelector(`#val-${k}`);
    if (v) v.textContent = state.mat[k].toFixed(2);
  }
}

// ---------- 第2幕 ----------
function renderAct2(): string {
  const runs = state.act2Runs;
  const d = state.debrief;
  const story = d ? storyFor(d.truth, d.base) : null;
  const answer = act2Answer(runs);
  const hit = answer !== null && state.act2Guess === answer;
  const kc = state.view ? keyCurve(state.view) : null;
  const carryT = kc?.pushSeconds ?? 1;
  return `${topbar()}<main class="wrap">${missionBar()}<section class="page act2">
    <p class="kicker">見方を変える</p>
    <h1>調べたBを、電気回路に置きかえる</h1>
    ${
      d && story
        ? `<div class="two carry">
        <div class="pane">${carrySvg(d.truth, carryT)}
          <div class="legend">
            <span><svg width="26" height="10"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--claude)" stroke-width="4"/></svg>Bの押し返す力（あなたの決め手の押し方：${speedName(carryT)}。開示した値で計算、誤差なし）</span>
            <span><svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#fff" stroke="var(--ink)" stroke-width="2"/></svg>回路の電圧（同じ時間だけ一定の電流を流して止める）</span>
            <span><svg width="26" height="10"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--relax)" stroke-width="2"/></svg>点線の中（C1とR）の電圧＝上乗せ分</span>
            <span><svg width="26" height="10"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="6 4"/></svg>見本A</span>
          </div>
        </div>
        <div>
          <p class="lead"><strong>力の線と、電圧の丸が一本に重なります。</strong>変形↔電荷、押す速さ↔電流、押し返す力↔電圧と読みかえると、Bと同じ式になる回路が作れるからです。</p>
          <p>${story.circuit}</p>
          <p class="note"><strong>時定数</strong>（じていすう）＝変化が元の約37%まで戻るのにかかる時間の目安。第1幕の「上乗せ分がやわらぐ時間 τ」と同じもので、回路では R×C1 で決まります。</p>
          <p class="caution">素材の中に回路があるわけではありません（式の形が同じだけ）。値は答え合わせで開示したBの値から計算しています。</p>
        </div>
      </div>
      <div class="circ-wrap"><p class="field-label">Bを表す回路</p>${circuitSvg("circuit")}</div>`
        : ""
    }
    <h2 class="sec">細胞の膜では：別の対象に、同じ形の部分がある</h2>
    <p class="note">ここから別の対象（神経細胞の膜の模型）に移ります。同じなのは、上の回路の点線の中と式の形です。膜では、電荷がたまりイオンが動くという電気の現象が実際に起きています。</p>
    <div class="mem-grid">
      <div class="pane mem-main">${membraneSvg(state.memRun ?? state.perm, state.memT)}</div>
      <div class="pane mem-side"><p class="field-label">同じことを回路で書くと</p>${circuitSvg("membrane")}
        <p class="note">膜（黄）＝電荷をためるコンデンサ、イオンの通り道（緑）の通りにくさ＝抵抗（通り道が多いほど抵抗は小さい）、イオンの濃さの差がつくる基準の電位＝電池。イオンの移動（化学）が電流（電気）になり、膜の電位（生物の信号のもと）を変えます。値は計算値です（誤差は付けていません）。</p></div>
    </div>
    <p class="lead">${story ? story.membrane : ""}</p>
    <p class="lead">電流を止めた瞬間の、基準の電位からの差だけで、通りやすさの違いまで分かるでしょうか？ 差が半分になるまでの時間も見てみよう。</p>
    <p class="note">ここでの「戻る」は、第1幕の「深さを保ったまま押し返しが下がる」にあたります（離した後のへこみの戻りではありません）。</p>
    <h2 class="q">イオンが通りやすくなると、電流を止めた後（第1幕の押し終わりにあたる）、基準の電位（何も入れていないときの膜電位。生物では「静止電位」と呼ぶ）へ戻るのは速くなる？ 遅くなる？</h2>
    <div class="two">
      <div>
        <div class="field-label">まず予想</div>
        <div class="seg">${(["faster", "same", "slower"] as Act2Guess[]).map((g) => `<button data-set="act2guess" data-val="${g}" aria-pressed="${state.act2Guess === g}">${GUESS_LABEL[g]}</button>`).join("")}</div>
        <div class="actions" style="margin:8px 0"><button class="btn ghost small" data-act="act2-save" ${!state.act2Guess ? "disabled" : ""}>予想を保存</button>${state.act2Saved ? `<span class="note">保存：「${GUESS_LABEL[state.act2Guess!]}」</span>` : ""}</div>
        <div class="field-label">イオンの通りやすさ <span class="note">（通りやすい＝抵抗が小さい。膜の電荷のためやすさ（容量）はそのまま）</span></div>
        <div class="seg">${(["easier", "same", "harder"] as Permeability[]).map((p) => `<button data-set="perm" data-val="${p}" aria-pressed="${state.perm === p}">${PERM_LABEL[p]}</button>`).join("")}</div>
        <div class="actions" style="margin-top:8px"><button class="btn go" data-act="act2-run" ${!state.act2Saved ? "disabled" : ""}>電流を入れて、止める</button></div>
        <ul class="runs">${runs.map((r) => `<li style="border-color:${RUN_COLORS[r.perm]}">${PERM_LABEL[r.perm]}<br><strong>半分に戻るまで ${(r.half ?? 0).toFixed(2)}</strong>（止めた時の差 ${r.deltaAtStop.toFixed(2)}）</li>`).join("")}</ul>
        ${
          answer
            ? `<p class="result ${hit ? "hit" : "miss"}"><strong>${hit ? "予想どおり！" : "予想が外れた！"}　通りやすくすると、戻るのは${GUESS_LABEL[answer]}</strong><span>「そのまま」と「通りやすくする」を比べた結果です。通りやすいほど時定数（抵抗×容量）が短く、速く戻ります。${story ? story.membraneLink : ""}</span></p>`
            : runs.length
              ? `<p class="note">「そのまま」と「通りやすくする」の両方を試すと、問いに答えられます。</p>`
              : ""
        }
      </div>
      <div class="pane">${act2GraphSvg(runs, state.memRun && state.memT !== null ? { perm: state.memRun, t: state.memT } : null)}
        <p class="note">止めた時の高さは、通りやすさでも変わります。戻る速さは、右の「割った表示」と「半分に戻るまで」で比べます。時間の目盛りは素材と同じに伸ばしています（実際の膜はずっと速い）。</p>
      </div>
    </div>
    <div class="actions" style="margin-top:16px"><button class="btn big" data-act="to-reflect" ${!answer ? "disabled" : ""}>振り返りへ</button>${!answer ? `<span class="note">問いに答えると進めます。</span>` : ""}</div>
    ${answer ? `<details class="more" ${state.thoughtOpen ? "open" : ""}><summary data-act="thought-open">さらに先：もしも、イオンの通り道が「マイナスの抵抗」のように働いたら？（思考実験）</summary>${thoughtBlock()}</details>` : ""}
  </section></main>`;
}

function thoughtBlock(): string {
  const g = state.thoughtGuess;
  return `<section class="thought pane">
    <p>通りやすくすると速く戻りました（通りにくくすると、ゆっくり戻ります）。では、抵抗をゼロよりさらに下、マイナスにしたら、止めた後はどうなるだろう？</p>
    <div class="two">
      <div>
        <div class="field-label">予想</div>
        <div class="seg">${(["fasterStill", "slower", "noReturn"] as ThoughtGuess[]).map((x) => `<button data-set="thought" data-val="${x}" aria-pressed="${g === x}" ${state.thoughtShown ? "disabled" : ""}>${THOUGHT_GUESS_LABEL[x]}</button>`).join("")}</div>
        <div class="actions" style="margin-top:10px"><button class="btn go" data-act="thought-run" ${!g || state.thoughtShown ? "disabled" : ""}>マイナスにして、電流を入れて止める</button></div>
        ${
          state.thoughtShown
            ? `<div class="result ${g === "noReturn" ? "hit" : "miss"} fresh"><strong>${g === "noReturn" ? "予想どおり！ 戻らない" : "予想が外れた！ 戻らずに離れていく"}</strong>
              <span>マイナスの抵抗では、止めた後に基準の電位へ戻らず、差がどんどん大きくなります（跳ね上がる）。</span></div>
              <div class="reveal-box">
                <p><strong>ありえない？</strong> ふつうの抵抗器や素材は、ひとりでにマイナスにはなりません。エネルギーが湧いて出ることになるからです。</p>
                <p><strong>でも、似たことが体の中で起きている。</strong> 神経の膜では、電位がある高さ（しきい値）を超えて上がると、ナトリウムの通り道が開いてイオンが流れ込み、電位がさらに上がります（正のフィードバック）。これが、神経が信号を伝えるときの電位の跳ね上がり（活動電位）の始まりです。しきい値に届かない小さな上がり方なら、さっきの受け身の膜のように戻ります。この思考実験は、その<strong>跳ね上がりの始まりだけ</strong>を直線で近づけたものです。マイナスなのは「電圧と電流のグラフの傾き」（電圧が少し上がったときの電流の変わり方）で、部品の抵抗値そのものではありません。</p>
                <p><strong>エネルギーはどこから？</strong> ポンプがイオンを運んで保っている「イオンの濃さの差」（化学）が、跳ね上がりのエネルギー源です。</p>
                <p class="note">実際の神経では、通り道が電位と時間によって開き閉じするので、跳ね上がりはやがて止まり、元に戻ります。この模型にはその仕組みがありません。活動電位そのものを再現したものではありません。</p>
              </div>`
            : ""
        }
      </div>
      <div class="pane">${thoughtSvg(state.thoughtShown)}
        <p class="note">緑：通りやすい　灰：そのまま　紫：通りにくい${state.thoughtShown ? "　赤：マイナスの抵抗（思考実験）" : ""}</p>
      </div>
    </div>
  </section>`;
}

// ---------- 振り返り：今回の発見 ----------
function mapSvg(): string {
  const node = (x: number, y: number, title: string, sub: string, color: string, dashed = false) => `
    <g><rect x="${x}" y="${y}" width="196" height="64" rx="12" fill="#fff" stroke="${color}" stroke-width="2.5" ${dashed ? 'stroke-dasharray="5 4"' : ""}/>
    <text x="${x + 14}" y="${y + 27}" font-size="15" font-weight="700" fill="${dashed ? "var(--ink-soft)" : "var(--ink)"}">${title}</text>
    <text x="${x + 14}" y="${y + 49}" font-size="12" fill="var(--ink-soft)">${sub}</text></g>`;
  return `<svg viewBox="0 0 640 260" role="img" aria-label="見方のつながり">
    <ellipse cx="320" cy="130" rx="122" ry="36" fill="var(--claude-wash)" stroke="var(--claude)" stroke-width="2"/>
    <text x="320" y="126" text-anchor="middle" font-size="15" font-weight="700" fill="var(--claude)">時間をかけてやわらぐ変化</text>
    <text x="320" y="147" text-anchor="middle" font-size="12" fill="var(--ink-soft)">戻る速さは時定数で決まる</text>
    <path d="M207 60 L260 104 M433 60 L380 104 M207 200 L260 156" stroke="var(--line)" stroke-width="2.5"/>
    <path d="M433 200 L380 156" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 4"/>
    ${node(10, 20, "素材（力学・物理）", "あなたが測った B", "var(--overall)")}
    ${node(434, 20, "回路（電気・物理）", "B と一本に重なった電圧", "var(--ink-soft)")}
    ${node(10, 176, "細胞の膜（化学→電気）", "イオンの通りやすさと戻る速さ", "var(--relax)")}
    ${node(434, 176, "今後：血管（生体）", "研究との接点（未実装）", "var(--line)", true)}
  </svg>`;
}

function discovery(): { label: string; value: string }[] {
  const v = state.view!;
  const d = state.debrief;
  const speeds = [...new Set(v.curves.map((c) => c.pushSeconds))].sort((a, b) => a - b);
  const keys = v.curves.filter((c) => c.excluded.length > 0);
  const picks = v.curves.filter((c) => c.studentPick !== null && c.studentPick !== "unsure");
  return [
    { label: "そろえたこと", value: "押す深さ（どの押し方でも、同じ深さで止めて押し返す力を測った）" },
    {
      label: "試した条件",
      value:
        speeds.length > 1
          ? `押す速さを変えて比べた：${speeds.map(speedName).join("、")}`
          : speeds.length === 1
            ? `押す速さ：${speedName(speeds[0]!)}だけ（速さを変える比較は未実施）`
            : "曲線は測らなかった",
    },
    {
      label: "決め手の記録",
      value: keys.length ? keys.map((c) => `${speedName(c.pushSeconds)}押した曲線 → ${candList(c.excluded)}が合わなくなった`).join("；") : "説明を退けた曲線はなかった",
    },
    {
      label: "あなたの判断と検算",
      value: picks.length
        ? picks.map((c) => `${speedName(c.pushSeconds)}：あなた＝${candList(c.studentPick as CandidateId[]) || "「合わない説明はない」"}、判定＝${candList(c.excluded) || "「合わない説明はない」"}`).join("；")
        : "（自分で選んだ曲線はなし）",
    },
    {
      label: "証拠写真（離した後のへこみ）",
      value: v.photos.length
        ? v.photos.map((p) => `離して${p.h.toFixed(1)}秒後：差 ${p.diff >= 0 ? "+" : "−"}${Math.abs(p.diff).toFixed(3)}（${p.distinguishable ? "違いが見えた" : "区別できない"}）`).join("；")
        : "（撮らなかった）",
    },
    { label: "Bの正体", value: d ? d.explanation : "—" },
    { label: "回路での対応", value: d ? storyFor(d.truth, d.base).circuit : "—" },
    { label: "まだ言えないこと", value: "これは、この教材が決めた式・値の範囲・誤差の決まりを前提にした判定。実物の材質や体の組織を、このモデルだけで決めたわけではない" },
  ];
}

function renderReflect(): string {
  const r = state.view?.reflection;
  const rows = discovery();
  return `${topbar()}<main class="wrap">${missionBar()}<section class="page reflect">
    <p class="kicker">振り返り</p>
    <h1>今回の発見</h1>
    <div class="card pane">
      <dl class="found">${rows.map((x) => `<dt>${x.label}</dt><dd>${esc(x.value)}</dd>`).join("")}</dl>
      <label>決め手になった理由（ひとこと）<input id="r1" maxlength="200" value="${esc(r?.keyReason ?? "")}" placeholder="例：押した直後だけ高かったから"></label>
      <label>次に確かめたいこと（ひとこと・任意）<input id="r2" maxlength="200" value="${esc(r?.nextCheck ?? "")}" placeholder="例：二つの性質が同時に違ったら？"></label>
    </div>
    <div class="map pane">${mapSvg()}</div>
    <p class="note">実線の三つが、この実験室で確かめた見方です。血管は次に作る予定の段です（点線）。</p>
    <div class="actions"><button class="btn big" data-act="save-reflect">保存する</button><button class="btn ghost" data-act="copy-card">カードを文字でコピー</button></div>
    ${state.phase === "done" ? `<p class="note">保存しました。この記録は、この実行中のセッションの間だけサーバーに置きます。氏名などは集めていません。持ち帰るときは「カードを文字でコピー」を使ってください。</p>` : ""}
    ${state.copied ? `<p class="note">コピーしました。</p>` : ""}
  </section></main>`;
}

function render(): void {
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.id ? `#${active.id}` : null;
  const words = document.querySelector<HTMLInputElement>("#words")?.value ?? "";
  const views: Record<Phase, () => string> = {
    start: renderStart,
    intro: renderIntro,
    lab: renderLab,
    debrief: renderDebrief,
    make: renderMake,
    act2: renderAct2,
    reflect: renderReflect,
    done: renderReflect,
  };
  app.innerHTML = views[state.phase]();
  if (state.phase === "make") updateMakeLive();
  const w = document.querySelector<HTMLInputElement>("#words");
  if (w) w.value = words;
  if (focusKey) document.querySelector<HTMLElement>(focusKey)?.focus();
}

// ---------- 動き ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 戻りの再生を止めるための番号（つまみを動かすと進む） */
let recPlayToken = 0;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function valueAt(pts: readonly { t: number; force: number }[], t: number): number {
  let last = 0;
  for (const p of pts) {
    if (p.t > t + 1e-9) break;
    last = p.force;
  }
  return last;
}

/** 入口：見本Aを押して止める。棒は止まったまま、押し返す力の数字だけが下がる（公開の基準カードの値で描く） */
async function playHook() {
  const reduce = reduceMotion();
  state.animating = true;
  const pushMs = reduce ? 0 : 1000;
  const holdMs = reduce ? 0 : 4000;
  const s = performance.now();
  for (;;) {
    const el = performance.now() - s;
    if (el < pushMs) {
      const t = el / pushMs;
      state.press = t;
      state.hookArrow = forceDuringPush(BASE, 1, t);
      state.clock = "押しています…";
    } else if (el < pushMs + holdMs) {
      const h = ((el - pushMs) / holdMs) * 20;
      state.press = 1;
      state.hookArrow = forceAfterPush(BASE, 1, h);
      state.clock = `止めたまま ${h.toFixed(1)}秒（早送り）：棒は動いていない`;
    } else break;
    render();
    await sleep(45);
  }
  state.press = 1;
  state.hookArrow = forceAfterPush(BASE, 1, 20);
  state.clock = "止めたまま20秒：棒は動いていないのに、押し返す力は下がった";
  state.animating = false;
  state.hookDone = true;
  render();
}

/** いつもの検査：Bを押して、20秒後にだけ値を出す（Aは基準カードの値） */
async function playIntro() {
  state.introDone = false;
  const reduce = reduceMotion();
  await sleep(reduce ? 0 : 500);
  state.animating = true;
  state.press = 0;
  const pushMs = reduce ? 0 : 1000;
  const s = performance.now();
  while (performance.now() - s < pushMs) {
    state.press = (performance.now() - s) / pushMs;
    state.clock = "押しています…";
    render();
    await sleep(40);
  }
  state.press = 1;
  const ff = reduce ? 0 : 2200;
  const s2 = performance.now();
  while (performance.now() - s2 < ff) {
    state.clock = `止めたまま待つ ${(((performance.now() - s2) / ff) * 20).toFixed(1)}秒（早送り）`;
    render();
    await sleep(50);
  }
  state.flash = true;
  state.clock = "20秒後の値";
  state.introDone = true;
  render();
  await sleep(reduce ? 0 : 450);
  state.flash = false;
  state.animating = false;
  render();
}

/** 膜の図：電流を入れて止め、膜電位が基準へ戻るまで。図とグラフの「いま」を同じ時刻で動かす */
async function playMembrane(perm: Permeability): Promise<void> {
  const reduce = reduceMotion();
  const total = 7; // 入れる1秒＋止めてから6秒
  const ms = reduce ? 0 : 4200;
  state.memRun = perm;
  const s = performance.now();
  for (;;) {
    const el = performance.now() - s;
    if (el >= ms) break;
    state.memT = (el / ms) * total;
    render();
    await sleep(50);
  }
  state.memT = total;
  render();
}

/** 押して、曲線が時間とともに伸びていく。押し返しの矢印も測った値で伸び縮みする。終わっても棒は止めたまま */
async function playCurve(c: CurveView): Promise<void> {
  const reduce = reduceMotion();
  const T = c.pushSeconds;
  state.animating = true;
  state.shownCurveId = c.id;
  state.benchTarget = "B";
  const pushMs = reduce ? 0 : Math.max(900, T * 1000);
  const holdMs = reduce ? 0 : 4200;
  const s = performance.now();
  for (;;) {
    const el = performance.now() - s;
    let t: number;
    if (el < pushMs) {
      t = (el / pushMs) * T;
      state.press = el / pushMs;
      state.clock = T < 1 ? `押しています… ${t.toFixed(2)}秒（すばやい押し込みを、見やすくゆっくり再生中）` : `押しています… ${t.toFixed(1)}秒`;
    } else if (el < pushMs + holdMs) {
      const h = ((el - pushMs) / holdMs) * HOLD_MAX;
      t = T + h;
      state.press = 1;
      state.clock = `止めたまま ${h.toFixed(1)}秒（早送り）`;
    } else break;
    state.drawUntil = t;
    state.arrows = { a: valueAt(c.a, t), b: valueAt(c.b, t) };
    render();
    await sleep(45);
  }
  state.drawUntil = T + HOLD_MAX;
  state.arrows = { a: valueAt(c.a, T + HOLD_MAX), b: valueAt(c.b, T + HOLD_MAX) };
  state.clock = "止めたまま20秒（いつもの検査の時刻）";
  render();
  await sleep(reduce ? 0 : 700);
  // 離す：押し板を上げ、へこみの戻りを早送りで見せる（曲線の欄を「へこみの戻り」に切り替える）
  state.released = true;
  state.releasing = true;
  state.graphTab = "dent";
  const relMs = reduce ? 0 : 4200;
  const s2 = performance.now();
  for (;;) {
    const el = performance.now() - s2;
    if (el >= relMs) break;
    state.recH = Math.round(((el / relMs) ** 2 * RECOVERY_MAX) / RECOVERY_STEP) * RECOVERY_STEP; // 最初の数秒（違いが見えやすい区間）をゆっくり
    state.clock = `押し板を離した。離してから ${state.recH.toFixed(1)}秒（早送り）`;
    render();
    await sleep(45);
  }
  state.recH = RECOVERY_MAX;
  state.releasing = false;
  state.clock = "離してから40秒：どちらも押す前の表面に近い。その途中はどうだった？";
  state.animating = false;
  state.press = 1;
  state.pickDraft = [];
  state.freshBanner = true;
  render();
  state.freshBanner = false;
}

// ---------- 操作 ----------
async function guard(fn: () => Promise<void>) {
  state.error = "";
  state.busy = true;
  render();
  try {
    await fn();
  } catch (e) {
    state.error = e instanceof Error ? e.message : "うまくいきませんでした。もう一度試してください。";
  } finally {
    state.busy = false;
    render();
  }
}

async function startSession(body: Record<string, unknown>) {
  await guard(async () => {
    const { view } = await api.start(body);
    state.view = view;
    state.phase = "intro";
    state.clock = "";
    state.press = 0;
  });
  if (state.phase === "intro") void playIntro();
}

/** 予想の下書きの応答：その間に別の記録が増えていたら、古い応答で上書きしない */
function applyDraft(r: { view: PublicSessionView }): void {
  if (state.view && r.view.curves.length === state.view.curves.length && !state.busy) state.view = r.view;
}

function cardText(): string {
  const r1 = document.querySelector<HTMLInputElement>("#r1")?.value ?? "";
  const r2 = document.querySelector<HTMLInputElement>("#r2")?.value ?? "";
  return ["ミカタ・ラボ：今回の発見", ...discovery().map((x) => `${x.label}：${x.value}`), `決め手になった理由：${r1}`, `次に確かめたいこと：${r2}`].join("\n");
}

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "reason") state.reason = t.value;
  if (t.id === "rec-h") {
    recPlayToken++; // 再生中なら止める
    state.recH = Number(t.value);
    updateRecLive();
  }
  const k = t.dataset.mat as "eInf" | "e1" | "tau" | undefined;
  if (k) {
    state.mat = { ...state.mat, [k]: Number(t.value) };
    updateMakeLive();
  }
});

app.addEventListener("click", async (e) => {
  const el = (e.target as Element).closest<HTMLElement>("[data-act],[data-set]");
  if (!el || el.hasAttribute("disabled")) return;
  const set = el.dataset.set;
  const v0 = state.view;
  if (set) {
    const val = el.dataset.val!;
    if (set === "push") {
      state.push = Number(val) as PushSeconds;
      // 次の条件を選んだら、前の曲線は小さな履歴に下げ、次の押し方での見本Aの線を見せる
      if (state.phase === "lab" && v0 && v0.curves.length && !awaitingPick()) {
        state.shownCurveId = "__next__";
        state.overlay = null;
      }
    }
    if (set === "choice") {
      state.choice = val as PredictionChoice;
      // 予想の下書きをサーバーへ（手がかりの段階を進めるため。理由は押す時点で確定する）
      if (v0) void api.curvePredict(v0.sessionId, state.push, state.choice, state.reason).then(applyDraft).catch(() => {});
    }
    if (set === "push" && state.choice && v0) void api.curvePredict(v0.sessionId, Number(val), state.choice, state.reason).then(applyDraft).catch(() => {});
    if (set === "act2guess") {
      state.act2Guess = val as Act2Guess;
      state.act2Saved = false;
    }
    if (set === "perm") state.perm = val as Permeability;
    if (set === "thought") state.thoughtGuess = val as ThoughtGuess;
    render();
    return;
  }
  const v = state.view;
  switch (el.dataset.act) {
    case "hook":
      if (!state.animating) await playHook();
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
    case "to-lab":
      state.phase = "lab";
      state.clock = "";
      state.arrows = null;
      state.press = 0;
      state.benchTarget = "B";
      render();
      break;
    case "observe-curve":
    case "claude-observe": {
      if (!v || !state.choice) return;
      const choice = state.choice;
      const reason = document.querySelector<HTMLInputElement>("#reason")?.value ?? state.reason;
      const byPartner = el.dataset.act === "claude-observe";
      await guard(async () => {
        // 予想と理由は「押す」時点でまとめて保存する
        const res = byPartner
          ? await api.claudeObserve(v.sessionId, state.push, crypto.randomUUID(), choice, reason)
          : await api.observeCurve(v.sessionId, state.push, crypto.randomUUID(), choice, reason);
        const note = "note" in res ? (res as { note: Hint }).note : null;
        state.boardView = state.view;
        state.view = res.view;
        const c = res.view.curves[res.view.curves.length - 1]!;
        state.busy = false;
        state.hint = null;
        state.highlight = null;
        state.overlay = null;
        state.released = false;
        state.graphTab = "force";
        state.press = 0;
        await playCurve(c);
        state.reason = "";
        state.choice = null;
        state.hint = note;
      });
      break;
    }
    case "toggle-pick": {
      const id = el.dataset.id as CandidateId;
      state.pickDraft = state.pickDraft.includes(id) ? state.pickDraft.filter((x) => x !== id) : [...state.pickDraft, id];
      render();
      break;
    }
    case "submit-pick":
    case "pick-unsure": {
      if (!v) return;
      const curveId = el.dataset.id!;
      const pick = el.dataset.act === "pick-unsure" ? ("unsure" as const) : CANDIDATE_IDS.filter((id) => state.pickDraft.includes(id));
      await guard(async () => {
        state.view = (await api.pick(v.sessionId, curveId, pick)).view;
        const c = state.view.curves.find((x) => x.id === curveId);
        state.boardView = null;
        state.stampNow = c ? [...c.excluded] : [];
        state.pickDraft = [];
      });
      setTimeout(() => {
        state.stampNow = [];
      }, 1200);
      break;
    }
    case "rec-play": {
      const c = shownCurve();
      if (!c) return;
      const token = ++recPlayToken;
      state.released = true;
      const reduce = reduceMotion();
      const ms = reduce ? 0 : 5000;
      const s0 = performance.now();
      for (;;) {
        const el = performance.now() - s0;
        if (el >= ms || token !== recPlayToken) break;
        state.recH = Math.round(((el / ms) ** 2 * RECOVERY_MAX) / RECOVERY_STEP) * RECOVERY_STEP;
        updateRecLive();
        await sleep(40);
      }
      if (token !== recPlayToken) break; // つまみを動かしたら、そこで止める
      state.recH = RECOVERY_MAX;
      updateRecLive();
      break;
    }
    case "photo": {
      if (!v) return;
      const id = el.dataset.id!;
      await guard(async () => {
        state.view = (await api.photo(v.sessionId, id, state.recH)).view;
      });
      break;
    }
    case "graph-tab":
      state.graphTab = el.dataset.val === "dent" ? "dent" : "force";
      render();
      break;
    case "overlay":
      state.graphTab = "force";
      state.overlay = (el.dataset.id || null) as CandidateId | null;
      render();
      break;
    case "show-curve":
      state.shownCurveId = el.dataset.id ?? null;
      render();
      break;
    case "show-evidence": {
      const [cid, h] = (el.dataset.id ?? "").split("@");
      if (!cid) return;
      state.shownCurveId = cid;
      state.highlight = { curveId: cid, times: [Number(h)] };
      render();
      break;
    }
    case "hint":
      if (!v) return;
      await guard(async () => {
        const res = await api.hint(v.sessionId);
        state.view = res.view;
        state.hint = res.hint;
        const ev = res.hint.evidenceIds.filter((id) => id.includes("@"));
        if (ev.length) {
          const cid = ev[0]!.split("@")[0]!;
          state.highlight = { curveId: cid, times: ev.filter((id) => id.startsWith(`${cid}@`)).map((id) => Number(id.split("@")[1])) };
        }
      });
      break;
    case "use-suggestion":
      state.push = Number(el.dataset.push) as PushSeconds;
      render();
      break;
    case "words": {
      const text = document.querySelector<HTMLInputElement>("#words")?.value.trim() ?? "";
      if (!v || !text) return;
      await guard(async () => {
        const res = await api.words(v.sessionId, text);
        state.view = res.view;
        state.translation = res.translation;
      });
      break;
    }
    case "confirm-cand": {
      if (!v) return;
      const id = el.dataset.id as CandidateId;
      await guard(async () => {
        state.view = (await api.confirm(v.sessionId, id)).view;
        state.translation = null;
      });
      break;
    }
    case "finish":
      if (!v) return;
      await guard(async () => {
        const res = await api.finish(v.sessionId);
        state.view = res.view;
        state.debrief = res.debrief;
        state.phase = "debrief";
      });
      window.scrollTo({ top: 0 });
      break;
    case "to-make":
      state.phase = "make";
      window.scrollTo({ top: 0 });
      render();
      break;
    case "mission":
      state.mission = el.dataset.val as MissionId | "free";
      render();
      break;
    case "reset-mat":
      state.mat = { eInf: 1, e1: 1, tau: 1 };
      render();
      break;
    case "to-act2":
      state.phase = "act2";
      window.scrollTo({ top: 0 });
      render();
      break;
    case "lens":
      if (state.lens !== el.dataset.val) {
        state.lens = el.dataset.val as Lens;
        state.lensFlip = true;
        render();
        setTimeout(() => {
          state.lensFlip = false;
        }, 800);
      }
      break;
    case "act2-save":
      state.act2Saved = true;
      render();
      break;
    case "act2-run":
      state.act2Runs = [...state.act2Runs.filter((r) => r.perm !== state.perm), runAct2(state.perm)];
      await playMembrane(state.perm);
      break;
    case "thought-open":
      state.thoughtOpen = !state.thoughtOpen;
      break;
    case "thought-run":
      state.thoughtShown = true;
      render();
      break;
    case "to-reflect":
      state.phase = "reflect";
      window.scrollTo({ top: 0 });
      render();
      break;
    case "save-reflect": {
      if (!v) return;
      const val = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
      const reflection = { keyReason: val("r1"), nextCheck: val("r2") };
      await guard(async () => {
        state.view = (await api.reflection(v.sessionId, reflection)).view;
        state.phase = "done";
      });
      break;
    }
    case "copy-card":
      try {
        await navigator.clipboard.writeText(cardText());
        state.copied = true;
      } catch {
        state.error = "コピーできませんでした。画面を選んでコピーしてください。";
      }
      render();
      break;
  }
});

status().then((s) => {
  state.claude = s.claude;
  render();
});
render();
