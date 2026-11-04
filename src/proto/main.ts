// 試作「つづきの謎をつくる」（CLAUDE.md 1e）：Claude（開いた人の Claude）が謎を組み立て、計算プログラムが確かめる。
// AIの出力は信用しない：verifyPuzzle が値・ロボの見落とし・見える違い・言葉を確かめ、通ったものだけを遊べる謎にする。
import "./proto.css";
import { verifyPuzzle, type Check, type PuzzleSpec, type Verdict } from "../../server/model/rcPuzzle.js";
import { PREPARED, puzzlePrompt, retryPrompt } from "../../server/claude/puzzlePrompt.js";

type Sample = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & { json: (input: string, opts?: Record<string, unknown>) => Promise<unknown> };
interface Attempt { spec: unknown; verdict: Verdict; error?: string }
interface Shown { spec: PuzzleSpec; verdict: Verdict; source: "ai" | "prepared"; attempts: Attempt[]; note?: string }

const app = document.querySelector<HTMLDivElement>("#app")!;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace("-", "−");

let sample: Sample | null = null;
let ready = false;
let busy = false;
let status = "";
let shown: Shown | null = null;
let tIndex = 0;
let evidence: { t: number; diff: number; ok: boolean } | null = null;
let revealed = false;
let ctl: AbortController | null = null;

const ERR: Record<string, string> = {
  not_granted: "このページから Claude を使うことが許可されていません。",
  sampling_disabled: "このアカウントでは、ページから Claude を使えません。",
  rate_limited: "呼び出しが続きました。少し待ってから、もう一度押してください。",
  session_expired: "claude.ai にサインインし直してください。",
  refused: "この題材では謎をつくれませんでした。題材を変えてください。",
  invalid_json: "決まった形で返ってきませんでした。もう一度押してください。",
  cancelled: "止めました。",
};

async function init(): Promise<void> {
  const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
  sample = c ? ((await c.use("sample").catch(() => null)) as Sample | null) : null;
  ready = true;
  render();
}

async function generate(topic: string): Promise<void> {
  if (!sample || busy || !topic.trim()) return;
  busy = true;
  ctl = new AbortController();
  const attempts: Attempt[] = [];
  status = "Claude が謎を組み立てています（数十秒かかることがあります）…";
  render();
  try {
    let spec = await sample.json(puzzlePrompt(topic), { signal: ctl.signal, cache: false });
    let verdict = verifyPuzzle(spec);
    attempts.push({ spec, verdict });
    if (!verdict.ok) {
      status = "確かめに通らなかった点を伝えて、一度だけ作り直してもらっています…";
      render();
      spec = await sample.json(retryPrompt(topic, spec, verdict.checks.filter((c) => !c.ok)), { signal: ctl.signal, cache: false });
      verdict = verifyPuzzle(spec);
      attempts.push({ spec, verdict });
    }
    if (verdict.ok) show({ spec: spec as PuzzleSpec, verdict, source: "ai", attempts });
    else show({ spec: PREPARED[0]!, verdict: verifyPuzzle(PREPARED[0]), source: "prepared", attempts, note: "AIがつくった謎は、二度とも確かめに通りませんでした。代わりに用意した謎を出します。" });
    status = "";
  } catch (e) {
    const code = (e as { code?: string }).code ?? "upstream_error";
    status = ERR[code] ?? "Claude との通信がうまくいきませんでした。もう一度押してください。";
    if (attempts.length) shown = { ...(shown ?? { spec: PREPARED[0]!, verdict: verifyPuzzle(PREPARED[0]), source: "prepared" as const }), attempts };
  } finally {
    busy = false;
    render();
  }
}

function show(s: Shown): void {
  shown = s;
  tIndex = Math.round((s.verdict.trace!.t.length - 1) * 0.08);
  evidence = null;
  revealed = false;
}

