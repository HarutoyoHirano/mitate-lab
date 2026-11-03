// ミカタ・ラボの画面。サーバーから受け取る公開ビューだけで描く。
import { CANDIDATES, PUSH_SECONDS, RECORD_AT, type CandidateId, type ObservationSpec, type PushSeconds, type RecordAt } from "../server/model/public.js";
import type { Permeability } from "../server/model/circuit.js";
import { act2GraphSvg, circuitSvg, GUESS_LABEL, PERM_LABEL, RUN_COLORS, runAct2, type Act2Guess, type Act2Run, type Lens } from "./act2.js";
import { api, status, type Debrief, type Hint, type PredictionChoice, type PublicSessionView, type Translation } from "./api.js";
import { benchSvg, CAND_COLOR, graphHtml, TIME_LABEL } from "./draw.js";

type Phase = "start" | "lab" | "debrief" | "act2" | "reflect" | "done";

const PRED_LABEL: Record<PredictionChoice, string> = { higher: "Aより大きい", same: "Aと同じくらい", lower: "Aより小さい" };
const QUESTION = "押して、しばらく待つと、同じ力に落ち着く二つの素材。本当に同じ？ どう測れば違いが分かる？";

const state = {
  phase: "start" as Phase,
  claude: false,
  view: null as PublicSessionView | null,
  push: 1 as PushSeconds,
  at: 0 as RecordAt,
  choice: null as PredictionChoice | null,
  reason: "",
  busy: false,
  animating: false,
  press: 0,
  benchTarget: "B" as "A" | "B",
  clock: "",
  reading: null as number | null,
  hint: null as Hint | null,
  translation: null as Translation | null,
  myCandidates: [] as CandidateId[],
  error: "",
  debrief: null as Debrief | null,
  lens: "circuit" as Lens,
  perm: "easier" as Permeability,
  act2Guess: null as Act2Guess | null,
  act2Runs: [] as Act2Run[],
  act2Saved: false,
};

const app = document.querySelector<HTMLDivElement>("#app")!;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function selectedSpec(): ObservationSpec {
  return { pushSeconds: state.push, recordAt: state.at };
}

function specLabel(s: ObservationSpec): string {
  return `${s.pushSeconds}秒かけて押し、${TIME_LABEL[s.recordAt]}を記録`;
}

function topbar(): string {
  return `<header class="topbar">
    <div class="brand">ミカタ・ラボ<small>見方を変える実験室</small></div>
    <div class="question">${QUESTION}</div>
    <span class="ai-badge ${state.claude ? "" : "off"}">${state.claude ? "Claude（AI）が相棒として参加中" : "Claude（AI）は休止中：定型のヒントで進めます"}</span>
  </header>`;
}

// ---------- 開始画面 ----------
function renderStart(): string {
  return `${topbar()}<main class="wrap"><section class="start">
    <div>
      <h1>押して、待つと、同じ。<br>本当に同じ素材だろうか。</h1>
      <p class="lead">試験台に、見た目がそっくりな素材AとBがあります。ゆっくり押して20秒待つと、押し返す力はどちらも同じになります。</p>
      <p>あなたの仕事は、押す時間と、力を記録する時刻を選んで、違いがあるか、あるならどこが違うのかを確かめることです。一回押すごとに、記録できるのは一つの時刻だけです。</p>
      <p class="note">素材は計算で作った仮想の素材です（Aが落ち着いた力を1とする）。実在の物質や体の組織、医療機器を再現したものではありません。画面の「Claude（AI）」はAIで、隠れた答えを知りません。</p>
      <div class="actions"><button class="btn" data-act="start">実験を始める</button></div>
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
    <div class="pane bench-pane bench">${benchSvg("B", 0)}</div>
  </section></main>`;
}

