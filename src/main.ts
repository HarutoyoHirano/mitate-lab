// ミカタ・ラボの画面。サーバーから受け取る公開ビューだけで描く。
import { CANDIDATES, PUSH_SECONDS, type CandidateId, type PushSeconds } from "../server/model/public.js";
import { forceAfterPush } from "../server/model/sls.js";
import type { Permeability } from "../server/model/circuit.js";
import { MISSIONS, missionResult, SLIDERS, testDiffs, type MissionId } from "../server/model/make.js";
import { act2GraphSvg, circuitSvg, GUESS_LABEL, PERM_LABEL, RUN_COLORS, runAct2, thoughtSvg, THOUGHT_GUESS_LABEL, type Act2Guess, type Act2Run, type Lens, type ThoughtGuess } from "./act2.js";
import { api, status, type Debrief, type Hint, type PredictionChoice, type PublicSessionView, type Translation } from "./api.js";
import { benchSvg, CAND_COLOR, revealSvg, SPEED_LABEL } from "./draw.js";
import { curveGraphSvg, HOLD_MAX, makeGraphSvg, shapeThumb } from "./curve.js";

type Phase = "start" | "intro" | "lab" | "debrief" | "make" | "act2" | "reflect" | "done";
type CurveView = PublicSessionView["curves"][number];

const SHAPE_LABEL: Record<PredictionChoice, string> = { same: "ほぼ重なる", higher: "Bが高く出る", lower: "Bが低く出る" };

/** この説明が正しければ、曲線のどこがどう違うか */
const LOOKS: Record<CandidateId, string> = {
  overall: "20秒待ったあとも、Aの線とずれたまま",
  instant: "押した直後の高さが違う。抜けていく速さはAと同じで、待つと重なる",
  relax: "押し返しが抜けるのにかかる時間が違う。抜けきると重なる",
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
  lastResult: null as { curveId: string; choice: PredictionChoice | null } | null,
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
};

const app = document.querySelector<HTMLDivElement>("#app")!;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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
    <div class="brand">ミカタ・ラボ</div>
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
    goal = "いつもの検査で、見本Aと試料Bを比べる";
    next = state.introDone ? "「途中を見てみる」を押す" : "AとBを同じように押して、20秒後の値を測っています";
  } else if (state.phase === "lab" && v) {
    const bv = state.animating && state.boardView ? state.boardView : v;
    goal = "押してからの押し返しの変化（曲線）を見て、いつもの検査が見落としていた違いを見つけ、なぜ違うのかを絞り込む";
    if (state.animating) next = "曲線が伸びていくのを見る。Aの線（点線）と、どこでずれて、どこで重なる？";
    else if (bv.overall === "narrowed") next = "決着しました。「答え合わせへ」で、Bの正体を確かめる";
    else if (!v.pendingCurve) next = "① 押す速さを選ぶ → ② Bの曲線がどうなるか予想を選ぶ → ③ 押して、曲線を見る";
    else next = "予想を選びました。押して、曲線が伸びていくのを見る";
  } else if (state.phase === "debrief") {
    goal = "Bの正体と、どの押し方が決め手になったかを確かめる";
    next = "読み終えたら「素材をつくってみる」へ";
  } else if (state.phase === "make") {
    goal = "わかったことを使って、条件に合う素材を自分でつくる";
    next = "つまみを動かして、二つの検査の判定が変わるのを見る。両方の条件がそろえばミッション達成";
  } else if (state.phase === "act2") {
    goal = "見つけた「押し返しが抜けるまでの時間」が、電気や細胞の中ではどう見えるかを確かめる";
    next = state.act2Runs.length < 2 ? "予想を保存して、イオンの通りやすさを変えて二回以上試す" : "最後に「もしも」の思考実験へ。終わったら振り返りへ";
  } else if (state.phase === "reflect" || state.phase === "done") {
    goal = "一つの性質を、物理・電気・化学・生物の見方でつなげて、自分の言葉にする";
    next = "四つの問いに答えて保存する";
  }
  if (!goal) return "";
  return `<div class="mission"><div><span class="m-label">いまの目的</span>${goal}</div><div><span class="m-label next">次にやること</span>${next}</div></div>`;
}

