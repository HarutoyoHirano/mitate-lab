// ミカタ・ラボの画面。サーバーから受け取る公開ビューだけで描く。
import { BASE, CANDIDATES, PUSH_SECONDS, RECORD_AT, type CandidateId, type ObservationSpec, type PushSeconds, type RecordAt } from "../server/model/public.js";
import { forceAfterPush } from "../server/model/sls.js";
import type { Permeability } from "../server/model/circuit.js";
import { act2GraphSvg, circuitSvg, GUESS_LABEL, PERM_LABEL, RUN_COLORS, runAct2, thoughtSvg, THOUGHT_GUESS_LABEL, type Act2Guess, type Act2Run, type Lens, type ThoughtGuess } from "./act2.js";
import { api, status, type Debrief, type Hint, type PredictionChoice, type PublicSessionView, type Translation } from "./api.js";
import { benchSvg, CAND_COLOR, graphHtml, revealSvg, SPEED_LABEL, specLabel, TIME_SHORT } from "./draw.js";

type Phase = "start" | "intro" | "lab" | "debrief" | "act2" | "reflect" | "done";

const PRED_LABEL: Record<PredictionChoice, string> = { higher: "Aより大きい", same: "Aと同じくらい", lower: "Aより小さい" };

interface ResultMoment {
  readonly recordId: string;
  readonly predicted: number | null;
  readonly choice: PredictionChoice | null;
  readonly actual: number;
  readonly base: number;
  readonly excluded: readonly CandidateId[];
}