// ---------- 実験室（第1幕） ----------
function renderLab(): string {
  const v = state.view!;
  const intro = v.records[0];
  const introA = v.measuredA[0];
  const sel = selectedSpec();
  const pending = v.pendingPrediction;
  const ready = pending && pending.pushSeconds === sel.pushSeconds && pending.recordAt === sel.recordAt;
  const seg = <T extends number | string>(name: string, items: readonly T[], cur: T, label: (x: T) => string) =>
    `<div class="seg" role="group" aria-label="${name}">${items
      .map((x) => `<button data-set="${name}" data-val="${x}" aria-pressed="${x === cur}" ${state.animating ? "disabled" : ""}>${label(x)}</button>`)
      .join("")}</div>`;
  const narrowed = v.overall === "narrowed";
  return `${topbar()}<main class="wrap"><section class="lab">
    <div class="pane bench-pane">
      <h2>試験台</h2>
      <div class="bench">${benchSvg(state.benchTarget, state.press)}</div>
      <div class="readout" aria-live="polite">
        <span>${state.clock || "押し返す力"}</span>
        <strong>${state.reading !== null ? state.reading.toFixed(3) : "—"}</strong>
        ${state.animating && state.clock.includes("早送り") ? `<span class="ff">早送り</span>` : ""}
      </div>
      <p class="note">最初の観察：1秒かけて押して20秒後、Aは ${introA?.force.toFixed(3)}、Bは ${intro?.force.toFixed(3)}。同じに見えます。</p>
      <div class="choose">
        <div><div class="field-label">押す時間</div>${seg("push", PUSH_SECONDS, state.push, (x) => `${x}秒`)}</div>
        <div><div class="field-label">力を記録する時刻</div>${seg("at", RECORD_AT, state.at, (x) => TIME_LABEL[x]!)}</div>
        <div><div class="field-label">予想：同じ押し方・時刻で、Bは</div>${seg("choice", ["higher", "same", "lower"] as PredictionChoice[], state.choice ?? ("" as PredictionChoice), (x) => PRED_LABEL[x])}</div>
        <input class="reason" id="reason" maxlength="200" placeholder="理由（ひとこと・任意）" value="${esc(state.reason)}">
        <div class="actions">
          <button class="btn ghost" data-act="predict" ${!state.choice || state.busy || state.animating || narrowed ? "disabled" : ""}>予想を保存</button>
          <button class="btn" data-act="observe" ${!ready || state.busy || state.animating || narrowed ? "disabled" : ""}>Bを押して記録する</button>
          <button class="btn ghost small" data-act="measure-a" ${state.busy || state.animating ? "disabled" : ""}>同じ条件でAも押す</button>
        </div>
        <p class="note">${ready ? `保存した予想：${specLabel(pending!)}で「${PRED_LABEL[pending!.choice]}」` : "予想を保存すると、Bを押せます。"}</p>
      </div>
    </div>
    <div class="pane graph-pane">
      <h2>記録</h2>
      ${graphHtml(v, sel)}
      <div class="log"><h2>観察の記録（${v.observationCount}回）</h2><ol>${v.records
        .slice(1)
        .map(
          (r) => `<li>${specLabel(r)}：${r.force.toFixed(3)}（Aの基準値 ${r.baseForce.toFixed(3)}）${r.prediction ? `　予想「${PRED_LABEL[r.prediction.choice]}」` : ""}${
            r.excluded.length ? ` <span class="excluded">→ 合わなくなった：${r.excluded.map((c) => CANDIDATES[c].label).join("、")}</span>` : ""
          }</li>`,
        )
        .join("")}</ol></div>
    </div>
    <div class="pane board">
      <h2>説明の候補</h2>
      <ul>${v.candidates
        .map(
          (c) => `<li class="cand ${c.status} ${state.myCandidates.includes(c.id) ? "mine" : ""}">
            <span class="swatch" style="background:${CAND_COLOR[c.id]}"></span>
            <span class="name">${c.label}${state.myCandidates.includes(c.id) ? "<br><span class=\"note\">あなたの説明</span>" : ""}</span>
            <span class="st">${c.statusLabel}</span></li>`,
        )
        .join("")}</ul>
      <p class="overall ${v.overall}">${v.overallLabel}</p>
      <p class="rule">どの候補も「Aと一つだけ違う」という決まりで比べています。「まだ判断できない」は、誤差を2倍に広げたときだけ合う、という意味です（確率ではありません）。</p>
      ${claudeNote()}
      <div class="words">
        <input id="words" maxlength="200" placeholder="あなたの説明（例：Bの方がねばっこい）">
        <button class="btn small claude" data-act="words" ${state.busy ? "disabled" : ""}>候補に置きかえる</button>
      </div>
      ${translationBlock()}
      <div class="actions" style="margin-top:12px">
        <button class="btn claude" data-act="hint" ${state.busy || v.hintsLeft <= 0 ? "disabled" : ""}>Claude（AI）に次の手がかりを聞く</button>
        <button class="btn ${narrowed ? "" : "ghost"}" data-act="finish">${narrowed ? "解説を見る" : "ここで終えて解説を見る"}</button>
      </div>
      ${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}
    </div>
  </section></main>`;
}