// ---------- 開始画面 ----------
function renderStart(): string {
  return `${topbar()}<main class="wrap"><section class="start">
    <div class="start-copy">
      <p class="kicker">見方を変える実験室</p>
      <h1>同じに見える。<br>でも、測り方を変えると違う。</h1>
      <div class="body-hook">
        <p class="hook-q">まず、自分の指で試してみよう。</p>
        <p>爪の先を5秒ぎゅっと押して、離してみてください。白くなった色が、もとに戻るまで少し時間がかかりませんか？</p>
        <p class="note">体の組織には「押したあと、時間をかけて戻る」性質があります。でも、その時間は目で見ても測れません。医療の計測は、押し方や測る瞬間を工夫して、こうした見えない性質を確かめています。</p>
      </div>
      <p>ミカタ・ラボでは、性質が分かっている<strong>見本A</strong>と、調べたい<strong>試料B</strong>を押して、それを自分で確かめます。</p>
      <ol class="goals">
        <li><strong>違いを見抜く</strong>：いつもの検査では同じでも、押し方を変えると見える違いを見つける</li>
        <li><strong>理由を説明する</strong>：何が違うのかを、曲線を証拠にして言う</li>
        <li><strong>素材をつくる</strong>：わかったことを使って、検査をすり抜ける素材をつくる</li>
        <li><strong>見方をつなぐ</strong>：同じ性質を、電気や細胞の言葉で言い直す</li>
      </ol>
      <div class="actions"><button class="btn big" data-act="start">実験を始める</button></div>
      <p class="note">素材は計算で作った仮想の素材です（Aが落ち着いた力を1とする）。実在の物質や体の組織、医療機器を再現したものではありません。画面の「Claude（AI）」はAIで、隠れた答えを知りません。</p>
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
    <div class="pane bench-pane bench hero-bench">${benchSvg("both", 0)}<p class="bench-cap"><strong>A＝見本</strong>（性質が分かっている）　<strong>B＝試料</strong>（調べたい）</p></div>
  </section></main>`;
}

// ---------- いつもの検査 ----------
function renderIntro(): string {
  const v = state.view!;
  const a = v.measuredA[0]!.force;
  const b = v.records[0]!.force;
  return `${topbar()}<main class="wrap">${missionBar()}<section class="intro">
    <div class="pane bench-pane bench">${benchSvg("both", state.press, state.flash)}</div>
    <div class="intro-side">
      <p class="clock">${state.clock || "いつもの検査：ふつう（1秒）に押して、20秒後の値を測る"}</p>
      <p class="note">いつもの検査は「試料Bが見本Aと同じか」を確かめる検査です。20秒後の値の差が誤差（±${v.error}）の範囲なら「見本と同じ」と判定します。</p>
      <div class="twin">
        <div class="meter"><span class="tag">見本 A</span><strong>${state.introDone ? a.toFixed(3) : "—"}</strong></div>
        <div class="meter"><span class="tag">試料 B</span><strong>${state.introDone ? b.toFixed(3) : "—"}</strong></div>
      </div>
      ${
        state.introDone
          ? `<p class="same">判定：見本と同じ。…本当に？</p>
             <p>差は誤差（±${v.error}）の範囲。いつもの検査では、BはAと「同じ」と判定されました。<br><strong>でも、いつもの検査は、押してから20秒後しか見ていません。</strong>途中で何が起きているのでしょう？</p>
             <div class="actions"><button class="btn big" data-act="to-lab">途中を見てみる</button></div>`
          : `<p class="note">押して、そのまま20秒待っています（早送り）。</p>`
      }
    </div>
  </section></main>`;
}

// ---------- 曲線で見抜く ----------
function shownCurve(): CurveView | null {
  const v = state.view!;
  if (state.shownCurveId) return v.curves.find((c) => c.id === state.shownCurveId) ?? null;
  return v.curves[v.curves.length - 1] ?? null;
}

function yMaxFor(v: PublicSessionView): number {
  let m = 2.2;
  for (const c of v.curves) for (const p of c.b) m = Math.max(m, p.force + 0.2);
  for (const T of PUSH_SECONDS) m = Math.max(m, forceAfterPush({ eInf: 1, e1: 1, tau: 1 }, T, 0) + 0.2);
  return Math.min(4, Math.ceil(m * 2) / 2);
}

