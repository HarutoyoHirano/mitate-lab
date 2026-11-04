// 試作「つづきの謎をつくる」（CLAUDE.md 1e-2）：Claude（開いた人の Claude）が部品箱から模型の形ごと組み立て、計算プログラムが確かめる。
// AIの出力は信用しない：verifyNetPuzzle が形・つなぎ方・計算・ロボの見落とし・見える違い・言葉を確かめ、通ったものだけを遊べる謎にする。
import "./proto.css";
import { probeSeries, verifyNetPuzzle, type Check, type DiffType, type Metric, type NetPart, type NetPuzzleSpec, type NetVerdict, type Probe } from "../../server/model/partsNet.js";
import { refById } from "../../server/model/refs.js";
import { PREPARED_NETS, netPrompt, netRetryPrompt } from "../../server/puzzle/netPrompt.js";

type Sample = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & { json: (input: string, opts?: Record<string, unknown>) => Promise<unknown> };
interface Attempt { spec: unknown; verdict: NetVerdict }
interface Shown { spec: NetPuzzleSpec; verdict: NetVerdict; source: "ai" | "prepared"; attempts: Attempt[]; note?: string; prev?: NetPuzzleSpec }

const app = document.querySelector<HTMLDivElement>("#app")!;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (v: number) => (!Number.isFinite(v) ? "—" : (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace("-", "−"));
const later = () => new Promise<void>((r) => setTimeout(r, 30));

let sample: Sample | null = null;
let ready = false;
let busy = false;
let status = "";
let shown: Shown | null = null;
let watchIdx = 0;
let tIndex = 0;
let evidence: { label: string; t: number; diff: number; ok: boolean } | null = null;
let revealed = false;
let ctl: AbortController | null = null;
/** つづきの元（前の謎）。はじめは謎5（膜）。解いた謎から続けると、その謎になる */
let previous: NetPuzzleSpec = PREPARED_NETS[1]!;
const DIFF_NAME: Record<DiffType, string> = { source: "送りこむもの", store: "ためる部品", chamber: "自分で固くなる部屋", resist: "流れにくさ", valve: "一方通行の戸", battery: "電池（高さの決まった場所）" };

const ERR: Record<string, string> = {
  not_granted: "このページから Claude を使うことが許可されていません。",
  sampling_disabled: "このアカウントでは、ページから Claude を使えません。",
  rate_limited: "呼び出しが続きました。少し待ってから、もう一度押してください。",
  session_expired: "claude.ai にサインインし直してください。",
  refused: "この題材では謎をつくれませんでした。題材を変えてください。",
  invalid_json: "決まった形で返ってきませんでした。もう一度押してください。",
  cancelled: "止めました。",
};

const METRIC: Record<Metric, string> = {
  mean: "1回の平均",
  max: "いちばん高いところ",
  min: "いちばん低いところ",
  plateau: "送り終わる直前",
  halfTime: "送り終えてから半分に戻るまでの時間",
  perCycle: "1回で流れた量",
};
const TYPE_NAME: Record<NetPart["type"], string> = {
  store: "ためる部品（コンデンサ）",
  chamber: "自分で固くなる部屋（固さが変わるコンデンサ）",
  resist: "流れにくさ（抵抗）",
  valve: "一方通行の戸（ダイオード）",
  source: "送りこむもの（電流源）",
};

async function init(): Promise<void> {
  const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
  sample = c ? ((await c.use("sample").catch(() => null)) as Sample | null) : null;
  ready = true;
  render();
}

async function check(spec: unknown): Promise<NetVerdict> {
  status = "計算プログラムが、組み立てた模型を計算して確かめています…";
  render();
  await later();
  return verifyNetPuzzle(spec, previous);
}

async function generate(topic: string): Promise<void> {
  if (!sample || busy || !topic.trim()) return;
  busy = true;
  ctl = new AbortController();
  const attempts: Attempt[] = [];
  status = "Claude が部品を選んで模型を組み立てています（1分ほどかかることがあります）…";
  render();
  try {
    const before = previous;
    let spec = await sample.json(netPrompt(topic, before), { signal: ctl.signal, cache: false });
    let verdict = await check(spec);
    attempts.push({ spec, verdict });
    if (!verdict.ok) {
      status = "確かめに通らなかった点を伝えて、一度だけ組み立て直してもらっています…";
      render();
      spec = await sample.json(netRetryPrompt(topic, before, spec, verdict.checks.filter((c) => !c.ok)), { signal: ctl.signal, cache: false });
      verdict = await check(spec);
      attempts.push({ spec, verdict });
    }
    if (verdict.ok) show({ spec: spec as NetPuzzleSpec, verdict, source: "ai", attempts, prev: before });
    else show({ spec: PREPARED_NETS[0]!, verdict: verifyNetPuzzle(PREPARED_NETS[0]), source: "prepared", attempts, note: "AIが組み立てた模型は、二度とも確かめに通りませんでした。代わりに用意した謎を出します（下の記録で、どこが通らなかったかを見られます）。" });
    status = "";
  } catch (e) {
    const code = (e as { code?: string }).code ?? "upstream_error";
    status = ERR[code] ?? "Claude との通信がうまくいきませんでした。もう一度押してください。";
    if (attempts.length) shown = { ...(shown ?? { spec: PREPARED_NETS[0]!, verdict: verifyNetPuzzle(PREPARED_NETS[0]), source: "prepared" as const }), attempts };
  } finally {
    busy = false;
    render();
  }
}

function show(s: Shown): void {
  shown = s;
  watchIdx = 0;
  tIndex = Math.round((s.verdict.runA!.t.length - 1) * 0.08);
  evidence = null;
  revealed = false;
}

function unitOf(spec: NetPuzzleSpec, p: Probe): { name: string; unit: string } {
  return "node" in p ? spec.units.level : "flow" in p ? spec.units.flow : spec.units.amount;
}

// ---------- 組み立てた模型の図（つなぎ方から自動で描く） ----------

function nodeOrder(spec: NetPuzzleSpec): string[] {
  const links = spec.parts.filter((p) => p.type === "resist" || p.type === "valve");
  const fixed = spec.nodes.filter((n) => n.fixed !== undefined);
  const start = fixed.find((n) => links.some((l) => l.from === n.id && l.type === "valve")) ?? spec.nodes.find((n) => n.fixed === undefined && spec.parts.some((p) => p.type === "source" && p.node === n.id)) ?? spec.nodes[0]!;
  const order = [start.id];
  for (let k = 0; k < order.length; k++) {
    for (const l of links) {
      const other = l.from === order[k] ? l.to! : l.to === order[k] ? l.from! : null;
      if (other && !order.includes(other)) order.push(other);
    }
  }
  for (const n of spec.nodes) if (!order.includes(n.id)) order.push(n.id);
  return order;
}

/** 長い名前を、決まった字数ごとに折り返した SVG の文字にする */
function wrapText(x: number, y: number, text: string, per: number, cls: string, anchor = "middle"): string {
  const lines: string[] = [];
  for (let i = 0; i < text.length && lines.length < 3; i += per) lines.push(text.slice(i, i + per));
  return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${lines.map((l, k) => `<tspan x="${x}" dy="${k === 0 ? 0 : 14}">${esc(l)}</tspan>`).join("")}</text>`;
}

function schematic(spec: NetPuzzleSpec, lit: Set<string>): string {
  const order = nodeOrder(spec);
  const gap = 132;
  const W = Math.max(560, 80 + gap * (order.length - 1) + 170);
  const row = 128;
  const rail = 236;
  const H = 280;
  const X = new Map(order.map((id, i) => [id, 80 + i * gap]));
  const node = (id: string) => spec.nodes.find((n) => n.id === id)!;
  const cls = (p: NetPart) => (lit.has(p.id) ? "part lit" : "part");
  const out: string[] = [];
  out.push(`<line x1="${X.get(order[0]!)! - 30}" x2="${X.get(order[order.length - 1]!)! + 30}" y1="${rail}" y2="${rail}" class="wire"/><text x="${X.get(order[0]!)! - 30}" y="${rail + 20}" class="lbl soft">高さ 0 の基準</text>`);
  // 両端をつなぐ部品（流れにくさ・一方通行の戸）
  const pairCount = new Map<string, number>();
  for (const p of spec.parts) {
    if (p.type !== "resist" && p.type !== "valve") continue;
    const a = X.get(p.from!)!;
    const b = X.get(p.to!)!;
    const key = [p.from, p.to].sort().join("|");
    const k = pairCount.get(key) ?? 0;
    pairCount.set(key, k + 1);
    const adjacent = Math.abs(order.indexOf(p.from!) - order.indexOf(p.to!)) === 1 && k === 0;
    const y = adjacent ? row : row - 46 - 26 * k - 8 * Math.abs(order.indexOf(p.from!) - order.indexOf(p.to!));
    const mx = (a + b) / 2;
    const dir = b > a ? 1 : -1;
    out.push(`<g class="${cls(p)}">`);
    out.push(adjacent ? `<line x1="${a}" x2="${b}" y1="${y}" y2="${y}" class="wire"/>` : `<polyline points="${a},${row} ${a},${y} ${b},${y} ${b},${row}" class="wire" fill="none"/>`);
    out.push(`<rect x="${mx - 22}" y="${y - 11}" width="44" height="22" class="mask"/>`);
    if (p.type === "resist") out.push(`<polyline points="${mx - 20},${y} ${mx - 15},${y - 8} ${mx - 7},${y + 8} ${mx + 1},${y - 8} ${mx + 9},${y + 8} ${mx + 16},${y - 8} ${mx + 20},${y}" class="sym" fill="none"/>`);
    else out.push(`<polygon points="${mx - 9 * dir},${y - 10} ${mx - 9 * dir},${y + 10} ${mx + 9 * dir},${y}" class="sym fillsym"/><line x1="${mx + 10 * dir}" x2="${mx + 10 * dir}" y1="${y - 10}" y2="${y + 10}" class="sym"/>`);
    out.push(`<text x="${mx}" y="${y - 16}" class="lbl" text-anchor="middle">${esc(p.name)}</text></g>`);
  }
  // 節点と、節点から基準へおりる部品
  for (const id of order) {
    const n = node(id);
    const x = X.get(id)!;
    if (n.fixed !== undefined) {
      out.push(`<line x1="${x}" x2="${x}" y1="${row}" y2="${rail}" class="wire"/>`);
      if (n.fixed !== 0) out.push(`<rect x="${x - 16}" y="${(row + rail) / 2 - 12}" width="32" height="24" class="mask"/><line x1="${x - 14}" x2="${x + 14}" y1="${(row + rail) / 2 - 4}" y2="${(row + rail) / 2 - 4}" class="sym"/><line x1="${x - 7}" x2="${x + 7}" y1="${(row + rail) / 2 + 4}" y2="${(row + rail) / 2 + 4}" class="sym thick"/>`);
      out.push(`<text x="${x + 18}" y="${(row + rail) / 2 + 4}" class="lbl soft">${fmt(n.fixed)} ${esc(spec.units.level.unit)}</text>`);
      out.push(`<rect x="${x - 7}" y="${row - 7}" width="14" height="14" class="fixed"/>`);
    } else out.push(`<circle cx="${x}" cy="${row}" r="6" class="dot"/>`);
    out.push(n.fixed !== undefined ? wrapText(x + 18, (row + rail) / 2 + 24, n.name, 8, "lbl node", "start") : wrapText(x + 8, row + 22, n.name, 8, "lbl node", "start"));
    const hang = spec.parts.filter((p) => (p.type === "store" || p.type === "chamber" || p.type === "source") && p.node === id);
    hang.forEach((p, k) => {
      const bx = x + (k - (hang.length - 1) / 2) * 34 + (hang.length === 1 ? 0 : 0);
      const top = row + 36;
      const mid = (top + rail) / 2 + 6;
      out.push(`<g class="${cls(p)}"><polyline points="${x},${row} ${x},${top} ${bx},${top} ${bx},${rail}" class="wire" fill="none"/>`);
      if (p.type === "source") out.push(`<circle cx="${bx}" cy="${mid}" r="12" class="mask sym"/><line x1="${bx}" x2="${bx}" y1="${mid + 7}" y2="${mid - 7}" class="sym"/><polyline points="${bx - 4},${mid - 3} ${bx},${mid - 8} ${bx + 4},${mid - 3}" class="sym" fill="none"/>`);
      else {
        out.push(`<rect x="${bx - 14}" y="${mid - 6}" width="28" height="12" class="mask"/><line x1="${bx - 13}" x2="${bx + 13}" y1="${mid - 4}" y2="${mid - 4}" class="sym thick"/><line x1="${bx - 13}" x2="${bx + 13}" y1="${mid + 4}" y2="${mid + 4}" class="sym thick"/>`);
        if (p.type === "chamber") out.push(`<line x1="${bx - 16}" x2="${bx + 16}" y1="${mid + 14}" y2="${mid - 14}" class="sym"/><polyline points="${bx + 9},${mid - 14} ${bx + 16},${mid - 14} ${bx + 16},${mid - 7}" class="sym" fill="none"/>`);
      }
      out.push(`<text x="${bx + (p.type === "chamber" ? 26 : 18)}" y="${mid - 10 + (k % 2) * 30}" class="lbl">${esc(p.name)}</text></g>`);
    });
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="schem" role="img" aria-label="AIが組み立てた模型の図">${out.join("")}</svg>`;
}

// ---------- グラフ ----------

function chart(s: Shown): string {
  const { spec, verdict: v } = s;
  const w = spec.watch[watchIdx]!;
  const W = 760, H = 260, L = 56, R = 16, T = 14, B = 34;
  const t = v.runA!.t;
  const a = probeSeries(v.runA!, w.probe)!;
  const b = probeSeries(v.runB!, w.probe)!;
  const tMax = t[t.length - 1]!;
  const all = [...a, ...b];
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad; hi += pad;
  const xs = (x: number) => L + ((W - L - R) * x) / tMax;
  const ys = (y: number) => T + (H - T - B) * (1 - (y - lo) / (hi - lo));
  const line = (arr: number[]) => t.map((x, k) => `${xs(x).toFixed(1)},${ys(arr[k]!).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const ti = t[tIndex]!;
  const band = `<rect x="${L}" y="${T}" width="${xs(spec.clock.on) - L}" height="${H - T - B}" class="band"/><text x="${L + 6}" y="${T + 16}" class="soft">送る・縮むあいだ</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="AとBの${esc(w.label)}の変化">
    ${band}
    ${ticks.map((y) => `<line x1="${L}" x2="${W - R}" y1="${ys(y)}" y2="${ys(y)}" class="grid"/><text x="${L - 6}" y="${ys(y) + 4}" class="soft" text-anchor="end">${fmt(y)}</text>`).join("")}
    <text x="${W - R}" y="${H - 6}" class="soft" text-anchor="end">時間（${esc(spec.clock.timeUnit)}）${spec.clock.kind === "beats" ? "・落ち着いた1回分" : ""} →</text>
    <text x="${L}" y="${H - 6}" class="soft">0</text>
    <polyline points="${line(a)}" class="lineA"/>
    <polyline points="${line(b)}" class="lineB"/>
    <line x1="${xs(ti)}" x2="${xs(ti)}" y1="${T}" y2="${H - B}" class="cursor"/>
    <circle cx="${xs(ti)}" cy="${ys(a[tIndex]!)}" r="5" class="dotA"/><circle cx="${xs(ti)}" cy="${ys(b[tIndex]!)}" r="5" class="dotB"/>
  </svg>`;
}

function seeTol(s: Shown): number {
  const a = probeSeries(s.verdict.runA!, s.spec.watch[watchIdx]!.probe)!;
  return 0.08 * Math.max(1e-12, Math.max(...a) - Math.min(...a));
}

function puzzleHtml(s: Shown): string {
  const { spec, verdict: v } = s;
  const w = spec.watch[watchIdx]!;
  const u = unitOf(spec, w.probe);
  const a = probeSeries(v.runA!, w.probe)!;
  const b = probeSeries(v.runB!, w.probe)!;
  const t = v.runA!.t[tIndex]!;
  const robotU = spec.robot.metric === "halfTime" ? spec.clock.timeUnit : spec.robot.metric === "perCycle" ? spec.units.amount.unit : unitOf(spec, spec.robot.probe).unit;
  const robotWhere = "node" in spec.robot.probe ? spec.nodes.find((n) => n.id === (spec.robot.probe as { node: string }).node)?.name : spec.parts.find((p) => p.id === ("flow" in spec.robot.probe ? spec.robot.probe.flow : (spec.robot.probe as { amount: string }).amount))?.name;
  const lit = new Set<string>(revealed ? [spec.B.part, ...(spec.B.compensate ? [spec.B.compensate.part] : [])] : []);
  const bPart = spec.parts.find((p) => p.id === spec.B.part)!;
  return `<section class="puzzle">
    <p class="badge ${s.source}">${s.source === "ai" ? "AIが組み立てた模型（計算と判定はプログラムが確かめた。体の何にあたるかはAIの見立てで、先生の確認前）" : "用意した謎"}</p>
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
    <h2>${esc(spec.title)}<small>${esc(spec.topic)}</small></h2>
    ${linkHtml(s)}
    <ol class="scenes">${spec.scenes.map((sc) => `<li><b>${esc(sc.tag)}</b>${sc.caption.map((c) => `<span>${esc(c)}</span>`).join("")}</li>`).join("")}</ol>
    <p class="end">${esc(spec.endLine)}</p>
    <div class="model"><p class="soft">${s.source === "ai" ? "AIが部品箱から組み立てた模型" : "この謎の模型"}（部品 ${spec.parts.length}・場所 ${spec.nodes.length}）。プログラムは、このつなぎ方のまま計算した。</p>
      ${schematic(spec, lit)}
      <p class="soft">外からエネルギーを入れているもの：${(v.energySources ?? []).map(esc).join("、")}</p></div>
    <div class="robot"><span class="who">検査ロボ TEJUN</span><p>「${esc(spec.robot.says)}」</p>
      <p class="nums">ロボが見る数字（${esc(robotWhere)}・${METRIC[spec.robot.metric]}）：見本A ${fmt(v.robotA!)}／試作品B ${fmt(v.robotB!)} ${esc(robotU)} → <b>区別できません</b></p></div>
    <div class="lab">
      ${spec.watch.length > 1 ? `<div class="row tabs" role="tablist">${spec.watch.map((x, i) => `<button role="tab" aria-selected="${i === watchIdx}" data-act="watch" data-i="${i}" class="${i === watchIdx ? "on" : ""}">${esc(x.label)}</button>`).join("")}</div>` : ""}
      <p class="legend"><i class="kA"></i>見本A　<i class="kB"></i>試作品B　縦：${esc(w.label)}（${esc(u.unit)}）</p>
      ${chart(s)}
      <label class="slider" for="t">時刻を選ぶ <input id="t" type="range" min="0" max="${v.runA!.t.length - 1}" step="1" value="${tIndex}"></label>
      <p class="nums">${fmt(t)} ${esc(spec.clock.timeUnit)}：A ${fmt(a[tIndex]!)}／B ${fmt(b[tIndex]!)}　差 ${fmt(b[tIndex]! - a[tIndex]!)} ${esc(u.unit)}</p>
      <div class="row"><button class="go" data-act="evidence">この時刻を証拠にする</button>
        ${evidence ? `<span class="stamp ${evidence.ok ? "win" : ""}">${evidence.ok ? `見落とし！ ${esc(evidence.label)}、${fmt(evidence.t)} ${esc(spec.clock.timeUnit)}で差 ${fmt(evidence.diff)}` : "この時刻では区別できない（差が小さい）"}</span>` : ""}</div>
    </div>
    ${evidence?.ok ? `<div class="row"><button class="go" data-act="reveal">正体を開ける</button></div>` : ""}
    ${revealed ? `<div class="reveal"><p><b>正体：</b>${esc(spec.B.reveal)}</p>
      <p><b>違った部品：</b>${esc(bPart.name)}（${esc(spec.B.param)} が見本の ${spec.B.factor} 倍）${spec.B.compensate ? `。ロボの数字がそろうように、プログラムが ${esc(spec.parts.find((p) => p.id === spec.B.compensate!.part)?.name)}（${esc(spec.B.compensate.param)}）を見本の ${fmt(v.compensateFactor ?? 1)} 倍に合わせた` : ""}</p>
      <p><b>見立て：</b>${esc(spec.analogy)}</p>
      <ul class="roles">${spec.parts.map((p) => `<li${lit.has(p.id) ? ' class="lit"' : ""}><b>${esc(p.name)}</b>（${TYPE_NAME[p.type]}）＝${esc(p.role)}<small class="cite">出典：${esc(refById(p.ref)?.cite ?? "—")}</small></li>`).join("")}</ul>
      <p class="soft">部品の見立ては、出典の文献で知られている模型による。実物を完全に表すものではない。</p>
      <p><b>この模型で扱わないこと：</b>${spec.outOfScope.map(esc).join("、")}</p>
      ${spec.missingParts?.length ? `<p><b>部品箱にないが、本当は要る部品（AIの申告）：</b>${spec.missingParts.map(esc).join("、")}</p>` : ""}</div>
      <div class="next"><p><b>つづき：</b>この謎を前の謎にして、次をつくる${s.source === "ai" ? "（題材の候補はAIの提案）" : ""}</p>
        <div class="row">${spec.nextTopics.map((t) => `<button type="button" data-act="next" data-topic="${esc(t)}" ${!sample || busy ? "disabled" : ""}>${esc(t)}</button>`).join("")}</div></div>` : ""}
    <p class="fine">値は模型の値で、体の値や病気の判定を表しません。</p>
  </section>`;
}

/** つなぎ：前の謎の結び → この謎への話 → 部品の足し引き（足し引きはプログラムの計算） */
function linkHtml(s: Shown): string {
  const { spec, verdict: v } = s;
  const d = v.diff;
  const chip = (t: DiffType, k: string) => `<span class="chip ${k}">${k === "add" ? "＋" : k === "del" ? "−" : ""}${DIFF_NAME[t]}</span>`;
  return `<div class="link"><p class="from">前の謎「${esc(spec.link.fromTitle)}」${s.prev ? `の結び：${esc(s.prev.endLine)}` : ""}</p>
    <p class="story">${esc(spec.link.story)}</p>
    ${d ? `<p class="diff"><span class="soft">前の模型から（プログラムの計算）：</span>${d.added.map((t) => chip(t, "add")).join("")}${d.removed.map((t) => chip(t, "del")).join("")}${[...new Set(d.kept)].map((t) => chip(t, "keep")).join("")}</p>` : `<p class="soft">${esc(spec.link.change)}</p>`}</div>`;
}

function checksHtml(list: Check[]): string {
  return `<ul class="checks">${list.map((c) => `<li class="${c.ok ? "ok" : "ng"}">${c.ok ? "✓" : "✗"} ${esc(c.label)}${c.detail ? `<small>${esc(c.detail)}</small>` : ""}</li>`).join("")}</ul>`;
}

function render(): void {
  const focus = document.activeElement?.id;
  const topic = document.querySelector<HTMLInputElement>("#topic")?.value ?? "";
  app.innerHTML = `<main>
    <header><h1>つづきの謎をつくる</h1><p>見立てラボの試作。Claude（AI）が部品箱から模型の形ごと組み立て、計算プログラムが「本当に動き、本当に解ける謎か」を確かめます。</p></header>
    <form id="f" class="ask">
      <label for="topic">次に知りたい題材</label>
      <p class="soft">つづきの元（前の謎）：「${esc(previous.title)}」${previous === PREPARED_NETS[1] ? "（謎5）" : "（つづきの謎）"}</p>
      <div class="row"><input id="topic" type="text" maxlength="40" placeholder="例：心臓、肺、腎臓、体温" value="${esc(topic)}" ${!sample || busy ? "disabled" : ""}>
      <button class="go" type="submit" ${!sample || busy ? "disabled" : ""}>模型を組み立てる</button>
      ${busy ? `<button type="button" data-act="stop">止める</button>` : ""}</div>
      ${!ready ? `<p class="soft">準備しています…</p>` : !sample ? `<p class="note">このページを claude.ai で開くと、あなたの Claude が模型を組み立てます（ここでは使えません）。用意した謎は見られます。</p>` : `<p class="soft">押すと、あなたの Claude を使ってよいかの確認が出ます（使用量はあなたのアカウントから）。</p>`}
      <div class="row prepared"><span class="soft">用意した謎：</span>${PREPARED_NETS.map((p, i) => `<button type="button" data-act="prepared" data-i="${i}">${esc(p.topic)}</button>`).join("")}</div>
    </form>
    ${status ? `<p class="status">${esc(status)}</p>` : ""}
    ${shown && shown.verdict.runB ? puzzleHtml(shown) : ""}
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
  if (act === "next" && shown) {
    previous = shown.spec;
    const tp = el.dataset.topic ?? "";
    const inp = document.querySelector<HTMLInputElement>("#topic");
    if (inp) inp.value = tp;
    void generate(tp);
  }
  if (act === "prepared") {
    const spec = PREPARED_NETS[Number(el.dataset.i)]!;
    const prev = Number(el.dataset.i) === 1 ? PREPARED_NETS[0] : undefined;
    show({ spec, verdict: verifyNetPuzzle(spec, prev), source: "prepared", attempts: [], prev });
    render();
  }
  if (act === "watch" && shown) {
    watchIdx = Number(el.dataset.i);
    evidence = null;
    render();
  }
  if (act === "evidence" && shown) {
    const w = shown.spec.watch[watchIdx]!;
    const a = probeSeries(shown.verdict.runA!, w.probe)!;
    const b = probeSeries(shown.verdict.runB!, w.probe)!;
    const d = b[tIndex]! - a[tIndex]!;
    evidence = { label: w.label, t: shown.verdict.runA!.t[tIndex]!, diff: d, ok: Math.abs(d) >= seeTol(shown) };
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
    lab.querySelector(".chart")!.outerHTML = nl.querySelector(".chart")!.outerHTML;
    lab.querySelectorAll(".nums")[0]!.outerHTML = nl.querySelectorAll(".nums")[0]!.outerHTML;
  }
});

render();
void init();