function claudeNote(): string {
  const h = state.hint;
  if (!h) return "";
  const stageName = ["予想を保存する", "どこに注目するか", "比べ方", "試す観察"][h.stage - 1];
  return `<div class="claude-note" aria-live="polite">
    <div class="who">Claude（AI）の書き込み ・ ${stageName}</div>
    <p>${esc(h.text)}</p>
    ${h.suggestion ? `<button class="btn small claude" data-act="use-suggestion" data-push="${h.suggestion.pushSeconds}" data-at="${h.suggestion.recordAt}">この観察を選ぶ：${specLabel(h.suggestion)}</button>` : ""}
    <div class="src">${h.source === "claude" ? "Claude（AI）が、あなたと同じ記録と判定だけを見て書きました。" : "定型のヒントです。"}</div>
  </div>`;
}

function translationBlock(): string {
  const t = state.translation;
  if (!t) return "";
  const ids = t.candidateIds.length ? t.candidateIds : (["overall", "instant", "relax", "same"] as CandidateId[]);
  return `<div class="claude-note">
    <div class="who">${t.source === "claude" ? "Claude（AI）の確認" : "確認"}</div>
    <p>${esc(t.confirmQuestion)}</p>
    <div class="chips">${ids.map((id) => `<button class="chip" style="color:${CAND_COLOR[id]}" data-act="confirm-cand" data-id="${id}">${CANDIDATES[id].label}</button>`).join("")}</div>
  </div>`;
}

// ---------- 解説 ----------
function renderDebrief(): string {
  const d = state.debrief!;
  const v = state.view!;
  const names = { eInf: "待ったあとも残るかたさ（E∞）", e1: "押した直後だけ上乗せされるかたさ（E1）", tau: "上乗せ分がやわらぐ時間の目安（τ）" } as const;
  const key = d.keyObservations
    .map((k) => {
      const r = v.records.find((x) => x.id === k.id);
      return r ? `<li>${specLabel(r)} → ${k.excluded.map((c) => CANDIDATES[c].label).join("、")}が合わなくなった</li>` : "";
    })
    .join("");
  return `${topbar()}<main class="wrap"><section class="page">
    <h1>解説：Bは何が違ったのか</h1>
    <p class="reveal">${esc(d.explanation)}</p>
    <div class="two">
      <div>
        <h2>値の比較</h2>
        <table class="vals"><tr><th></th><th>A（基準）</th><th>B</th></tr>
        ${(["eInf", "e1", "tau"] as const).map((k) => `<tr><td>${names[k]}</td><td>${d.base[k]}</td><td>${d.truth[k].toFixed(2)}</td></tr>`).join("")}</table>
        <p class="note">押した直後のかたさは E∞＋E1 です。十分待つと上乗せ分がやわらぎ、E∞ の分だけが残ります。だから、待ったあとはAとBが同じに見えました。τ は、上乗せ分が元の約37%になるまでの時間の目安です。</p>
        <p class="note">このモデルは「標準線形固体」と呼ばれる、ばね二つとダンパ一つの組み合わせです。実在の素材の構造を証明したものではありません。</p>
      </div>
      <div>
        <h2>あなたの観察（${d.observationCount}回）</h2>
        <ul>${key || "<li>候補を退けた観察はまだありません。</li>"}</ul>
        <p class="note">回数の多い少ないは優劣ではありません。どの観察が説明を分けたかを振り返りましょう。</p>
      </div>
    </div>
    <div class="actions" style="margin-top:20px"><button class="btn" data-act="to-act2">第2幕：見方を変える</button></div>
  </section></main>`;
}