function renderLab(): string {
  const v = state.view!;
  const bv = state.animating && state.boardView ? state.boardView : v;
  const narrowed = bv.overall === "narrowed";
  const lock = state.animating || state.busy;
  const pending = v.pendingCurve;
  const ready = !!pending && pending.pushSeconds === state.push;
  const curve = shownCurve();
  const yMax = yMaxFor(v);
  const T = curve?.pushSeconds ?? state.push;
  const until = state.animating ? state.drawUntil : T + HOLD_MAX;
  return `${topbar()}<main class="wrap">${missionBar()}<section class="lab">
    <div class="pane bench-pane">
      <div class="bench">${benchSvg(state.benchTarget, state.press, state.flash, state.arrows)}</div>
      <div class="recorder ${state.animating ? "lit" : ""}" aria-live="polite"><span class="cam" aria-hidden="true"></span><span class="rec-label">${state.clock || "押し返しの記録計"}</span></div>
      <div class="choose">
        <div><div class="field-label">① 押す速さ</div>
          <div class="seg speed">${PUSH_SECONDS.map((x) => `<button data-set="push" data-val="${x}" aria-pressed="${x === state.push}" ${lock ? "disabled" : ""}>${SPEED_LABEL[x]}<small>${x}秒で押す</small></button>`).join("")}</div>
        </div>
        <div><div class="field-label">② 予想：Bの曲線は、Aの線と比べて？</div>
          <div class="shapes">${(["same", "higher", "lower"] as PredictionChoice[]).map((c) => `<button class="shape" data-act="curve-choice" data-val="${c}" aria-pressed="${ready && pending!.choice === c}" ${lock || narrowed ? "disabled" : ""}>${shapeThumb(c)}<span>${SHAPE_LABEL[c]}</span></button>`).join("")}</div>
        </div>
        <input class="reason" id="reason" maxlength="200" placeholder="そう思った理由（ひとこと・任意）" value="${esc(state.reason)}">
        <div class="go-row">
          <button class="btn go" data-act="observe-curve" ${!ready || lock || narrowed ? "disabled" : ""}>③ 押して、曲線を見る</button>
          ${state.claude ? `<button class="btn claude" data-act="claude-observe" ${!ready || lock || narrowed ? "disabled" : ""} title="予想を選んだこの押し方を、Claude（AI）が許可された操作で実行します">相棒に押してもらう</button>` : ""}
        </div>
      </div>
    </div>
    <div class="pane graph-pane">
      <div class="graph-head"><h2>${curve ? `${speedName(curve.pushSeconds)}押したときの押し返し` : "押し返しの変化（曲線）"}</h2><span class="count">押した回数 ${v.curves.length}</span></div>
      ${resultBanner()}
      ${curveGraphSvg({ pushSeconds: T, b: curve ? curve.b : null, until, yMax, big: true, error: v.error })}
      <div class="legend">
        <span><svg width="26" height="10"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--ink-soft)" stroke-width="2.5" stroke-dasharray="6 4"/></svg>見本A（基準カードの線）</span>
        <span><svg width="26" height="12"><line x1="0" x2="26" y1="6" y2="6" stroke="var(--claude)" stroke-width="3"/><circle cx="13" cy="6" r="3" fill="var(--claude)"/></svg>試料B（測った値、縦線は誤差 ±${v.error}）</span>
        <span>右端の「20秒」が、いつもの検査の時刻</span>
      </div>
      ${v.curves.length > 1 ? `<div class="minis">${v.curves.map((c) => `<button class="mini ${curve && c.id === curve.id ? "on" : ""}" data-act="show-curve" data-id="${c.id}">${curveGraphSvg({ pushSeconds: c.pushSeconds, b: c.b, until: 99, yMax, big: false, error: v.error, title: speedName(c.pushSeconds) })}</button>`).join("")}</div>` : ""}
    </div>
    <div class="pane board">
      <h2>なぜ違う？ 説明の候補 <span class="note">（どれもAと一つだけ違う）</span></h2>
      <ul>${bv.candidates
        .map((c) => {
          const stamp = c.status === "inconsistent" ? `<span class="hanko no ${state.stampNow.includes(c.id) ? "now" : ""}">合わない</span>` : narrowed && bv.narrowedTo === c.id ? `<span class="hanko yes now">決着</span>` : "";
          return `<li class="cand ${c.status} ${narrowed && bv.narrowedTo === c.id ? "decided" : ""} ${state.myCandidates.includes(c.id) ? "mine" : ""}">
            <span class="swatch" style="background:${CAND_COLOR[c.id]}"></span>
            <span class="name">${c.label}<span class="looks">${LOOKS[c.id]}</span>${state.myCandidates.includes(c.id) ? `<span class="mine-tag">あなたの説明</span>` : ""}</span>
            <span class="st">${c.statusLabel}</span>${stamp}</li>`;
        })
        .join("")}</ul>
      <p class="overall ${bv.overall}">${narrowed ? "決着！ " : ""}${bv.overallLabel}</p>
      <p class="rule">「まだ判断できない」は、誤差を2倍に広げたときだけ合うという意味です（確率ではありません）。</p>
      ${narrowed ? `<button class="btn big go" data-act="finish">答え合わせへ</button>` : ""}
      ${claudeNote()}
      <div class="words">
        <input id="words" maxlength="200" placeholder="あなたの説明（例：Bの方がねばっこい）">
        <button class="btn small claude" data-act="words" ${state.busy ? "disabled" : ""}>候補に置きかえる</button>
      </div>
      ${translationBlock()}
      <div class="actions" style="margin-top:10px">
        <button class="btn claude" data-act="hint" ${state.busy || v.hintsLeft <= 0 || narrowed ? "disabled" : ""}>相棒に手がかりを聞く</button>
        ${narrowed ? "" : `<button class="btn ghost small" data-act="finish">ここで終えて答え合わせ</button>`}
      </div>
      ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    </div>
  </section></main>`;
}