function chart(v: Verdict, spec: PuzzleSpec): string {
  const W = 760, H = 260, L = 56, R = 16, T = 14, B = 34;
  const tr = v.trace!;
  const tMax = tr.t[tr.t.length - 1]!;
  const all = [...tr.a, ...tr.b];
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad; hi += pad;
  const xs = (t: number) => L + ((W - L - R) * t) / tMax;
  const ys = (y: number) => T + (H - T - B) * (1 - (y - lo) / (hi - lo));
  const line = (arr: number[]) => tr.t.map((t, k) => `${xs(t).toFixed(1)},${ys(arr[k]!).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const t = tr.t[tIndex]!;
  const onBand = spec.input.kind === "pulse" ? `<rect x="${L}" y="${T}" width="${xs(spec.input.on) - L}" height="${H - T - B}" class="band"/><text x="${L + 6}" y="${T + 16}" class="soft">送っている間</text>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="AとBの${esc(spec.parts.level.name)}の変化">
    ${onBand}
    ${ticks.map((y) => `<line x1="${L}" x2="${W - R}" y1="${ys(y)}" y2="${ys(y)}" class="grid"/><text x="${L - 6}" y="${ys(y) + 4}" class="soft" text-anchor="end">${fmt(y)}</text>`).join("")}
    <text x="${W - R}" y="${H - 6}" class="soft" text-anchor="end">時間（${esc(spec.input.timeUnit)}）${spec.input.kind === "beats" ? "・落ち着いた1回分" : ""} →</text>
    <text x="${L}" y="${H - 6}" class="soft">0</text><text x="${xs(tMax)}" y="${H - 18}" class="soft" text-anchor="end">${fmt(tMax)}</text>
    <polyline points="${line(tr.a)}" class="lineA"/>
    <polyline points="${line(tr.b)}" class="lineB"/>
    <line x1="${xs(t)}" x2="${xs(t)}" y1="${T}" y2="${H - B}" class="cursor"/>
    <circle cx="${xs(t)}" cy="${ys(tr.a[tIndex]!)}" r="5" class="dotA"/><circle cx="${xs(t)}" cy="${ys(tr.b[tIndex]!)}" r="5" class="dotB"/>
  </svg>`;
}

function puzzleHtml(s: Shown): string {
  const { spec, verdict: v } = s;
  const tr = v.trace!;
  const unit = spec.parts.level.unit;
  const isHalf = spec.robot.metric === "halfTime";
  const robotUnit = isHalf ? spec.input.timeUnit : unit;
  const t = tr.t[tIndex]!;
  const metricName = { plateau: "止める直前の高さ", cycleMean: "1回の平均", halfTime: "止めてから半分に戻るまでの時間" }[spec.robot.metric];
  return `<section class="puzzle">
    <p class="badge ${s.source}">${s.source === "ai" ? "AIがつくった謎（式と判定はプログラムが確かめた。説明文はAIの文）" : "用意した謎"}</p>
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
    <h2>${esc(spec.title)}<small>${esc(spec.topic)}</small></h2>
    <ol class="scenes">${spec.scenes.map((sc) => `<li><b>${esc(sc.tag)}</b>${sc.caption.map((c) => `<span>${esc(c)}</span>`).join("")}</li>`).join("")}</ol>
    <p class="end">${esc(spec.endLine)}</p>
    <div class="robot"><span class="who">TEJUN-07（決まったルールで動く・AIではない）</span><p>「${esc(spec.robot.says)}」</p>
      <p class="nums">ロボが見る数字（${metricName}）：見本A ${fmt(v.robotA!)}／試作品B ${fmt(v.robotB!)} ${esc(robotUnit)} → <b>区別できません</b></p></div>
    <div class="lab">
      <p class="legend"><i class="kA"></i>見本A　<i class="kB"></i>試作品B　縦：${esc(spec.parts.level.name)}（${esc(unit)}）</p>
      ${chart(v, spec)}
      <label class="slider" for="t">時刻を選ぶ <input id="t" type="range" min="0" max="${tr.t.length - 1}" step="1" value="${tIndex}"></label>
      <p class="nums">${fmt(t)} ${esc(spec.input.timeUnit)}：A ${fmt(tr.a[tIndex]!)}／B ${fmt(tr.b[tIndex]!)}　差 ${fmt(tr.b[tIndex]! - tr.a[tIndex]!)} ${esc(unit)}</p>
      <div class="row"><button class="go" data-act="evidence">この時刻を証拠にする</button>
        ${evidence ? `<span class="stamp ${evidence.ok ? "win" : ""}">${evidence.ok ? `見落とし！ ${fmt(evidence.t)} ${esc(spec.input.timeUnit)}で差 ${fmt(evidence.diff)}` : "この時刻では区別できない（差が小さい）"}</span>` : ""}</div>
    </div>
    ${evidence?.ok ? `<div class="row"><button class="go" data-act="reveal">正体を開ける</button></div>` : ""}
    ${revealed ? `<div class="reveal"><p><b>正体：</b>${esc(spec.B.reveal)}</p><p><b>見立て：</b>${esc(spec.analogy)}</p>
      <p><b>たまったものの逃げ道：</b>${esc(spec.leak)}</p>
      <p><b>部品：</b>送りこむもの＝${esc(spec.parts.flow.name)}／ためる部品＝${esc(spec.parts.storage.name)}／流れにくさ＝${esc(spec.parts.resistance.name)}</p>
      <p><b>この模型で扱わないこと：</b>${spec.outOfScope.map(esc).join("、")}</p></div>` : ""}
    <p class="fine">値は模型の値で、体の値や病気の判定を表しません。</p>
  </section>`;
}

function checksHtml(list: Check[]): string {
  return `<ul class="checks">${list.map((c) => `<li class="${c.ok ? "ok" : "ng"}">${c.ok ? "✓" : "✗"} ${esc(c.label)}${c.detail ? `<small>${esc(c.detail)}</small>` : ""}</li>`).join("")}</ul>`;
}

function render(): void {
  const focus = document.activeElement?.id;
  const topic = (document.querySelector<HTMLInputElement>("#topic")?.value ?? "");
  app.innerHTML = `<main>
    <header><h1>つづきの謎をつくる</h1><p>見立てラボの試作。Claude（AI）が次の謎を組み立て、計算プログラムが「本当に解ける謎か」を確かめます。</p></header>
    <form id="f" class="ask">
      <label for="topic">次に知りたい題材</label>
      <div class="row"><input id="topic" type="text" maxlength="40" placeholder="例：肺、心臓、体温、皮膚の電気" value="${esc(topic)}" ${!sample || busy ? "disabled" : ""}>
      <button class="go" type="submit" ${!sample || busy ? "disabled" : ""}>謎をつくる</button>
      ${busy ? `<button type="button" data-act="stop">止める</button>` : ""}</div>
      ${!ready ? `<p class="soft">準備しています…</p>` : !sample ? `<p class="note">このページを claude.ai で開くと、あなたの Claude が謎を組み立てます（ここでは使えません）。用意した謎は見られます。</p>` : `<p class="soft">押すと、あなたの Claude を使ってよいかの確認が出ます（使用量はあなたのアカウントから）。</p>`}
      <div class="row prepared"><span class="soft">用意した謎：</span>${PREPARED.map((p, i) => `<button type="button" data-act="prepared" data-i="${i}">${esc(p.topic)}</button>`).join("")}</div>
    </form>
    ${status ? `<p class="status">${esc(status)}</p>` : ""}
    ${shown && shown.verdict.trace ? puzzleHtml(shown) : ""}
    ${shown?.attempts.length ? `<details class="log"><summary>確かめの記録（AIの出力とプログラムの判定）</summary>
      ${shown.attempts.map((a, i) => `<h3>${i + 1}回目：${a.verdict.ok ? "通った" : "通らなかった"}</h3>${checksHtml(a.verdict.checks)}<pre>${esc(JSON.stringify(a.spec, null, 2))}</pre>`).join("")}</details>` : ""}
  </main>`;
  if (focus) document.getElementById(focus)?.focus();
}

app.addEventListener("submit", (e) => {
  e.preventDefault();
  void generate(document.querySelector<HTMLInputElement>("#topic")!.value);
});
app.addEventListener("click", (e) => {
  const el = (e.target as Element).closest<HTMLElement>("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "stop") ctl?.abort();
  if (act === "prepared") {
    const spec = PREPARED[Number(el.dataset.i)]!;
    show({ spec, verdict: verifyPuzzle(spec), source: "prepared", attempts: [] });
    render();
  }
  if (act === "evidence" && shown) {
    const tr = shown.verdict.trace!;
    const d = tr.b[tIndex]! - tr.a[tIndex]!;
    evidence = { t: tr.t[tIndex]!, diff: d, ok: Math.abs(d) >= shown.verdict.seeTol! };
    render();
  }
  if (act === "reveal") {
    revealed = true;
    render();
  }
});
app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id !== "t" || !shown) return;
  tIndex = Number(t.value);
  const lab = app.querySelector(".lab");
  if (lab) {
    const tmp = document.createElement("div");
    tmp.innerHTML = puzzleHtml(shown);
    const nl = tmp.querySelector(".lab")!;
    lab.querySelector("svg")!.outerHTML = nl.querySelector("svg")!.outerHTML;
    lab.querySelectorAll(".nums")[0]!.outerHTML = nl.querySelectorAll(".nums")[0]!.outerHTML;
  }
});

render();
void init();