// ---------- 第2幕 ----------
function renderAct2(): string {
  const runs = state.act2Runs;
  return `${topbar()}<main class="wrap"><section class="page act2">
    <h1>第2幕：同じ変化を、別の見方で</h1>
    <p>第1幕で見つけた「上乗せ分が時間をかけてやわらぐ」変化は、同じ形の式で電気回路に書けます。そして、細胞の膜では、電荷がたまり、イオンが動くという電気の現象が実際に起きていて、同じ形の回路（等価回路）で表せます。</p>
    <div class="actions" style="margin:8px 0">
      <button class="btn ${state.lens === "circuit" ? "" : "ghost"} small" data-act="lens" data-val="circuit">電気の見方（素材と同じ形の式）</button>
      <button class="btn ${state.lens === "membrane" ? "" : "ghost"} small" data-act="lens" data-val="membrane">細胞の膜の見方（等価回路）</button>
    </div>
    ${circuitSvg(state.lens)}
    <p class="caution">素材の中に回路があるわけではありません（式の形が同じだけです）。細胞の膜では電気の現象が実際に起きていて、その性質を回路で表します。ここでは、イオンの通りやすさが一定の「受け身の膜」だけを扱います。神経の信号（活動電位）はこの先の話です。値は計算値で、測定の誤差は付けていません。</p>
    <h2>問い：イオンが通りやすくなると、電流を止めた後、基準の電位へ戻るのは速くなる？ 遅くなる？</h2>
    <div class="two">
      <div>
        <div class="field-label">予想</div>
        <div class="seg">${(["faster", "same", "slower"] as Act2Guess[]).map((g) => `<button data-set="act2guess" data-val="${g}" aria-pressed="${state.act2Guess === g}">${GUESS_LABEL[g]}</button>`).join("")}</div>
        <div class="actions" style="margin:8px 0"><button class="btn ghost small" data-act="act2-save" ${!state.act2Guess ? "disabled" : ""}>予想を保存</button>${state.act2Saved ? `<span class="note">保存しました：「${GUESS_LABEL[state.act2Guess!]}」</span>` : ""}</div>
        <div class="field-label">イオンの通りやすさ（通りやすい＝抵抗が小さい）</div>
        <div class="seg">${(["easier", "same", "harder"] as Permeability[]).map((p) => `<button data-set="perm" data-val="${p}" aria-pressed="${state.perm === p}">${PERM_LABEL[p]}</button>`).join("")}</div>
        <div class="actions" style="margin-top:8px"><button class="btn" data-act="act2-run" ${!state.act2Saved ? "disabled" : ""}>電流を入れて止める</button></div>
        <ul>${runs.map((r) => `<li style="color:${RUN_COLORS[r.perm]}">${PERM_LABEL[r.perm]}：止めた時の差 ${r.deltaAtStop.toFixed(2)}、半分に戻るまで ${r.half.toFixed(2)}</li>`).join("")}</ul>
        <p class="note">止めた時の高さは、通りやすさで変わります。戻る速さを比べるには、右の「割った表示」と「半分に戻るまでの時間」を見ましょう。時間の目盛りは、素材と同じに伸ばしています。実際の膜の変化はずっと短い時間で起きます。</p>
      </div>
      <div>${act2GraphSvg(runs)}
        <p class="note">第1幕とのつながり：「上乗せ分がやわらぐのが遅い素材」と「イオンが通りにくい膜」は、どちらも時定数（抵抗×コンデンサ）が長い、という同じ形です。</p>
      </div>
    </div>
    <div class="actions" style="margin-top:16px"><button class="btn" data-act="to-reflect" ${runs.length < 2 ? "disabled" : ""}>振り返りへ</button>${runs.length < 2 ? `<span class="note">通りやすさを変えて、二回以上試すと進めます。</span>` : ""}</div>
  </section></main>`;
}