/** 曲線を言葉にする：押し終わった直後／2秒後／20秒後に、BはAと比べてどうか */
function describeCurve(v: PublicSessionView, c: CurveView): { start: PredictionChoice; mid: PredictionChoice; text: string } {
  const at = (h: number) => v.records.find((r) => r.id === `${c.id}@${h}`)!;
  const cmp = (h: number): PredictionChoice => {
    const r = at(h);
    const d = r.force - r.baseForce;
    return d > v.error * 2 ? "higher" : d < -v.error * 2 ? "lower" : "same";
  };
  const word = (x: PredictionChoice, strong: string, weak: string) => (x === "higher" ? strong : x === "lower" ? weak : "Aとほぼ同じ");
  const start = cmp(0);
  const mid = cmp(2);
  const end = cmp(20);
  const text = `押し終わった直後：${word(start, "Aより強く押し返す", "Aより弱く押し返す")}　→　2秒後：${word(mid, "まだAより強い", "まだAより弱い")}　→　20秒後：${word(end, "Aより強いまま", "Aより弱いまま")}`;
  return { start, mid, text };
}

function resultBanner(): string {
  const v = state.view!;
  const r = state.lastResult;
  const c = r ? v.curves.find((x) => x.id === r.curveId) : null;
  if (!r || !c || state.animating) return `<div class="result idle">${state.animating ? "測っています…" : "押す速さを選び、予想を選んで押すと、ここに結果が出ます。"}</div>`;
  const d = describeCurve(v, c);
  const actual: PredictionChoice = d.start !== "same" ? d.start : d.mid;
  const hit = r.choice === actual;
  const head = r.choice ? (hit ? "予想どおり！" : "予想が外れた！ ここが発見のチャンス") : "測りました";
  return `<div class="result ${hit ? "hit" : "miss"} fresh">
    <strong>${head}</strong>
    <span class="what">${d.text}</span>
    ${c.excluded.length ? `<span class="excl">→ この曲線と合わなくなった説明：${c.excluded.map((id) => CANDIDATES[id].label).join("、")}</span>` : `<span class="note">この押し方では、合わなくなった説明はありません。別の押し方なら？</span>`}
  </div>`;
}