const state = {
  phase: "start" as Phase,
  claude: false,
  view: null as PublicSessionView | null,
  push: 1 as PushSeconds,
  at: 0 as RecordAt,
  pin: null as number | null,
  reason: "",
  busy: false,
  animating: false,
  press: 0,
  benchTarget: "B" as "A" | "B" | "both",
  flash: false,
  clock: "",
  reading: null as number | null,
  readingA: null as number | null,
  introDone: false,
  hint: null as Hint | null,
  translation: null as Translation | null,
  myCandidates: [] as CandidateId[],
  result: null as ResultMoment | null,
  freshId: null as string | null,
  stampNow: [] as CandidateId[],
  error: "",
  debrief: null as Debrief | null,
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

function selectedSpec(): ObservationSpec {
  return { pushSeconds: state.push, recordAt: state.at };
}

function baseAt(s: ObservationSpec): number {
  return forceAfterPush(BASE, s.pushSeconds, s.recordAt);
}

function choiceFromPin(pin: number, s: ObservationSpec, err: number): PredictionChoice {
  const b = baseAt(s);
  return pin > b + err ? "higher" : pin < b - err ? "lower" : "same";
}

const STEPS: { id: Phase[]; label: string }[] = [
  { id: ["intro"], label: "同じ？" },
  { id: ["lab"], label: "違いを見つける" },
  { id: ["debrief"], label: "答え合わせ" },
  { id: ["act2"], label: "見方を変える" },
  { id: ["reflect", "done"], label: "振り返り" },
];

function topbar(): string {
  const cur = STEPS.findIndex((s) => s.id.includes(state.phase));
  return `<header class="topbar">
    <div class="brand">ミカタ・ラボ</div>
    ${
      state.phase === "start"
        ? `<div class="spacer"></div>`
        : `<ol class="steps">${STEPS.map((s, i) => `<li class="${i < cur ? "done" : i === cur ? "now" : ""}"><span>${i + 1}</span>${s.label}</li>`).join("")}</ol>`
    }
    <span class="ai-badge ${state.claude ? "" : "off"}">${state.claude ? "Claude（AI）が相棒として参加中" : "Claude（AI）は休止中：定型のヒントで進めます"}</span>
  </header>`;
}

// ---------- 開始画面 ----------
function renderStart(): string {
  return `${topbar()}<main class="wrap"><section class="start">
    <div class="start-copy">
      <p class="kicker">見方を変える実験室</p>
      <h1>押して、待つと、同じ。<br>本当に同じ素材だろうか。</h1>
      <p class="lead">見た目がそっくりな二つの素材。押して20秒待つと、押し返す力はぴったり同じになります。でも、押す速さと、力を記録する一瞬を選べば、見えなかった違いが見えるかもしれません。</p>
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
    <div class="pane bench-pane bench hero-bench">${benchSvg("both", 0)}</div>
  </section></main>`;
}

// ---------- 導入の場面 ----------
function renderIntro(): string {
  const v = state.view!;
  const a = v.measuredA[0]!.force;
  const b = v.records[0]!.force;
  return `${topbar()}<main class="wrap"><section class="intro">
    <div class="pane bench-pane bench">${benchSvg("both", state.press, state.flash)}</div>
    <div class="intro-side">
      <p class="clock">${state.clock || "ふつう（1秒）に押して、20秒待ってからシャッター"}</p>
      <div class="twin">
        <div class="meter"><span class="tag">A</span><strong>${state.introDone ? a.toFixed(3) : "—"}</strong></div>
        <div class="meter"><span class="tag">B</span><strong>${state.introDone ? b.toFixed(3) : "—"}</strong></div>
      </div>
      ${
        state.introDone
          ? `<p class="same">同じ…？</p>
             <p>差は誤差（±${v.error}）の範囲です。でも、押し方と、シャッターを切る一瞬を変えたら？</p>
             <div class="actions"><button class="btn big" data-act="to-lab">違いを探しに行く</button></div>`
          : `<p class="note">記録計は、選んだ一瞬にだけシャッターを切ります。</p>`
      }
    </div>
  </section></main>`;
}

// ---------- 実験室（第1幕） ----------
function renderLab(): string {
  const v = state.view!;
  const sel = selectedSpec();
  const pending = v.pendingPrediction;
  const ready = !!pending && pending.pushSeconds === sel.pushSeconds && pending.recordAt === sel.recordAt;
  const narrowed = v.overall === "narrowed";
  const lock = state.animating || state.busy;
  const seg = <T extends number>(name: string, items: readonly T[], cur: T, label: (x: T) => string) =>
    `<div class="seg" role="group" aria-label="${name}">${items
      .map((x) => `<button data-set="${name}" data-val="${x}" aria-pressed="${x === cur}" ${lock ? "disabled" : ""}>${label(x)}</button>`)
      .join("")}</div>`;
  return `${topbar()}<main class="wrap"><section class="lab">
    <div class="pane bench-pane">
      <div class="bench">${benchSvg(state.benchTarget, state.press, state.flash)}</div>
      <div class="recorder ${state.flash ? "lit" : ""}" aria-live="polite">
        <span class="cam" aria-hidden="true"></span>
        <span class="rec-label">${state.clock || "記録計（シャッターは一回に一度だけ）"}</span>
        <strong>${state.reading !== null ? state.reading.toFixed(3) : "—"}</strong>
      </div>
      <div class="choose">
        <div><div class="field-label">押す速さ</div>${seg("push", PUSH_SECONDS, state.push, (x) => `${SPEED_LABEL[x]}<small>${x}秒</small>`)}</div>
        <div><div class="field-label">シャッターを切る一瞬</div>${seg("at", RECORD_AT, state.at, (x) => TIME_SHORT[x]!)}</div>
        <div>
          <div class="field-label">予想：Bの力はどこに来る？ <span class="note">（右のグラフの列をクリックしてピンを置く）</span></div>
          <div class="seg">${(["higher", "same", "lower"] as PredictionChoice[])
            .map((c) => `<button data-act="pin-choice" data-val="${c}" aria-pressed="${ready && pending!.choice === c}" ${lock || narrowed ? "disabled" : ""}>${PRED_LABEL[c]}</button>`)
            .join("")}</div>
        </div>
        <input class="reason" id="reason" maxlength="200" placeholder="そう思った理由（ひとこと・任意）" value="${esc(state.reason)}">
        <div class="go-row">
          <button class="btn go" data-act="observe" ${!ready || lock || narrowed ? "disabled" : ""}>Bを押して、シャッター</button>
          ${state.claude ? `<button class="btn claude" data-act="claude-observe" ${!ready || lock || narrowed ? "disabled" : ""} title="予想を置いたこの観察を、Claude（AI）が許可された操作で実行します">相棒に押してもらう</button>` : ""}
        </div>
        <p class="note">${narrowed ? "決着しました。答え合わせへ進めます。" : ready ? `予想：${specLabel(pending!)}に「${PRED_LABEL[pending!.choice]}」` : "予想のピンを置くと、押せるようになります。"}</p>
        <button class="btn ghost small" data-act="measure-a" ${lock ? "disabled" : ""}>同じ条件でAも押してみる</button>
      </div>
    </div>
    <div class="pane graph-pane">
      <div class="graph-head">
        <h2>${SPEED_LABEL[sel.pushSeconds]}（${sel.pushSeconds}秒）押したときの記録</h2>
        <span class="count">観察 ${v.observationCount}回</span>
      </div>
      ${resultBanner()}
      ${graphHtml(v, sel, ready ? state.pin : null, state.freshId)}
      <p class="note">点はどれも、別々に押して一瞬だけ記録した値です。点どうしを線で結んでいません。</p>
    </div>
    <div class="pane board">
      <h2>説明の候補 <span class="note">（どれもAと一つだけ違う）</span></h2>
      <ul>${v.candidates
        .map((c) => {
          const stamp = c.status === "inconsistent" ? `<span class="hanko no ${state.stampNow.includes(c.id) ? "now" : ""}">合わない</span>` : narrowed && v.narrowedTo === c.id ? `<span class="hanko yes now">決着</span>` : "";
          return `<li class="cand ${c.status} ${narrowed && v.narrowedTo === c.id ? "decided" : ""} ${state.myCandidates.includes(c.id) ? "mine" : ""}">
            <span class="swatch" style="background:${CAND_COLOR[c.id]}"></span>
            <span class="name">${c.label}${state.myCandidates.includes(c.id) ? `<span class="mine-tag">あなたの説明</span>` : ""}</span>
            <span class="st">${c.statusLabel}</span>${stamp}</li>`;
        })
        .join("")}</ul>
      <p class="overall ${v.overall}">${narrowed ? "決着！ " : ""}${v.overallLabel}</p>
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

function resultBanner(): string {
  const r = state.result;
  if (!r) return `<div class="result idle">予想のピンを置いて押すと、ここに結果が出ます。</div>`;
  const diff = r.actual - r.base;
  const actualChoice: PredictionChoice = diff > state.view!.error ? "higher" : diff < -state.view!.error ? "lower" : "same";
  const hit = r.choice === actualChoice;
  const head = r.choice ? (hit ? "予想どおり！" : "予想が外れた！ ここが発見のチャンス") : "記録しました";
  const what = actualChoice === "same" ? "Aとほぼ同じ" : actualChoice === "higher" ? `Aより大きい（＋${diff.toFixed(3)}）` : `Aより小さい（${diff.toFixed(3)}）`;
  return `<div class="result ${hit ? "hit" : "miss"} fresh">
    <strong>${head}</strong>
    <span>B ${r.actual.toFixed(3)}：${what}</span>
    ${r.excluded.length ? `<span class="excl">→ 合わなくなった：${r.excluded.map((c) => CANDIDATES[c].label).join("、")}</span>` : `<span class="note">この観察では、合わなくなった候補はありません。</span>`}
  </div>`;
}

function claudeNote(): string {
  const h = state.hint;
  if (!h) return "";
  const stageName = ["予想を置く", "どこに注目するか", "比べ方", "試す観察"][h.stage - 1];
  return `<div class="claude-note fresh" aria-live="polite">
    <div class="who"><span class="ai-dot"></span>Claude（AI）のメモ ・ ${stageName}</div>
    <p>${esc(h.text)}</p>
    ${h.suggestion ? `<button class="btn small claude" data-act="use-suggestion" data-push="${h.suggestion.pushSeconds}" data-at="${h.suggestion.recordAt}">この観察にする：${specLabel(h.suggestion)}</button>` : ""}
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
  const v = state.view!;
  const names = { eInf: "待ったあとも残るかたさ（E∞）", e1: "押した直後だけ上乗せされるかたさ（E1）", tau: "上乗せ分がやわらぐ時間の目安（τ）" } as const;
  const key = d.keyObservations
    .map((k) => {
      const r = v.records.find((x) => x.id === k.id);
      return r ? `<li><strong>${specLabel(r)}</strong><br>→ ${k.excluded.map((c) => CANDIDATES[c].label).join("、")}が合わなくなった</li>` : "";
    })
    .join("");
  return `${topbar()}<main class="wrap"><section class="page">
    <p class="kicker">答え合わせ</p>
    <h1 class="reveal-head">${esc(d.explanation)}</h1>
    <div class="two">
      <div class="pane">
        <h2>Bの正体（終了したので5時刻まとめて記録）</h2>
        ${revealSvg(d.allTimes)}
        <p class="note">押した直後のかたさは E∞＋E1。待つと上乗せ分がやわらいで E∞ の分だけが残るので、20秒後はAとBが同じに見えました。</p>
      </div>
      <div class="pane">
        <h2>あなたの決め手</h2>
        <ol class="keys">${key || "<li>候補を退けた観察はありませんでした。</li>"}</ol>
        <p class="note">観察は${d.observationCount}回。回数の多い少ないは優劣ではありません。どの観察が説明を分けたかが大事です。</p>
        <table class="vals"><tr><th></th><th>A</th><th>B</th></tr>
        ${(["eInf", "e1", "tau"] as const).map((k) => `<tr class="${d.truth[k] !== d.base[k] ? "diff" : ""}"><td>${names[k]}</td><td>${d.base[k]}</td><td>${d.truth[k].toFixed(2)}</td></tr>`).join("")}</table>
        <p class="note">ばね二つとダンパ一つの「標準線形固体」という簡単なモデルです。実在の素材の構造を証明したものではありません。</p>
      </div>
    </div>
    <div class="actions" style="margin-top:20px"><button class="btn big" data-act="to-act2">見方を変えてみる</button></div>
  </section></main>`;
}

// ---------- 第2幕 ----------
function renderAct2(): string {
  const runs = state.act2Runs;
  const kind = state.debrief ? causeKind(state.debrief) : null;
  const bridge =
    kind === "relax"
      ? "あなたが見つけたのは「上乗せ分がやわらぐ時間」の違い。細胞の膜では、それは何にあたるだろう？"
      : kind === "instant"
        ? "あなたが見つけたのは「押した直後の上乗せ」の違い。今度は「やわらぐ速さ」が、細胞の膜では何で決まるかを見てみよう。"
        : "第1幕で見た「時間をかけてやわらぐ変化」が、細胞の膜では何にあたるかを見てみよう。";
  const allRight = runs.length >= 2 && state.act2Guess === "faster";
  return `${topbar()}<main class="wrap"><section class="page act2">
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
        ${runs.length >= 2 ? `<p class="result ${allRight ? "hit" : "miss"}"><strong>${allRight ? "予想どおり！" : "予想とくらべてみよう"}</strong><span>通りやすいほど速く戻り、通りにくいほどゆっくり戻る。第1幕の「やわらぐのが遅い素材」は、膜なら「イオンが通りにくい」と同じ形です。</span></p>` : ""}
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
  return `${topbar()}<main class="wrap"><section class="page reflect">
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
    act2: renderAct2,
    reflect: renderReflect,
    done: renderReflect,
  };
  app.innerHTML = views[state.phase]();
  const w = document.querySelector<HTMLInputElement>("#words");
  if (w) w.value = words;
  if (focusKey) document.querySelector<HTMLElement>(focusKey)?.focus();
}