// ---------- 振り返り ----------
function mapSvg(): string {
  const node = (x: number, y: number, title: string, sub: string, color: string, dashed = false) => `
    <g><rect x="${x}" y="${y}" width="190" height="64" rx="10" fill="#fff" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="5 4"' : ""}/>
    <text x="${x + 12}" y="${y + 26}" font-size="15" font-weight="700" fill="var(--ink)">${title}</text>
    <text x="${x + 12}" y="${y + 48}" font-size="12" fill="var(--ink-soft)">${sub}</text></g>`;
  return `<svg viewBox="0 0 640 260" role="img" aria-label="見方のつながり">
    <ellipse cx="320" cy="130" rx="118" ry="34" fill="var(--claude-wash)" stroke="var(--claude)"/>
    <text x="320" y="126" text-anchor="middle" font-size="14" font-weight="700" fill="var(--claude)">時間をかけてやわらぐ変化</text>
    <text x="320" y="146" text-anchor="middle" font-size="12" fill="var(--ink-soft)">時定数（どれくらいでやわらぐか）</text>
    <path d="M205 60 L262 104 M435 60 L378 104 M205 200 L262 156 M435 200 L378 156" stroke="var(--line)" stroke-width="2"/>
    ${node(16, 20, "素材（力学・物理）", "ばねとダンパ、押し方と時刻", "var(--overall)")}
    ${node(434, 20, "回路（電気・物理）", "抵抗とコンデンサ、同じ形の式", "var(--ink-soft)")}
    ${node(16, 176, "細胞の膜（化学→電気）", "イオンの濃さの差と通り道", "var(--relax)")}
    ${node(434, 176, "血管（生体）", "条件で硬さの見え方が変わる（次の段）", "var(--instant)", true)}
  </svg>`;
}

function renderReflect(): string {
  const r = state.view?.reflection;
  const f = (id: string, label: string, val = "") => `<label>${label}<textarea id="${id}" maxlength="400">${esc(val)}</textarea></label>`;
  return `${topbar()}<main class="wrap"><section class="page reflect">
    <h1>振り返り</h1>
    <div class="map">${mapSvg()}</div>
    <p class="note">血管の段は、次に作る予定の段です（点線）。</p>
    ${f("r1", "最初の予想は？", r?.firstGuess)}
    ${f("r2", "決め手になった観察は？ なぜそれで分かれた？", r?.keyObservation)}
    ${f("r3", "一つの押し方・一つの時刻だけでは分からなかったことは？", r?.notEnoughWithOne)}
    ${f("r4", "見つけたことを、別の教科（電気・化学・生物）の言葉で言い直すと？", r?.otherSubjectWords)}
    <div class="actions"><button class="btn" data-act="save-reflect">保存する</button></div>
    ${state.phase === "done" ? `<p class="note">保存しました。この記録はこの画面の中だけで使い、氏名などは集めていません。</p>` : ""}
  </section></main>`;
}