function claudeNote(): string {
  const h = state.hint;
  if (!h) return "";
  const stageName = ["予想を選ぶ", "どこに注目するか", "比べ方", "試す押し方"][h.stage - 1];
  return `<div class="claude-note fresh" aria-live="polite">
    <div class="who"><span class="ai-dot"></span>Claude（AI）のメモ ・ ${stageName}</div>
    <p>${esc(h.text)}</p>
    ${h.suggestion ? `<button class="btn small claude" data-act="use-suggestion" data-push="${h.suggestion.pushSeconds}">この押し方にする：${speedName(h.suggestion.pushSeconds)}</button>` : ""}
    <div class="src">${h.source === "claude" ? "あなたと同じ記録と判定だけを見て書いています。答えは知りません。" : "定型のヒントです。"}</div>
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
function causeKind(d: Debrief): "relax" | "instant" | null {
  if (d.truth.tau !== d.base.tau) return "relax";
  if (d.truth.e1 !== d.base.e1) return "instant";
  return null;
}

function renderDebrief(): string {
  const d = state.debrief!;
  const names = { eInf: "待ったあとも残るかたさ（E∞）", e1: "押した直後だけ上乗せされるかたさ（E1）", tau: "上乗せ分がやわらぐ時間の目安（τ）" } as const;
  const keys = d.keyCurves.map((k) => `<li><strong>${speedName(k.pushSeconds)}押した曲線</strong><br>→ ${k.excluded.map((c) => CANDIDATES[c].label).join("、")}が合わなくなった</li>`).join("");
  const kind = causeKind(d);
  return `${topbar()}<main class="wrap">${missionBar()}<section class="page">
    <p class="kicker">答え合わせ</p>
    <h1 class="reveal-head">${esc(d.explanation)}</h1>
    <div class="two">
      <div class="pane">
        <h2>Bの正体（ふつうに押したときの5時刻）</h2>
        ${revealSvg(d.allTimes)}
        <p class="note">押した直後のかたさは E∞＋E1。待つと上乗せ分がやわらいで E∞ の分だけが残るので、20秒後（いつもの検査）はAとBが同じに見えました。</p>
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
      <p>${
        kind === "relax"
          ? "Bは「押し返しが抜けるのに時間がかかる」素材でした。いつもの検査（20秒後）では抜けきっているので同じに見えます。押してからの途中を見たから見えました。"
          : kind === "instant"
            ? "Bは「押した直後の押し返しの強さ」が違う素材でした。いつもの検査（20秒後）では上乗せ分が抜けきっているので同じに見えます。押した直後を見たから見えました。"
            : "いつもの検査だけでは、違いは見えませんでした。"
      }</p>
      <p><strong>では、あなたは「いつもの検査をすり抜ける素材」を自分でつくれるでしょうか？</strong></p>
    </div>
    <div class="actions" style="margin-top:20px"><button class="btn big" data-act="to-make">素材をつくってみる</button></div>
  </section></main>`;
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
        <p class="note">見本Aは、三つとも 1.00 です。</p>
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
    head = `<div class="goal-box ${r.passed ? "pass" : ""}">
      <p class="goal">${esc(m.goal)}</p>
      <ul class="checks">
        <li class="${r.usualOk ? "ok" : ""}">${r.usualOk ? "✓" : "・"} いつもの検査（ふつうに押して20秒後）${state.mission === "hideFromUsual" ? "で「見本と同じ」と判定される" : "で「見本と違う」と判定される"}：見本との差 ${d.usual >= 0 ? "+" : ""}${d.usual.toFixed(3)}</li>
        <li class="${r.quickOk ? "ok" : ""}">${r.quickOk ? "✓" : "・"} すばやい検査（すばやく押した直後）${state.mission === "hideFromUsual" ? "で違いがバレる" : "で見本とそっくり"}：見本との差 ${d.quick >= 0 ? "+" : ""}${d.quick.toFixed(3)}</li>
      </ul>
      ${r.passed ? `<span class="hanko yes big-stamp ${firstPass ? "now" : ""}">達成</span><p class="win">${state.mission === "hideFromUsual" ? "いつもの検査をすり抜けた！ 違いは「押した直後」や「抜けていく途中」に隠れています。" : "逆もできた！ すばやく押す検査だけでも、見落とす違いがあります。"}</p>` : ""}
    </div>`;
  } else {
    head = `<div class="goal-box"><p class="goal">好きな素材をつくって、曲線がどう変わるかを見よう。</p>
      <ul class="checks"><li>いつもの検査の差 ${d.usual >= 0 ? "+" : ""}${d.usual.toFixed(3)}</li><li>すばやい検査の差 ${d.quick >= 0 ? "+" : ""}${d.quick.toFixed(3)}</li></ul></div>`;
  }
  el.innerHTML = `${head}
    <div class="make-graphs">
      <div class="pane">${makeGraphSvg(p, 1, 20, "いつもの検査：ふつう（1秒）に押して20秒後", usualOk)}</div>
      <div class="pane">${makeGraphSvg(p, 0.2, 0, "すばやい検査：すばやく（0.2秒）押した直後", quickOk)}</div>
    </div>
    <p class="note">点線：見本A　緑の線：あなたの素材　縦の点線：検査の時刻（白丸がA、緑の丸があなたの素材）</p>`;
  for (const k of ["eInf", "e1", "tau"] as const) {
    const v = document.querySelector(`#val-${k}`);
    if (v) v.textContent = state.mat[k].toFixed(2);
  }
}

