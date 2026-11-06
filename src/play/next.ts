// つづきの謎（CLAUDE.md 1e-4）の舞台の絵。AIが組み立てた模型（NetPuzzleSpec）と、その計算結果（NetRun）だけから描く。
// 器官の絵は手描きの一覧から選ぶ（人物は描かない）。装置はつなぎ方から自動で描き、計算値で動かす。
import { elastanceAt, probeSeries, type NetPart, type NetPuzzleSpec, type NetRun, type Probe, type Check } from "../../server/model/partsNet.js";
import { robotArt, bubble } from "./art.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const fmtv = (v: number) => (!Number.isFinite(v) ? "—" : (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace("-", "−"));

/** 文字を決まった字数で折り返す（行の数の上限つき） */
export function wrapLines(text: string, per: number, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && out.length < max) {
    if (rest.length <= per) {
      out.push(rest);
      break;
    }
    // 句読点の近くで切る
    let cut = per;
    for (let i = per; i > per - 8 && i > 4; i--) if ("、。）」".includes(rest[i - 1]!)) {
      cut = i;
      break;
    }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest && out.length === max && out.join("").length < text.trim().length) out[max - 1] = out[max - 1]!.slice(0, per - 1) + "…";
  return out;
}

function textBlock(x: number, y: number, lines: string[], size: number, fill: string, anchor = "middle", weight = 900, gap = 1.35): string {
  return lines.map((l, i) => `<text x="${x}" y="${y + i * size * gap}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(l)}</text>`).join("");
}

// ---------- 器官の絵（手描きの一覧。p＝0〜1 の動き） ----------

export const ICONS = ["heart", "lung", "kidney", "heat", "eye", "stomach", "nerve", "vessel", "generic"] as const;
export type IconId = (typeof ICONS)[number];

export function iconFor(spec: NetPuzzleSpec): IconId {
  const want = (spec as { icon?: string }).icon;
  if (want && (ICONS as readonly string[]).includes(want)) return want as IconId;
  const t = `${spec.topic} ${spec.title}`;
  if (/心臓/.test(t)) return "heart";
  if (/肺|息|呼吸|空気/.test(t)) return "lung";
  if (/腎臓|糸球体|ろ過|こし/.test(t)) return "kidney";
  if (/体温|熱|温度/.test(t)) return "heat";
  if (/目|眼/.test(t)) return "eye";
  if (/胃|腸/.test(t)) return "stomach";
  if (/神経|膜/.test(t)) return "nerve";
  if (/血管|脈/.test(t)) return "vessel";
  return "generic";
}