function render(): void {
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.id ? `#${active.id}` : null;
  const words = (document.querySelector<HTMLInputElement>("#words")?.value) ?? "";
  if (state.phase === "start") app.innerHTML = renderStart();
  else if (state.phase === "lab") app.innerHTML = renderLab();
  else if (state.phase === "debrief") app.innerHTML = renderDebrief();
  else if (state.phase === "act2") app.innerHTML = renderAct2();
  else app.innerHTML = renderReflect();
  const w = document.querySelector<HTMLInputElement>("#words");
  if (w) w.value = words;
  if (focusKey) document.querySelector<HTMLElement>(focusKey)?.focus();
}

// ---------- 押す動き（真の曲線は描かず、記録する時刻にだけ値を出す） ----------
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function animatePush(target: "A" | "B", spec: ObservationSpec, value: number): Promise<void> {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  state.animating = true;
  state.benchTarget = target;
  state.reading = null;
  const pushMs = reduce ? 0 : spec.pushSeconds * 1000;
  const start = performance.now();
  while (performance.now() - start < pushMs) {
    const k = (performance.now() - start) / pushMs;
    state.press = k;
    state.clock = `${target}を押しています（${(k * spec.pushSeconds).toFixed(1)}秒）`;
    render();
    await sleep(40);
  }
  state.press = 1;
  if (spec.recordAt > 0 && !reduce) {
    const ffMs = Math.min(2000, 300 + spec.recordAt * 90);
    const s2 = performance.now();
    while (performance.now() - s2 < ffMs) {
      const t = ((performance.now() - s2) / ffMs) * spec.recordAt;
      state.clock = `深さを保ったまま待つ ${t.toFixed(1)}秒（早送り）`;
      render();
      await sleep(50);
    }
  }
  state.clock = `${target}：${specLabel(spec)}`;
  state.reading = value;
  state.animating = false;
  render();
  await sleep(reduce ? 0 : 900);
  state.press = 0;
  render();
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
    state.phase = "lab";
    state.push = 1;
    state.at = 0;
  });
}

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "reason") state.reason = t.value;
});

app.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-set]");
  if (!el || el.hasAttribute("disabled")) return;
  const set = el.dataset.set;
  if (set) {
    const val = el.dataset.val!;
    if (set === "push") state.push = Number(val) as PushSeconds;
    if (set === "at") state.at = Number(val) as RecordAt;
    if (set === "choice") state.choice = val as PredictionChoice;
    if (set === "act2guess") {
      state.act2Guess = val as Act2Guess;
      state.act2Saved = false;
    }
    if (set === "perm") state.perm = val as Permeability;
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
    case "predict":
      if (!v || !state.choice) return;
      await guard(async () => {
        state.view = (await api.predict(v.sessionId, selectedSpec(), state.choice!, state.reason)).view;
      });
      break;
    case "observe": {
      if (!v) return;
      const spec = selectedSpec();
      await guard(async () => {
        const res = await api.observe(v.sessionId, spec, crypto.randomUUID());
        const rec = res.view.records[res.view.records.length - 1]!;
        state.busy = false;
        await animatePush("B", spec, rec.force);
        state.view = res.view;
        state.choice = null;
        state.reason = "";
        state.hint = null;
      });
      break;
    }
    case "measure-a": {
      if (!v) return;
      const spec = selectedSpec();
      await guard(async () => {
        const res = await api.measureA(v.sessionId, spec);
        const m = res.view.measuredA[res.view.measuredA.length - 1]!;
        state.busy = false;
        await animatePush("A", spec, m.force);
        state.view = res.view;
      });
      break;
    }
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
      state.at = Number(el.dataset.at) as RecordAt;
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
      break;
    case "to-act2":
      state.phase = "act2";
      render();
      break;
    case "lens":
      state.lens = el.dataset.val as Lens;
      render();
      break;
    case "act2-save":
      state.act2Saved = true;
      render();
      break;
    case "act2-run":
      state.act2Runs = [...state.act2Runs.filter((r) => r.perm !== state.perm), runAct2(state.perm)];
      render();
      break;
    case "to-reflect":
      state.phase = "reflect";
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