// ---------- 第2幕 ----------
function renderAct2(): string {
  const runs = state.act2Runs;
  const kind = state.debrief ? causeKind(state.debrief) : null;
  const bridge =
    kind === "relax"
      ? "あなたが見つけたのは「押し返しが抜けるまでの時間」の違い。細胞の膜では、それは何にあたるだろう？"
      : kind === "instant"
        ? "あなたが見つけたのは「押した直後の押し返しの強さ」の違い。今度は「抜けていく速さ」が、細胞の膜では何で決まるかを見てみよう。"
        : "第1幕で見た「時間をかけてやわらぐ変化」が、細胞の膜では何にあたるかを見てみよう。";
  const allRight = runs.length >= 2 && state.act2Guess === "faster";
  return `${topbar()}<main class="wrap">${missionBar()}<section class="page act2">
    <p class="kicker">見方を変える</p>
    <h1>同じ形の変化は、細胞の中にもある</h1>
    <p class="lead">${bridge}</p>
    <div class="lens-switch" role="group" aria-label="見方">
      <button class="${state.lens === "circuit" ? "on" : ""}" data-act="lens" data-val="circuit">電気の見方<small>素材と同じ形の式</small></button>
      <button class="${state.lens === "membrane" ? "on" : ""}" data-act="lens" data-val="membrane">細胞の膜の見方<small>等価回路</small></button>
    </div>
    <div class="${state.lensFlip ? "flip" : ""}">${circuitSvg(state.lens)}</div>
    <p class="caution">素材の中に回路があるわけではありません（式の形が同じだけ）。細胞の膜では、電荷がたまりイオンが動くという電気の現象が実際に起きていて、その性質を回路で表します。ここではイオンの通りやすさが一定の「受け身の膜」だけを扱います。値は計算値です。</p>
    <h2 class="q">イオンが通りやすくなると、電流を止めた後、もとの電位へ戻るのは速くなる？ 遅くなる？</h2>
    <div class="two">
      <div>
        <div class="field-label">まず予想</div>
        <div class="seg">${(["faster", "same", "slower"] as Act2Guess[]).map((g) => `<button data-set="act2guess" data-val="${g}" aria-pressed="${state.act2Guess === g}">${GUESS_LABEL[g]}</button>`).join("")}</div>
        <div class="actions" style="margin:8px 0"><button class="btn ghost small" data-act="act2-save" ${!state.act2Guess ? "disabled" : ""}>予想を保存</button>${state.act2Saved ? `<span class="note">保存：「${GUESS_LABEL[state.act2Guess!]}」</span>` : ""}</div>
        <div class="field-label">イオンの通りやすさ <span class="note">（通りやすい＝抵抗が小さい）</span></div>
        <div class="seg">${(["easier", "same", "harder"] as Permeability[]).map((p) => `<button data-set="perm" data-val="${p}" aria-pressed="${state.perm === p}">${PERM_LABEL[p]}</button>`).join("")}</div>
        <div class="actions" style="margin-top:8px"><button class="btn go" data-act="act2-run" ${!state.act2Saved ? "disabled" : ""}>電流を入れて、止める</button></div>
        <ul class="runs">${runs.map((r) => `<li style="border-color:${RUN_COLORS[r.perm]}">${PERM_LABEL[r.perm]}<br><strong>半分に戻るまで ${(r.half ?? 0).toFixed(2)}</strong>（止めた時の差 ${r.deltaAtStop.toFixed(2)}）</li>`).join("")}</ul>
        ${runs.length >= 2 ? `<p class="result ${allRight ? "hit" : "miss"}"><strong>${allRight ? "予想どおり！" : "予想とくらべてみよう"}</strong><span>通りやすいほど速く戻り、通りにくいほどゆっくり戻る。第1幕の「押し返しが抜けるのに時間がかかる素材」は、膜なら「イオンが通りにくい」と同じ形です。</span></p>` : ""}
      </div>
      <div class="pane">${act2GraphSvg(runs)}
        <p class="note">止めた時の高さは、通りやすさでも変わります。戻る速さは、右の「割った表示」と「半分に戻るまで」で比べます。時間の目盛りは素材と同じに伸ばしています（実際の膜はずっと速い）。</p>
      </div>
    </div>
    ${runs.length >= 2 ? thoughtBlock() : ""}
    <div class="actions" style="margin-top:16px"><button class="btn big" data-act="to-reflect" ${runs.length < 2 ? "disabled" : ""}>振り返りへ</button>${runs.length < 2 ? `<span class="note">通りやすさを変えて二回以上試すと進めます。</span>` : ""}</div>
  </section></main>`;
}