/** 器官の絵（中心 0,0、だいたい ±120 の大きさ） */
export function organ(id: IconId, p: number, t: number): string {
  const q = clamp01(p);
  switch (id) {
    case "heart": {
      const s = 1.06 - 0.12 * q;
      return `<g transform="scale(${s.toFixed(3)})">
        <path d="M0 96 C-70 50 -118 14 -118 -34 C-118 -78 -72 -100 -38 -86 C-18 -78 -6 -62 0 -50 C6 -62 18 -78 38 -86 C72 -100 118 -78 118 -34 C118 14 70 50 0 96z" fill="var(--stamp)" opacity="0.9"/>
        <path d="M-30 -80 C-34 -110 -10 -122 6 -118 M20 -84 C24 -112 52 -118 64 -104" stroke="var(--stamp)" stroke-width="14" fill="none" stroke-linecap="round"/>
        <path d="M-60 -20 C-30 0 -10 20 0 50" stroke="var(--paper)" stroke-width="5" fill="none" opacity="0.6" stroke-linecap="round"/>
      </g>`;
    }
    case "lung": {
      const s = 0.92 + 0.14 * q;
      return `<g>
        <path d="M0 -110 L0 -40 M0 -40 L-34 -10 M0 -40 L34 -10" stroke="var(--soft)" stroke-width="12" fill="none" stroke-linecap="round"/>
        <g transform="translate(-58,30) scale(${s.toFixed(3)})"><path d="M30 -70 C-10 -70 -50 -20 -50 40 C-50 80 -20 90 10 80 C30 70 34 40 34 0 C34 -40 40 -70 30 -70z" fill="var(--you)" opacity="0.85"/></g>
        <g transform="translate(58,30) scale(${s.toFixed(3)})"><path d="M-30 -70 C10 -70 50 -20 50 40 C50 80 20 90 -10 80 C-30 70 -34 40 -34 0 C-34 -40 -40 -70 -30 -70z" fill="var(--you)" opacity="0.85"/></g>
      </g>`;
    }
    case "kidney": {
      const drops = [0, 1, 2].map((i) => {
        const f = (t * 0.6 + i / 3) % 1;
        return `<circle cx="${30 + i * 6}" cy="${50 + f * 60}" r="${5 - f * 2}" fill="var(--gold)" opacity="${(1 - f).toFixed(2)}"/>`;
      }).join("");
      return `<g transform="scale(${(1 + 0.04 * q).toFixed(3)})">
        <path d="M-10 -90 C-80 -100 -110 -30 -100 20 C-90 80 -30 100 0 70 C20 50 0 20 10 0 C20 -20 40 -20 40 -50 C40 -80 20 -88 -10 -90z" fill="var(--bot)" opacity="0.85"/>
        <path d="M10 0 C30 0 40 10 40 30" stroke="var(--gold)" stroke-width="10" fill="none" stroke-linecap="round"/>
        ${drops}
      </g>`;
    }
    case "heat": {
      const h = 30 + 120 * q;
      const waves = [0, 1, 2].map((i) => `<path d="M${40 + i * 30} ${-20 - ((t * 30 + i * 18) % 60)} q10 -12 0 -24 q-10 -12 0 -24" stroke="var(--bot)" stroke-width="5" fill="none" opacity="0.7" stroke-linecap="round"/>`).join("");
      return `<g>
        <rect x="-26" y="-110" width="52" height="190" rx="26" fill="var(--panel)" stroke="var(--soft)" stroke-width="5"/>
        <circle cx="0" cy="92" r="40" fill="var(--stamp)"/>
        <rect x="-12" y="${80 - h}" width="24" height="${h}" rx="12" fill="var(--stamp)"/>
        ${waves}
      </g>`;
    }
    case "eye": {
      const lvl = 20 - 30 * q;
      return `<g>
        <path d="M-130 0 C-70 -80 70 -80 130 0 C70 80 -70 80 -130 0z" fill="var(--paper)" stroke="var(--soft)" stroke-width="5"/>
        <clipPath id="eyeclip"><circle cx="0" cy="0" r="46"/></clipPath>
        <circle cx="0" cy="0" r="46" fill="var(--you)" opacity="0.35"/>
        <rect x="-46" y="${lvl}" width="92" height="80" fill="var(--you)" opacity="0.6" clip-path="url(#eyeclip)"/>
        <circle cx="0" cy="0" r="18" fill="var(--ink)"/>
      </g>`;
    }
    case "stomach": {
      const s = 1.04 - 0.1 * q;
      return `<g transform="scale(${s.toFixed(3)})">
        <path d="M-40 -110 C-40 -80 -30 -70 -40 -40 C-90 0 -80 80 -10 90 C60 100 110 40 90 0 C80 -20 60 -10 50 10 C40 30 10 30 0 0 C-10 -30 -10 -80 -10 -110z" fill="var(--bot)" opacity="0.85"/>
        <path d="M90 0 C110 10 120 30 110 50" stroke="var(--bot)" stroke-width="16" fill="none" stroke-linecap="round"/>
      </g>`;
    }
    case "nerve": {
      const glow = 0.25 + 0.6 * q;
      return `<g>
        <circle cx="-60" cy="0" r="40" fill="var(--gold)" opacity="${glow.toFixed(2)}"/>
        <circle cx="-60" cy="0" r="40" fill="none" stroke="var(--gold)" stroke-width="5"/>
        ${[-60, -20, 20, 60].map((a) => `<path d="M-60 0 L${-60 + 80 * Math.cos(((a + 180) * Math.PI) / 180)} ${80 * Math.sin(((a + 180) * Math.PI) / 180)}" stroke="var(--gold)" stroke-width="6" stroke-linecap="round"/>`).join("")}
        <path d="M-20 0 L130 0" stroke="var(--gold)" stroke-width="10" stroke-linecap="round"/>
        <circle cx="${-20 + 150 * ((t * 0.5) % 1)}" cy="0" r="9" fill="var(--paper)" opacity="0.8"/>
      </g>`;
    }
    case "vessel": {
      const r = 26 + 16 * q;
      return `<g>
        <path d="M-140 -26 L140 -26 M-140 26 L140 26" stroke="var(--stamp)" stroke-width="10" stroke-linecap="round" opacity="0.35"/>
        <ellipse cx="0" cy="0" rx="140" ry="${r.toFixed(1)}" fill="var(--stamp)" opacity="0.8"/>
        <ellipse cx="0" cy="0" rx="120" ry="${(r * 0.55).toFixed(1)}" fill="var(--paper)" opacity="0.25"/>
      </g>`;
    }
    default: {
      const lvl = 40 - 70 * q;
      return `<g>
        <path d="M-30 -100 L-30 -30 L-90 80 C-96 92 -88 100 -76 100 L76 100 C88 100 96 92 90 80 L30 -30 L30 -100z" fill="var(--panel)" stroke="var(--soft)" stroke-width="5"/>
        <clipPath id="flaskclip"><path d="M-30 -100 L-30 -30 L-90 80 C-96 92 -88 100 -76 100 L76 100 C88 100 96 92 90 80 L30 -30 L30 -100z"/></clipPath>
        <rect x="-100" y="${lvl}" width="200" height="160" fill="var(--you)" opacity="0.6" clip-path="url(#flaskclip)"/>
      </g>`;
    }
  }
}