// ---------- 動き ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 押す→（早送りで）待つ→シャッター。記録時刻以外の力は見せない */
async function pressAndShoot(target: "A" | "B" | "both", spec: ObservationSpec, onShot: () => void): Promise<void> {
  const reduce = reduceMotion();
  state.animating = true;
  state.benchTarget = target;
  state.reading = null;
  const pushMs = reduce ? 0 : Math.max(450, spec.pushSeconds * 1000);
  const start = performance.now();
  while (performance.now() - start < pushMs) {
    const k = (performance.now() - start) / pushMs;
    state.press = k;
    state.clock = `押しています… ${(k * spec.pushSeconds).toFixed(1)}秒`;
    render();
    await sleep(40);
  }
  state.press = 1;
  if (spec.recordAt > 0 && !reduce) {
    const ffMs = Math.min(1800, 300 + spec.recordAt * 75);
    const s2 = performance.now();
    while (performance.now() - s2 < ffMs) {
      const t = ((performance.now() - s2) / ffMs) * spec.recordAt;
      state.clock = `そのまま待つ ${t.toFixed(1)}秒（早送り）`;
      render();
      await sleep(50);
    }
  }
  state.flash = true;
  state.clock = "パシャ";
  onShot();
  render();
  await sleep(reduce ? 0 : 450);
  state.flash = false;
  state.animating = false;
  render();
  await sleep(reduce ? 0 : 500);
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
    state.phase = "intro";
    state.push = 1;
    state.at = 0;
  });
  if (state.phase === "intro") void playIntro();
}