function thoughtBlock(): string {
  const g = state.thoughtGuess;
  return `<section class="thought pane">
    <p class="kicker">もしも、の思考実験</p>
    <h2 class="q">もしも、イオンの通り道が「マイナスの抵抗」のように働いたら？</h2>
    <p>通りやすくすると速く戻り、通りにくくするとゆっくり戻りました。では、抵抗をゼロよりさらに下、マイナスにしたら、止めた後はどうなるだろう？</p>
    <div class="two">
      <div>
        <div class="field-label">予想</div>
        <div class="seg">${(["fasterStill", "slower", "noReturn"] as ThoughtGuess[]).map((x) => `<button data-set="thought" data-val="${x}" aria-pressed="${g === x}" ${state.thoughtShown ? "disabled" : ""}>${THOUGHT_GUESS_LABEL[x]}</button>`).join("")}</div>
        <div class="actions" style="margin-top:10px"><button class="btn go" data-act="thought-run" ${!g || state.thoughtShown ? "disabled" : ""}>マイナスにして、電流を入れて止める</button></div>
        ${
          state.thoughtShown
            ? `<div class="result ${g === "noReturn" ? "hit" : "miss"} fresh"><strong>${g === "noReturn" ? "予想どおり！ 戻らない" : "予想が外れた！ 戻らずに離れていく"}</strong>
              <span>マイナスの抵抗では、止めた後に基準へ戻らず、差がどんどん大きくなります（跳ね上がる）。</span></div>
              <div class="reveal-box">
                <p><strong>ありえない？</strong> ふつうの抵抗器や素材は、ひとりでにマイナスにはなりません。エネルギーが湧いて出ることになるからです。</p>
                <p><strong>でも、体の中では起きている。</strong> 神経の膜では、電位が少し上がるとナトリウムの通り道が開き、電位がさらに上がります。この区間はマイナスの抵抗のように働き、電位が一気に跳ね上がります。これが神経の信号（活動電位）の始まりです。</p>
                <p><strong>エネルギーはどこから？</strong> ポンプがイオンを運んで保っている「イオンの濃さの差」（化学）が、跳ね上がりのエネルギー源です。</p>
                <p class="note">ここでは跳ね上がる向きだけを見せています。通り道が閉じて元に戻るしくみなど、活動電位の詳しい時間変化は扱っていません。</p>
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

// ---------- 振り返り ----------
function mapSvg(): string {
  const node = (x: number, y: number, title: string, sub: string, color: string, dashed = false) => `
    <g><rect x="${x}" y="${y}" width="196" height="64" rx="12" fill="#fff" stroke="${color}" stroke-width="2.5" ${dashed ? 'stroke-dasharray="5 4"' : ""}/>
    <text x="${x + 14}" y="${y + 27}" font-size="15" font-weight="700" fill="var(--ink)">${title}</text>
    <text x="${x + 14}" y="${y + 49}" font-size="12" fill="var(--ink-soft)">${sub}</text></g>`;
  return `<svg viewBox="0 0 640 260" role="img" aria-label="見方のつながり">
    <ellipse cx="320" cy="130" rx="122" ry="36" fill="var(--claude-wash)" stroke="var(--claude)" stroke-width="2"/>
    <text x="320" y="126" text-anchor="middle" font-size="15" font-weight="700" fill="var(--claude)">時間をかけてやわらぐ変化</text>
    <text x="320" y="147" text-anchor="middle" font-size="12" fill="var(--ink-soft)">戻る速さは時定数／マイナスなら跳ね上がる</text>
    <path d="M207 60 L260 104 M433 60 L380 104 M207 200 L260 156 M433 200 L380 156" stroke="var(--line)" stroke-width="2.5"/>
    ${node(10, 20, "素材（力学・物理）", "ばねとダンパ、押し方と一瞬", "var(--overall)")}
    ${node(434, 20, "回路（電気・物理）", "抵抗とコンデンサ、同じ形の式", "var(--ink-soft)")}
    ${node(10, 176, "細胞の膜（化学→電気）", "イオンの濃さの差と通り道", "var(--relax)")}
    ${node(434, 176, "血管（生体）", "条件で硬さの見え方が変わる", "var(--instant)", true)}
  </svg>`;
}

function renderReflect(): string {
  const r = state.view?.reflection;
  const f = (id: string, label: string, val = "") => `<label>${label}<textarea id="${id}" maxlength="400">${esc(val)}</textarea></label>`;
  return `${topbar()}<main class="wrap">${missionBar()}<section class="page reflect">
    <p class="kicker">振り返り</p>
    <h1>一つの変化を、四つの見方で</h1>
    <div class="map pane">${mapSvg()}</div>
    <p class="note">血管の段は、次に作る予定の段です（点線）。</p>
    ${f("r1", "最初の予想は？", r?.firstGuess)}
    ${f("r2", "決め手になった観察は？ なぜそれで分かれた？", r?.keyObservation)}
    ${f("r3", "一つの押し方・一つの瞬間だけでは分からなかったことは？", r?.notEnoughWithOne)}
    ${f("r4", "見つけたことを、別の教科（電気・化学・生物）の言葉で言い直すと？", r?.otherSubjectWords)}
    <div class="actions"><button class="btn big" data-act="save-reflect">保存する</button></div>
    ${state.phase === "done" ? `<p class="note">保存しました。この記録はこの画面の中だけで使い、氏名などは集めていません。</p>` : ""}
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
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function valueAt(pts: readonly { t: number; force: number }[], t: number): number {
  let last = 0;
  for (const p of pts) {
    if (p.t > t + 1e-9) break;
    last = p.force;
  }
  return last;
}

/** いつもの検査：AとBを押して、20秒後にだけ値を出す */
async function playIntro() {
  state.introDone = false;
  const reduce = reduceMotion();
  await sleep(reduce ? 0 : 500);
  state.animating = true;
  state.benchTarget = "both";
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
    state.clock = `そのまま待つ ${(((performance.now() - s2) / ff) * 20).toFixed(1)}秒（早送り）`;
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
  state.press = 0;
  render();
}

/** 押して、曲線が時間とともに伸びていく。押し返しの矢印も測った値で伸び縮みする */
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
      state.clock = `押しています… ${t.toFixed(1)}秒`;
    } else if (el < pushMs + holdMs) {
      const h = ((el - pushMs) / holdMs) * HOLD_MAX;
      t = T + h;
      state.press = 1;
      state.clock = `押し終わってから ${h.toFixed(1)}秒（早送り）`;
    } else break;
    state.drawUntil = t;
    state.arrows = { a: valueAt(c.a, t), b: valueAt(c.b, t) };
    render();
    await sleep(45);
  }
  state.drawUntil = T + HOLD_MAX;
  state.arrows = { a: valueAt(c.a, T + HOLD_MAX), b: valueAt(c.b, T + HOLD_MAX) };
  state.clock = "20秒後（いつもの検査の時刻）";
  state.animating = false;
  state.boardView = null;
  state.press = 0;
  state.stampNow = [...c.excluded];
  render();
  setTimeout(() => {
    state.stampNow = [];
  }, 1200);
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
  });
  if (state.phase === "intro") void playIntro();
}

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "reason") state.reason = t.value;
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
  if (set) {
    const val = el.dataset.val!;
    if (set === "push") {
      state.push = Number(val) as PushSeconds;
    }
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
      state.benchTarget = "B";
      render();
      break;
    case "curve-choice": {
      if (!v) return;
      const choice = el.dataset.val as PredictionChoice;
      await guard(async () => {
        state.view = (await api.curvePredict(v.sessionId, state.push, choice, state.reason)).view;
      });
      break;
    }
    case "observe-curve":
    case "claude-observe": {
      if (!v || !v.pendingCurve) return;
      const choice = v.pendingCurve.choice;
      const byPartner = el.dataset.act === "claude-observe";
      await guard(async () => {
        const res = byPartner ? await api.claudeObserve(v.sessionId, state.push, crypto.randomUUID()) : await api.observeCurve(v.sessionId, state.push, crypto.randomUUID());
        const note = "note" in res ? (res as { note: Hint }).note : null;
        state.boardView = state.view;
        state.view = res.view;
        const c = res.view.curves[res.view.curves.length - 1]!;
        state.lastResult = { curveId: c.id, choice };
        state.busy = false;
        state.hint = null;
        await playCurve(c);
        state.reason = "";
        state.hint = note;
      });
      break;
    }
    case "show-curve":
      state.shownCurveId = el.dataset.id ?? null;
      render();
      break;
    case "hint":
      if (!v) return;
      await guard(async () => {
        const res = await api.hint(v.sessionId);
        state.view = res.view;
        state.hint = res.hint;
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
      const id = el.dataset.id as CandidateId;
      if (!state.myCandidates.includes(id)) state.myCandidates = [...state.myCandidates, id];
      state.translation = null;
      render();
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
      render();
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
      const val = (id: string) => document.querySelector<HTMLTextAreaElement>(`#${id}`)?.value ?? "";
      const reflection = { firstGuess: val("r1"), keyObservation: val("r2"), notEnoughWithOne: val("r3"), otherSubjectWords: val("r4") };
      await guard(async () => {
        state.view = (await api.reflection(v.sessionId, reflection)).view;
        state.phase = "done";
      });
      break;
    }
  }
});

status().then((s) => {
  state.claude = s.claude;
  render();
});
render();