// ---------- 見立ての装置（つなぎ方から自動で描く） ----------

export function nodeOrder(spec: NetPuzzleSpec): string[] {
  const links = spec.parts.filter((p) => p.type === "resist" || p.type === "valve");
  const fixed = spec.nodes.filter((n) => n.fixed !== undefined);
  const start =
    fixed.find((n) => links.some((l) => l.from === n.id && l.type === "valve")) ??
    spec.nodes.find((n) => n.fixed === undefined && spec.parts.some((p) => p.type === "source" && p.node === n.id)) ??
    spec.nodes[0]!;
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

/** 動かすための下ごしらえ：部品ごとの流れの積算（粒の位置）・たまった量の幅。A と B で目盛りをそろえる */
export interface MachineScale {
  amtMin: Record<string, number>;
  amtMax: Record<string, number>;
  flowMax: number;
}
export function machineScale(spec: NetPuzzleSpec, runs: NetRun[]): MachineScale {
  const amtMin: Record<string, number> = {};
  const amtMax: Record<string, number> = {};
  let flowMax = 1e-12;
  for (const p of spec.parts) {
    if (p.type === "store" || p.type === "chamber") {
      const all = runs.flatMap((r) => r.amount[p.id] ?? []);
      amtMin[p.id] = Math.min(...all);
      amtMax[p.id] = Math.max(...all);
    } else for (const r of runs) flowMax = Math.max(flowMax, ...(r.flow[p.id] ?? [0]).map(Math.abs));
  }
  return { amtMin, amtMax, flowMax };
}
const cumCache = new WeakMap<NetRun, Record<string, number[]>>();
function cumFlow(run: NetRun): Record<string, number[]> {
  let c = cumCache.get(run);
  if (c) return c;
  c = {};
  for (const [id, f] of Object.entries(run.flow)) {
    const out = [0];
    for (let i = 1; i < f.length; i++) out.push(out[i - 1]! + ((f[i]! + f[i - 1]!) / 2) * (run.t[i]! - run.t[i - 1]!));
    c[id] = out;
  }
  cumCache.set(run, c);
  return c;
}

export interface MachineOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  tag?: string;
  tagColor?: string;
  lit?: Set<string>;
  hideValues?: boolean;
  /** 拡大（部品を大きく描く） */
  scale?: number;
}

export function machine(spec: NetPuzzleSpec, run: NetRun, k: number, sc: MachineScale, oo: MachineOpts): string {
  const z = oo.scale ?? 1;
  const o = { ...oo, x: 0, y: 0, w: oo.w / z, h: oo.h / z };
  return `<g transform="translate(${oo.x},${oo.y}) scale(${z})">${machineInner(spec, run, k, sc, o)}</g>`;
}