async function playIntro() {
  state.introDone = false;
  await sleep(reduceMotion() ? 0 : 500);
  await pressAndShoot("both", { pushSeconds: 1, recordAt: 20 }, () => {
    state.introDone = true;
  });
  state.clock = "ふつう（1秒）に押して、20秒後にシャッター";
  render();
}

/** 予想を保存する（ピンの位置から、大きい／同じくらい／小さい を決める） */
async function savePin(pin: number) {
  const v = state.view;
  if (!v || v.overall === "narrowed") return;
  const spec = selectedSpec();
  state.pin = pin;
  const choice = choiceFromPin(pin, spec, v.error);
  await guard(async () => {
    state.view = (await api.predict(v.sessionId, spec, choice, state.reason)).view;
  });
}

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "reason") state.reason = t.value;
});

app.addEventListener("click", async (e) => {
  const target = e.target as Element;
  // グラフの列をクリック：その時刻を選び、クリックした高さに予想ピンを置く
  const col = target.closest<SVGRectElement>("rect.col");
  if (col && !state.animating && !state.busy) {
    const svg = col.ownerSVGElement!;
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const y = ((e as MouseEvent).clientY - box.top) * (vb.height / box.height);
    const top = Number(svg.dataset.top);
    const bottom = Number(svg.dataset.bottom);
    const yMin = Number(svg.dataset.ymin);
    const yMax = Number(svg.dataset.ymax);
    const value = yMin + ((bottom - y) / (bottom - top)) * (yMax - yMin);
    state.at = Number(col.dataset.col) as RecordAt;
    await savePin(value);
    return;
  }
  const el = target.closest<HTMLElement>("[data-act],[data-set]");
  if (!el || el.hasAttribute("disabled")) return;
  const set = el.dataset.set;
  if (set) {
    const val = el.dataset.val!;
    if (set === "push") state.push = Number(val) as PushSeconds;
    if (set === "at") state.at = Number(val) as RecordAt;
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
      state.reading = null;
      state.benchTarget = "B";
      render();
      break;
    case "pin-choice": {
      if (!v) return;
      const b = baseAt(selectedSpec());
      const off = Math.max(0.15, b * 0.12);
      const c = el.dataset.val as PredictionChoice;
      await savePin(c === "higher" ? b + off : c === "lower" ? b - off : b);
      break;
    }
    case "observe":
    case "claude-observe": {
      if (!v) return;
      const spec = selectedSpec();
      const pending = v.pendingPrediction;
      const pin = state.pin;
      const byPartner = el.dataset.act === "claude-observe";
      await guard(async () => {
        const res = byPartner ? await api.claudeObserve(v.sessionId, spec, crypto.randomUUID()) : await api.observe(v.sessionId, spec, crypto.randomUUID());
        const note = "note" in res ? (res as { note: Hint }).note : null;
        const rec = res.view.records[res.view.records.length - 1]!;
        state.busy = false;
        state.result = null;
        await pressAndShoot("B", spec, () => {
          state.reading = rec.force;
          state.view = res.view;
          state.freshId = rec.id;
          state.stampNow = [...rec.excluded];
          state.result = {
            recordId: rec.id,
            predicted: pin,
            choice: pending?.choice ?? null,
            actual: rec.force,
            base: rec.baseForce,
            excluded: rec.excluded,
          };
        });
        state.pin = null;
        state.reason = "";
        state.hint = note;
        setTimeout(() => {
          state.freshId = null;
          state.stampNow = [];
        }, 1200);
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
        await pressAndShoot("A", spec, () => {
          state.reading = m.force;
          state.view = res.view;
        });
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
      state.pin = null;
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