function machineInner(spec: NetPuzzleSpec, run: NetRun, k: number, sc: MachineScale, o: MachineOpts): string {
  const order = nodeOrder(spec);
  const n = order.length;
  const gap = o.w / Math.max(1, n);
  const cy = o.y + o.h * 0.58;
  const X = new Map(order.map((id, i) => [id, o.x + gap * (i + 0.5)]));
  const lit = o.lit ?? new Set<string>();
  const t = run.t[k]!;
  const cum = cumFlow(run);
  const dt = run.t[1]! - run.t[0]!;
  const pxPerFlow = 7 / (sc.flowMax * dt);
  const lvlUnit = spec.units.level.unit;
  const out: string[] = [];
  if (o.tag) out.push(`<text x="${o.x + 6}" y="${o.y + 18}" fill="${o.tagColor ?? "var(--soft)"}" font-size="16" font-weight="900">${esc(o.tag)}</text>`);
  // 管（流れにくさ・一方通行の戸）
  const pairCount = new Map<string, number>();
  for (const p of spec.parts) {
    if (p.type !== "resist" && p.type !== "valve") continue;
    const a = X.get(p.from!)!;
    const b = X.get(p.to!)!;
    const key = [p.from, p.to].sort().join("|");
    const kk = pairCount.get(key) ?? 0;
    pairCount.set(key, kk + 1);
    const span = Math.abs(order.indexOf(p.from!) - order.indexOf(p.to!));
    const adjacent = span === 1 && kk === 0;
    // 隣どうしでない管は、場所の名前の下を回す（上はポンプと数字があるため）
    const yy = adjacent ? cy : cy + 84 + kk * 12;
    const d = adjacent ? `M${a} ${cy} L${b} ${cy}` : `M${a} ${cy} L${a} ${yy} L${b} ${yy} L${b} ${cy}`;
    const f = run.flow[p.id]![k]!;
    const off = -(cum[p.id]![k]! * pxPerFlow);
    const isLit = lit.has(p.id);
    out.push(`<path d="${d}" stroke="${isLit ? "var(--stamp)" : "var(--line)"}" stroke-width="14" fill="none" stroke-linejoin="round"/>`);
    out.push(`<path d="${d}" stroke="var(--you)" stroke-width="6" fill="none" stroke-dasharray="3 13" stroke-linecap="round" stroke-dashoffset="${off.toFixed(1)}" opacity="${Math.abs(f) > sc.flowMax * 0.01 ? 0.95 : 0.25}"/>`);
    const mx = (a + b) / 2;
    if (p.type === "valve") {
      const open = f > sc.flowMax * 0.005;
      const dir = b > a ? 1 : -1;
      out.push(`<g transform="translate(${mx},${yy})"><rect x="-16" y="-16" width="32" height="32" rx="6" fill="var(--panel)" stroke="${isLit ? "var(--stamp)" : "var(--soft)"}" stroke-width="3"/>
        <path d="M${-7 * dir} -9 L${8 * dir} 0 L${-7 * dir} 9z" fill="${open ? "var(--you)" : "var(--soft)"}"/>
        <line x1="${11 * dir}" y1="-12" x2="${open ? 11 * dir + 10 * dir : 11 * dir}" y2="${open ? -2 : 12}" stroke="${open ? "var(--you)" : "var(--stamp)"}" stroke-width="4" stroke-linecap="round"/></g>`);
    } else {
      out.push(`<g transform="translate(${mx},${yy})"><rect x="-20" y="-9" width="40" height="18" rx="9" fill="var(--panel)" stroke="${isLit ? "var(--stamp)" : "var(--soft)"}" stroke-width="3"/>
        <path d="M-14 0 l5 -5 l6 10 l6 -10 l6 10 l5 -5" stroke="${isLit ? "var(--stamp)" : "var(--soft)"}" stroke-width="2.5" fill="none"/></g>`);
    }
  }
  // 場所（ためる・部屋・決まった高さ）と送りこむもの
  for (const id of order) {
    const node = spec.nodes.find((q) => q.id === id)!;
    const x = X.get(id)!;
    const lv = run.level[id]![k]!;
    if (node.fixed !== undefined) {
      out.push(`<g transform="translate(${x},${cy})"><rect x="-26" y="-20" width="52" height="58" rx="8" fill="var(--panel)" stroke="var(--soft)" stroke-width="3"/>
        <rect x="-22" y="${8 - Math.min(26, Math.abs(node.fixed) / 4)}" width="44" height="${26 + Math.min(26, Math.abs(node.fixed) / 4) - 0}" rx="5" fill="var(--soft)" opacity="0.35"/>
        <text x="0" y="16" fill="var(--ink)" font-size="13" font-weight="800" text-anchor="middle">${fmtv(node.fixed)}</text></g>`);
    }
    const st = spec.parts.find((p) => (p.type === "store" || p.type === "chamber") && p.node === id);
    if (st) {
      const q = run.amount[st.id]![k]!;
      const lo = sc.amtMin[st.id]!;
      const hi = sc.amtMax[st.id]!;
      const f = hi > lo ? (q - lo) / (hi - lo) : 0.5;
      const isLit = lit.has(st.id);
      if (st.type === "store") {
        const r = 16 + 22 * Math.sqrt(clamp01(f));
        out.push(`<circle cx="${x}" cy="${cy}" r="${r.toFixed(1)}" fill="var(--you)" opacity="0.28"/><circle cx="${x}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${isLit ? "var(--stamp)" : "var(--you)"}" stroke-width="${isLit ? 5 : 3}"/>`);
      } else {
        const e = elastanceAt(spec, st, t);
        const act = st.Emax! > st.Emin! ? clamp01((e - st.Emin!) / (st.Emax! - st.Emin!)) : 0;
        const w = 30 + 44 * clamp01(f);
        out.push(`<rect x="${x - w / 2}" y="${cy - 38}" width="${w.toFixed(1)}" height="76" rx="22" fill="var(--stamp)" opacity="${(0.25 + 0.6 * act).toFixed(2)}"/>
          <rect x="${x - w / 2}" y="${cy - 38}" width="${w.toFixed(1)}" height="76" rx="22" fill="none" stroke="${isLit ? "var(--gold)" : "var(--stamp)"}" stroke-width="${isLit ? 5 : 3}"/>
          ${act > 0.05 ? `<path d="M${x - w / 2 - 12} ${cy} l8 0 M${x + w / 2 + 4} ${cy} l8 0" stroke="var(--stamp)" stroke-width="4" stroke-linecap="round"/>` : ""}`);
      }
    }
    const src = spec.parts.filter((p) => p.type === "source" && p.node === id);
    for (const p of src) {
      const ang = (cum[p.id]![k]! * pxPerFlow * 3) % 360;
      const on = Math.abs(run.flow[p.id]![k]!) > sc.flowMax * 0.01;
      const px = x - gap * 0.32;
      const py = cy - o.h * 0.24;
      out.push(`<path d="M${px} ${py} L${px} ${cy - 10} L${x - 20} ${cy - 10}" stroke="var(--line)" stroke-width="10" fill="none"/>
        <g transform="translate(${px},${py})"><circle r="17" fill="var(--panel)" stroke="${lit.has(p.id) ? "var(--stamp)" : on ? "var(--gold)" : "var(--soft)"}" stroke-width="4"/>
        <g transform="rotate(${ang.toFixed(1)})"><path d="M-11 0 L11 0 M0 -11 L0 11" stroke="${on ? "var(--gold)" : "var(--soft)"}" stroke-width="4" stroke-linecap="round"/></g></g>`);
    }
    // 数字（高さ）と場所の名前
    if (node.fixed === undefined && !o.hideValues) out.push(`<text x="${x}" y="${cy - 46}" fill="var(--ink)" font-size="14" font-weight="900" text-anchor="middle">${fmtv(lv)}<tspan font-size="11" fill="var(--soft)"> ${esc(lvlUnit)}</tspan></text>`);
    out.push(textBlock(x, cy + 54, wrapLines(node.name, 7, 2), 12, "var(--soft)", "middle", 700, 1.25));
  }
  return out.join("");
}

// ---------- グラフ ----------

export function lineChart(x: number, y: number, w: number, h: number, t: number[], a: number[], b: number[] | null, k: number, label: string, unit: string, timeUnit: string, band?: number): string {
  const all = [...a, ...(b ?? [])];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad;
  const tMax = t[t.length - 1]!;
  const L = 52;
  const xs = (v: number) => x + L + ((w - L - 10) * v) / tMax;
  const ys = (v: number) => y + 28 + (h - 56) * (1 - (v - lo) / (hi - lo));
  const line = (arr: number[]) => t.map((v, i) => `${xs(v).toFixed(1)},${ys(arr[i]!).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => lo + pad + (hi - lo - 2 * pad) * f);
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    <text x="${x + 14}" y="${y + 20}" fill="var(--ink)" font-size="14" font-weight="900">${esc(label)}（${esc(unit)}）</text>
    ${band ? `<rect x="${xs(0)}" y="${y + 28}" width="${xs(band) - xs(0)}" height="${h - 56}" fill="var(--gold)" opacity="0.08"/>` : ""}
    ${ticks.map((v) => `<line x1="${x + L}" x2="${x + w - 10}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)"/><text x="${x + L - 6}" y="${ys(v) + 4}" fill="var(--soft)" font-size="11" text-anchor="end">${fmtv(v)}</text>`).join("")}
    <polyline points="${line(a)}" fill="none" stroke="var(--soft)" stroke-width="2.5" stroke-dasharray="6 5"/>
    ${b ? `<polyline points="${line(b)}" fill="none" stroke="var(--you)" stroke-width="3"/>` : ""}
    <line x1="${xs(t[k]!)}" x2="${xs(t[k]!)}" y1="${y + 28}" y2="${y + h - 28}" stroke="var(--gold)" stroke-width="2"/>
    <circle cx="${xs(t[k]!)}" cy="${ys(a[k]!)}" r="5" fill="var(--soft)"/>${b ? `<circle cx="${xs(t[k]!)}" cy="${ys(b[k]!)}" r="6" fill="var(--you)"/>` : ""}
    <text x="${x + w - 10}" y="${y + h - 8}" fill="var(--soft)" font-size="11" text-anchor="end">時間（${esc(timeUnit)}）→</text>
    <text x="${x + L}" y="${y + h - 8}" fill="var(--soft)" font-size="11">- - 見本A${b ? "　━ 試作品B" : ""}</text>
  </g>`;
}

export function unitOf(spec: NetPuzzleSpec, p: Probe): string {
  return "node" in p ? spec.units.level.unit : "flow" in p ? spec.units.flow.unit : spec.units.amount.unit;
}

// ---------- 組み立ての場面 ----------

const PART_ICON: Record<NetPart["type"] | "battery", [string, string]> = {
  source: ["送りこむもの", "ポンプ"],
  store: ["ためる部品", "ふくらむ袋"],
  chamber: ["自分で固くなる部屋", "縮む部屋"],
  resist: ["流れにくさ", "細い管"],
  valve: ["一方通行の戸", "弁"],
  battery: ["高さの決まった場所", "電池・タンク"],
};

/** 部品箱。used は使われた部品の種類（光らせる） */
export function partsBox(x: number, y: number, used: Set<string>): string {
  const keys = Object.keys(PART_ICON) as (keyof typeof PART_ICON)[];
  return `<g transform="translate(${x},${y})"><rect width="300" height="300" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    <text x="16" y="28" fill="var(--ink)" font-size="16" font-weight="900">部品箱</text>
    ${keys
      .map((kk, i) => {
        const on = used.has(kk);
        return `<g transform="translate(16,${46 + i * 41})"><rect width="268" height="34" rx="8" fill="${on ? "var(--you)" : "var(--bg, var(--panel))"}" opacity="${on ? 0.22 : 1}" stroke="${on ? "var(--you)" : "var(--line)"}" stroke-width="2"/>
          <text x="12" y="23" fill="var(--ink)" font-size="14" font-weight="${on ? 900 : 600}">${PART_ICON[kk][0]}</text><text x="256" y="23" fill="var(--soft)" font-size="12" text-anchor="end">${PART_ICON[kk][1]}</text></g>`;
      })
      .join("")}</g>`;
}

/** 確かめの一覧（shown 個まで ✓／✗ を出す）。history＝これまでの確かめ（✗ で落ちた回・✓ で通った回）、stamp＝全部出したあとのハンコ */
export function checkBoard(x: number, y: number, checks: Check[], shown: number, o: { history?: ("ok" | "ng" | "wait")[]; stamp?: "pass" | "fail" | null; title?: string } = {}): string {
  const rows = checks.slice(0, 15);
  const h = 72 + rows.length * 24;
  const hist = o.history ?? [];
  const chips = hist
    .map((r, i) => {
      const col = r === "ok" ? "var(--you)" : r === "ng" ? "var(--stamp)" : "var(--soft)";
      return `<g transform="translate(${16 + i * 128},38)"><rect width="118" height="26" rx="13" fill="none" stroke="${col}" stroke-width="2.5"/><text x="59" y="19" fill="${col}" font-size="15" font-weight="900" text-anchor="middle">${i + 1}回目 ${r === "ok" ? "✓ 合格" : r === "ng" ? "✗ 不合格" : "確かめ中"}</text></g>`;
    })
    .join("");
  const stamp =
    o.stamp === "pass"
      ? `<g class="pop" transform="translate(250,${Math.min(h - 40, 150)}) rotate(-10)"><rect x="-74" y="-30" width="148" height="60" rx="10" fill="var(--paper)" stroke="var(--you)" stroke-width="5"/><text y="12" fill="var(--you)" font-size="30" font-weight="900" text-anchor="middle">合格</text></g>`
      : o.stamp === "fail"
        ? `<g class="pop" transform="translate(250,${Math.min(h - 40, 150)}) rotate(-10)"><rect x="-84" y="-30" width="168" height="60" rx="10" fill="var(--paper)" stroke="var(--stamp)" stroke-width="5"/><text y="12" fill="var(--stamp)" font-size="30" font-weight="900" text-anchor="middle">不合格</text></g>`
        : "";
  return `<g transform="translate(${x},${y})"><rect width="410" height="${h}" rx="14" fill="var(--panel)" stroke="${o.stamp === "fail" ? "var(--stamp)" : "var(--line)"}" stroke-width="${o.stamp === "fail" ? 3 : 2}"/>
    <text x="16" y="26" fill="var(--ink)" font-size="16" font-weight="900">${esc(o.title ?? "計算プログラムの確かめ")}</text>${chips}
    ${rows
      .map((c, i) => {
        const on = i < shown;
        const bad = on && !c.ok;
        return `${bad ? `<rect x="8" y="${76 + i * 24}" width="394" height="22" rx="5" fill="var(--stamp)" opacity=".16"/>` : ""}<text x="16" y="${92 + i * 24}" fill="${!on ? "var(--line)" : c.ok ? "var(--you)" : "var(--stamp)"}" font-size="14" font-weight="800">${on ? (c.ok ? "✓" : "✗") : "・"} ${esc(c.label.length > 25 ? c.label.slice(0, 24) + "…" : c.label)}</text>`;
      })
      .join("")}${stamp}</g>`;
}

// ---------- 導入ムービー（AIの場面と結び、見本Aの計算値から自動で描く） ----------

export const NEXT_SCENE_DUR = [5, 5.5, 4.5] as const;
export function nextMovieLength(): number {
  return NEXT_SCENE_DUR.reduce((s, v) => s + v, 0);
}

/** 主に見るもの（watch の一つ目）の見本Aを 0〜1 にした動き */
function pulseOf(spec: NetPuzzleSpec, run: NetRun, k: number): number {
  const y = probeSeries(run, spec.watch[0]!.probe)!;
  const lo = Math.min(...y);
  const hi = Math.max(...y);
  return hi > lo ? (y[k]! - lo) / (hi - lo) : 0;
}

/** 場面の時間 s（秒）を、計算の記録の番号に。くり返し（脈）は1回を 1.6 秒で回す。一度だけのときは場面の長さで一回流す */
function idxAt(spec: NetPuzzleSpec, run: NetRun, s: number, dur: number): number {
  const n = run.t.length - 1;
  const f = spec.clock.kind === "beats" ? (s / 1.6) % 1 : clamp01(s / dur);
  return Math.min(n, Math.round(f * n));
}

function movieFrame(inner: string): string {
  return `<g><rect x="0" y="0" width="400" height="300" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>${inner}</g>`;
}

function nextScene(i: number, spec: NetPuzzleSpec, runA: NetRun, s: number, sc: MachineScale, robotA: number): string {
  const icon = iconFor(spec);
  const dur = NEXT_SCENE_DUR[i]!;
  const k = idxAt(spec, runA, s, dur);
  if (i === 0) return movieFrame(`<g transform="translate(200,150) scale(0.95)">${organ(icon, pulseOf(spec, runA, k), s)}</g>`);
  if (i === 1) return movieFrame(machine(spec, runA, k, sc, { x: 10, y: 10, w: 380, h: 260, tag: "見立ての装置（見本の値）", tagColor: "var(--gold)" }));
  const unit = spec.robot.metric === "halfTime" ? spec.clock.timeUnit : spec.robot.metric === "perCycle" ? spec.units.amount.unit : unitOf(spec, spec.robot.probe);
  return movieFrame(`${robotArt(s > 2.6 ? "smug" : "scan", 60, 60, 0.46)}
    <g transform="translate(140,30) scale(0.7)">${bubble(0, 0, "検査ロボ TEJUN", wrapLines(spec.robot.says, 12, 2)[0] ?? "", wrapLines(spec.robot.says, 12, 2)[1] ?? "", 330)}</g>
    <text x="270" y="190" fill="var(--bot)" font-size="30" font-weight="900" text-anchor="middle">${fmtv(robotA)}<tspan font-size="14"> ${esc(unit)}</tspan></text>
    ${s > 2.6 ? `<g transform="translate(176,212) rotate(-6)"><rect width="190" height="44" rx="6" fill="var(--paper)" stroke="var(--stamp)" stroke-width="4"/><text x="95" y="30" fill="var(--stamp)" font-size="19" font-weight="900" text-anchor="middle">判定：同じ</text></g>` : ""}`);
}

export function nextMovie(spec: NetPuzzleSpec, runA: NetRun, robotA: number, t: number, sc: MachineScale): string {
  const total = nextMovieLength();
  const tags = spec.scenes.map((x) => x.tag);
  if (t >= total) {
    return `<g>
      ${[0, 1, 2].map((i) => `<g transform="translate(${30 + i * 416},24)">${nextScene(i, spec, runA, NEXT_SCENE_DUR[i]! * 0.5, sc, robotA)}
        <text x="200" y="326" fill="var(--ink)" font-size="17" font-weight="900" text-anchor="middle">${i + 1}　${esc(tags[i] ?? "")}</text></g>`).join("")}
      <g transform="translate(140,366)"><rect width="1000" height="100" rx="14" fill="var(--paper)"/>
        ${textBlock(500, 40, wrapLines(spec.endLine, 36, 1), 22, "var(--paper-ink)")}
        <text x="500" y="78" fill="var(--paper-soft)" font-size="17" font-weight="900" text-anchor="middle">確かめるのは、あなた。</text></g>
    </g>`;
  }
  let from = 0;
  let i = 0;
  while (i < 2 && t >= from + NEXT_SCENE_DUR[i]!) from += NEXT_SCENE_DUR[i++]!;
  const s = t - from;
  const fade = clamp01(s / 0.35);
  // 字幕は最初の一文だけを大きく（長い字幕は読まれないため。2026-11-05 夜、作者の指摘）
  const cap = (spec.scenes[i]?.caption[0] ?? "").split(/(?<=。)/)[0] ?? "";
  return `<g>
    <text x="640" y="32" fill="var(--gold)" font-size="18" font-weight="900" text-anchor="middle">${esc(tags[i] ?? "")}</text>
    <g opacity="${fade.toFixed(2)}" transform="translate(410,46) scale(1.15)">${nextScene(i, spec, runA, s, sc, robotA)}</g>
    ${textBlock(640, cap.length > 28 ? 420 : 440, wrapLines(cap, 28, 2), 24, "var(--ink)")}
  </g>`;
}
