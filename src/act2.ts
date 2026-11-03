// 第2幕：見方を変える。隠れた答えは持たない（公開の式で計算するだけ）。
import { BASE, DEPTH, type MaterialParams } from "../server/model/public.js";
import { forceAfterPush, forceDuringPush } from "../server/model/sls.js";
import {
  type ThoughtPermeability,
  BASE_MEMBRANE,
  circuitVoltageAfterStop,
  circuitVoltageDuringCharge,
  parallelVoltage,
  toCircuit,
  membraneDeltaAtStop,
  membraneHalfReturnTime,
  membraneNormalizedAfterStop,
  membranePotentialAfterStop,
  withPermeability,
  type Permeability,
} from "../server/model/circuit.js";

export type Lens = "circuit" | "membrane";
export type Act2Guess = "faster" | "same" | "slower";

export const PERM_LABEL: Record<Permeability, string> = {
  easier: "通りやすくする（抵抗を小さく）",
  same: "そのまま",
  harder: "通りにくくする（抵抗を大きく）",
};
export const GUESS_LABEL: Record<Act2Guess, string> = { faster: "速くなる", same: "変わらない", slower: "遅くなる" };

const RUN_COLOR: Record<Permeability, string> = { easier: "var(--relax)", same: "var(--ink-soft)", harder: "var(--instant)" };
const CURRENT = 1;
const SECONDS = 1;

/**
 * 回路図。計算と同じ節点構成：C∞ と「C1 と R の並列」を直列に（テストで照合できるよう、節点を分けて描く）。
 * lens が membrane のとき、C∞ を外して並列部分だけにし、細胞の膜の札と電池（基準の電位）を付ける。
 *   入口(+) → 上の線 → [C∞] → 左の節点(x=300) ─┬─ C1 ─┬─ 右の節点(x=440) → 右の戻り線(x=480) → 下の線 → 入口(−)
 *                                             └─ R ──┘
 */
export function circuitSvg(lens: Lens): string {
  const m = lens === "membrane";
  const lab = (x: number, y: number, a: string, b: string) =>
    `<text x="${x}" y="${y}" font-size="13" fill="var(--ink)" class="tag-swap">${m ? b : a}</text>`;
  return `
  <svg viewBox="0 0 520 250" role="img" aria-label="${m ? "細胞の膜の等価回路" : "素材と同じ形の式で書ける回路：C∞ と、C1・R の並列を直列に"}">
    <!-- 電流の入口 -->
    <circle cx="50" cy="125" r="20" fill="#fff" stroke="var(--ink)" stroke-width="2"/>
    <path d="M50 137 V113 M44 119 L50 112 L56 119" stroke="var(--ink)" stroke-width="2" fill="none"/>
    ${lab(80, 130, "一定の電流（＝押す速さ）", "電流を入れる")}
    <!-- 上の線：入口 → C∞ → 左の節点 -->
    <path d="M50 105 V40 H${m ? 300 : 160}" stroke="var(--ink)" stroke-width="2" fill="none"/>
    ${
      m
        ? ""
        : `<path d="M160 28 V52 M170 28 V52" stroke="var(--ink)" stroke-width="3"/>
    <path d="M170 40 H300" stroke="var(--ink)" stroke-width="2"/>
    <text x="100" y="20" font-size="13" fill="var(--overall)">コンデンサ C∞ ＝ 1÷（待ったあとも残るかたさ）</text>`
    }
    <path d="M300 40 V80" stroke="var(--ink)" stroke-width="2"/>
    <circle cx="300" cy="80" r="3.5" fill="var(--ink)"/>
    <!-- 並列部分（上乗せ分）：ここが細胞の膜と同じ形 -->
    <rect x="288" y="60" width="164" height="130" rx="10" fill="${m ? "var(--claude-wash)" : "none"}" stroke="${m ? "var(--claude)" : "var(--line)"}" stroke-dasharray="${m ? "0" : "5 4"}"/>
    <path d="M300 80 H330 M410 80 H440" stroke="var(--ink)" stroke-width="2"/>
    <path d="M330 68 V92 M340 68 V92" stroke="var(--ink)" stroke-width="3"/>
    <path d="M340 80 H410" stroke="var(--ink)" stroke-width="2"/>
    ${
      m
        ? `<path d="M300 80 V160 H330 l5 -8 l10 16 l10 -16 l10 16 l10 -16 l10 16 l5 -8 H400" stroke="var(--ink)" stroke-width="2" fill="none"/>
    <path d="M404 146 V174" stroke="var(--ink)" stroke-width="3"/><path d="M412 152 V168" stroke="var(--ink)" stroke-width="3"/>
    <path d="M412 160 H440 V80" stroke="var(--ink)" stroke-width="2" fill="none"/>
    <text x="398" y="140" font-size="12" fill="var(--ink)" class="tag-swap">電池</text>`
        : `<path d="M300 80 V160 H330 l5 -8 l10 16 l10 -16 l10 16 l10 -16 l10 16 l5 -8 H440 V80" stroke="var(--ink)" stroke-width="2" fill="none"/>`
    }
    <circle cx="440" cy="80" r="3.5" fill="var(--ink)"/>
    <!-- 右の節点 → 戻り線 → 入口へ（上の線とは交わらない） -->
    <path d="M440 80 H480 V210 H50 V145" stroke="var(--ink)" stroke-width="2" fill="none"/>
    ${lab(306, 112, m ? "" : "C1＝1÷上乗せのかたさ", "膜（電荷をためる）")}
    ${lab(306, 182, "R＝上乗せのかたさ×τ", "イオンの通りにくさ")}
    ${m ? `<text x="60" y="238" font-size="12" fill="var(--ink-soft)">電池＝イオンの濃さの差がつくる基準の電位</text>` : `<text x="60" y="238" font-size="12" fill="var(--ink-soft)">点線の中＝上乗せ分（時定数＝R×C1）</text>`}
  </svg>`;
}

/**
 * 調べたBを回路へ持ち越す：Bの力（開示した値で計算）と、対応表で変換した回路の電圧を重ねる。
 * ふつう（1秒）に押したとき。並列部分の電圧（上乗せ分）も示す。
 */
export function carrySvg(truth: MaterialParams, T: number = 1): string {
  const tMax = T + 8;
  const W = 600;
  const H = 260;
  const L = 46;
  const R = 12;
  const Tp = 28;
  const B = 34;
  const c = toCircuit(truth);
  const current = DEPTH / T;
  const force = (t: number) => (t <= T ? forceDuringPush(truth, T, t) : forceAfterPush(truth, T, t - T));
  const volt = (t: number) => (t <= T ? circuitVoltageDuringCharge(c, current, t) : circuitVoltageAfterStop(c, current, T, t - T));
  const extra = (t: number) => parallelVoltage(c, current, T, t);
  const aForce = (t: number) => (t <= T ? forceDuringPush(BASE, T, t) : forceAfterPush(BASE, T, t - T));
  const yMax = Math.max(2, Math.ceil((force(T) + 0.3) * 2) / 2);
  const xs = (t: number) => L + ((W - L - R) * t) / tMax;
  const ys = (v: number) => Tp + (H - Tp - B) * (1 - v / yMax);
  const line = (f: (t: number) => number, n = 120) => {
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (tMax * i) / n;
      pts.push(`${xs(t).toFixed(1)},${ys(f(t)).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const dots: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (tMax * i) / 24;
    dots.push(`<circle cx="${xs(t).toFixed(1)}" cy="${ys(volt(t)).toFixed(1)}" r="4.5" fill="#fff" stroke="var(--ink)" stroke-width="2"/>`);
  }
  const grid: string[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += 0.5)
    grid.push(`<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${ys(v) + 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">${v.toFixed(1)}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="試料Bの力と、対応する回路の電圧">
    ${grid.join("")}
    <rect x="${L}" y="${Tp}" width="${xs(T) - L}" height="${H - Tp - B}" fill="var(--claude-wash)" opacity="0.6"/>
    <text x="${(L + xs(T)) / 2}" y="${Tp + 14}" font-size="11" text-anchor="middle" fill="var(--claude)" font-weight="700">押す／流す</text>
    <polyline points="${line(aForce)}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="6 4"/>
    <polygon points="${xs(0)},${ys(0)} ${line(extra)} ${xs(tMax)},${ys(0)}" fill="var(--relax)" opacity="0.18"/>
    <polyline points="${line(extra)}" fill="none" stroke="var(--relax)" stroke-width="2"/>
    <polyline points="${line(force)}" fill="none" stroke="var(--claude)" stroke-width="4"/>
    ${dots.join("")}
    <line x1="${L}" x2="${L}" y1="${Tp}" y2="${H - B}" stroke="var(--ink-soft)"/>
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--ink-soft)"/>
    ${[0, 2, 4, 6].map((h) => `<text x="${xs(T + h)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--ink-soft)">${h}</text>`).join("")}
    <text x="${W - R}" y="${H - 12}" font-size="11" text-anchor="end" fill="var(--ink-soft)">止めてからの秒数 →</text>
  </svg>`;
}

export interface Act2Run {
  readonly perm: Permeability;
  readonly half: number | null;
  readonly deltaAtStop: number;
}

/** 第2幕の問い「通りやすくすると、戻るのは速くなるか」の答えを、実行した二つの記録から決める。
 *  「そのまま」と「通りやすい」の両方を実行したときだけ答えを返す（テスト17） */
export function act2Answer(runs: readonly Act2Run[]): Act2Guess | null {
  const same = runs.find((r) => r.perm === "same");
  const easier = runs.find((r) => r.perm === "easier");
  if (!same || !easier || same.half === null || easier.half === null) return null;
  return easier.half < same.half - 1e-12 ? "faster" : easier.half > same.half + 1e-12 ? "slower" : "same";
}

export function runAct2(perm: Permeability): Act2Run {
  const m = withPermeability(BASE_MEMBRANE, perm);
  return { perm, half: membraneHalfReturnTime(m), deltaAtStop: membraneDeltaAtStop(m, CURRENT, SECONDS) };
}

/** 実際の電位と、止めた時の差で割った表示を並べる */
export function act2GraphSvg(runs: readonly Act2Run[], cursor: { perm: Permeability; t: number } | null = null): string {
  const W = 480;
  const H = 210;
  const L = 44;
  const R = 12;
  const T = 24;
  const B = 34;
  const tMax = 6;
  const xs = (t: number) => L + ((W / 2 - L - R) * t) / tMax;
  const panel = (offset: number, title: string, f: (perm: Permeability, h: number) => number, yMin: number, yMax: number, unit: string) => {
    const ys = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
    const lines = runs
      .map((r) => {
        const m = withPermeability(BASE_MEMBRANE, r.perm);
        const pts: string[] = [];
        for (let i = 0; i <= 60; i++) {
          const h = (tMax * i) / 60;
          pts.push(`${offset + xs(h)},${ys(f(r.perm, h))}`);
        }
        const halfX = offset + xs(membraneHalfReturnTime(m) ?? 0);
        return `<polyline points="${pts.join(" ")}" fill="none" stroke="${RUN_COLOR[r.perm]}" stroke-width="2.5"/>
          ${unit === "ratio" ? `<line x1="${halfX}" x2="${halfX}" y1="${ys(0.5)}" y2="${H - B}" stroke="${RUN_COLOR[r.perm]}" stroke-dasharray="3 3"/>` : ""}`;
      })
      .join("");
    const half = unit === "ratio" ? `<line x1="${offset + L}" x2="${offset + W / 2 - R}" y1="${ys(0.5)}" y2="${ys(0.5)}" stroke="var(--grid)"/><text x="${offset + L - 4}" y="${ys(0.5) + 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">半分</text>` : "";
    return `
      <text x="${offset + L}" y="16" font-size="13" font-weight="700" fill="var(--ink)">${title}</text>
      <line x1="${offset + L}" x2="${offset + L}" y1="${T}" y2="${H - B}" stroke="var(--ink-soft)"/>
      <line x1="${offset + L}" x2="${offset + W / 2 - R}" y1="${H - B}" y2="${H - B}" stroke="var(--ink-soft)"/>
      ${half}${lines}${cur(unit, offset, ys, f)}
      <text x="${offset + W / 4 + L / 2}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--ink-soft)">止めてからの時間</text>`;
  };
  /** 膜の図と同じ時刻の印（止めた後だけ） */
  function cur(unit: string, offset: number, ys: (v: number) => number, f: (perm: Permeability, h: number) => number): string {
    if (!cursor || cursor.t < SECONDS) return "";
    const h = Math.min(tMax, cursor.t - SECONDS);
    const x = offset + xs(h);
    return `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="var(--claude)" stroke-width="1.5"/>
      <circle cx="${x}" cy="${ys(f(cursor.perm, h))}" r="5" fill="var(--claude)"/>${unit === "actual" ? `<text x="${x + 6}" y="${T + 10}" font-size="11" fill="var(--claude)">いま</text>` : ""}`;
  }
  const actual = (perm: Permeability, h: number) => membranePotentialAfterStop(withPermeability(BASE_MEMBRANE, perm), CURRENT, SECONDS, h);
  const ratio = (perm: Permeability, h: number) => membraneNormalizedAfterStop(withPermeability(BASE_MEMBRANE, perm), h);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="止めた後の電位の戻り方">
    ${panel(0, "実際の電位", actual, BASE_MEMBRANE.restPotential - 0.1, BASE_MEMBRANE.restPotential + 1.9, "actual")}
    ${panel(W / 2, "止めた時の差で割った表示", ratio, 0, 1.05, "ratio")}
  </svg>`;
}

export const RUN_COLORS = RUN_COLOR;

export type ThoughtGuess = "fasterStill" | "slower" | "noReturn";
export const THOUGHT_GUESS_LABEL: Record<ThoughtGuess, string> = {
  fasterStill: "もっと速く戻る",
  slower: "ゆっくり戻る",
  noReturn: "戻らない",
};

/** 思考実験：止めた時の差で割った表示に、マイナスの抵抗の線を重ねる（枠の上端で止める） */
export function thoughtSvg(showNegative: boolean): string {
  const W = 480;
  const H = 230;
  const L = 64;
  const R = 12;
  const T = 20;
  const B = 34;
  const tMax = 4;
  const yMax = 2.5;
  const xs = (t: number) => L + ((W - L - R) * t) / tMax;
  const ys = (v: number) => T + (H - T - B) * (1 - v / yMax);
  const line = (perm: ThoughtPermeability, color: string, width: number) => {
    const m = withPermeability(BASE_MEMBRANE, perm);
    const pts: string[] = [];
    let clipped = false;
    for (let i = 0; i <= 80; i++) {
      const h = (tMax * i) / 80;
      const v = membraneNormalizedAfterStop(m, h);
      if (v > yMax) {
        clipped = true;
        pts.push(`${xs(h)},${ys(yMax)}`);
        break;
      }
      pts.push(`${xs(h)},${ys(v)}`);
    }
    const last = pts[pts.length - 1]!.split(",").map(Number);
    return `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="${width}"/>
      ${clipped ? `<path d="M ${last[0]} ${last[1]! + 2} l -7 10 h 14 z" fill="${color}"/><text x="${last[0]! + 10}" y="${last[1]! + 14}" font-size="13" font-weight="700" fill="${color}">枠の外へ</text>` : ""}`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="思考実験：抵抗がマイナスのとき">
    <line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--ink-soft)"/>
    <line x1="${L}" x2="${W - R}" y1="${ys(0)}" y2="${ys(0)}" stroke="var(--ink-soft)"/>
    <line x1="${L}" x2="${W - R}" y1="${ys(1)}" y2="${ys(1)}" stroke="var(--grid)"/>
    <text x="${L - 6}" y="${ys(1) + 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">止めた時</text>
    <text x="${L - 6}" y="${ys(0) + 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">基準</text>
    ${line("easier", RUN_COLOR.easier, 2)}${line("same", RUN_COLOR.same, 2)}${line("harder", RUN_COLOR.harder, 2)}
    ${showNegative ? line("negative", "var(--hanko)", 3.5) : ""}
    <text x="${(L + W - R) / 2}" y="${H - 10}" font-size="11" text-anchor="middle" fill="var(--ink-soft)">止めてからの時間（止めた時の差で割った表示）</text>
  </svg>`;
}

// ---------- 細胞の膜の図（主役）：神経細胞の全体像 → 膜の一部分の拡大 → 電極と電位 ----------
// 模型は正味の電流を一つだけ扱う（受け身の膜）。イオンを一粒ずつ動かしたり、種類別に描いたりはしない。

/** 膜の状態（時刻 t は電流を入れ始めてから。0〜SECONDS は入れている間） */
export function membraneState(perm: Permeability, t: number): { delta: number; leak: number; injecting: boolean; potential: number } {
  const m = withPermeability(BASE_MEMBRANE, perm);
  const tau = m.resistance * m.capacitance;
  const injecting = t < SECONDS;
  const delta = injecting ? CURRENT * m.resistance * (1 - Math.exp(-Math.max(0, t) / tau)) : membraneDeltaAtStop(m, CURRENT, SECONDS) * Math.exp(-(t - SECONDS) / tau);
  return { delta, leak: delta / m.resistance, injecting, potential: m.restPotential + delta };
}

const CHANNELS: Record<Permeability, number> = { harder: 1, same: 2, easier: 4 };

export function membraneSvg(perm: Permeability, t: number | null): string {
  const W = 620;
  const H = 330;
  const s = t === null ? { delta: 0, leak: 0, injecting: false, potential: BASE_MEMBRANE.restPotential } : membraneState(perm, t);
  // 膜の帯（拡大図）
  const MY = 168; // 膜の中心
  const L0 = 170;
  const R0 = 600;
  const n = CHANNELS[perm];
  const chX = Array.from({ length: n }, (_, i) => L0 + 40 + ((R0 - L0 - 80) * (i + 0.5)) / n);
  const lipids: string[] = [];
  for (let x = L0; x <= R0; x += 11) {
    if (chX.some((c) => Math.abs(c - x) < 16)) continue;
    lipids.push(`<circle cx="${x}" cy="${MY - 15}" r="4.5" fill="#f2c27b" stroke="#c99643"/><circle cx="${x}" cy="${MY + 15}" r="4.5" fill="#f2c27b" stroke="#c99643"/>
      <path d="M ${x - 1.5} ${MY - 11} v 9 M ${x + 1.5} ${MY - 11} v 9 M ${x - 1.5} ${MY + 11} v -9 M ${x + 1.5} ${MY + 11} v -9" stroke="#c99643" stroke-width="1"/>`);
  }
  const channels = chX
    .map(
      (x) => `<rect x="${x - 15}" y="${MY - 24}" width="9" height="48" rx="4" fill="var(--relax)" opacity="0.85"/>
      <rect x="${x + 6}" y="${MY - 24}" width="9" height="48" rx="4" fill="var(--relax)" opacity="0.85"/>`,
    )
    .join("");
  // 正味の電流（イオンの移動）：内→外。太さは通り道一本あたりの電流
  const per = s.leak / n;
  const arrows =
    s.leak > 0.01
      ? chX
          .map((x) => {
            const w = 2 + 14 * per;
            return `<line x1="${x}" x2="${x}" y1="${MY + 34}" y2="${MY - 30}" stroke="var(--claude)" stroke-width="${w.toFixed(1)}" stroke-linecap="round" opacity="0.85"/>
              <path d="M ${x - 4 - w / 2} ${MY - 28} L ${x} ${MY - 42} L ${x + 4 + w / 2} ${MY - 28} z" fill="var(--claude)"/>`;
          })
          .join("")
      : "";
  // 電荷：膜の外側に＋、内側に−（基準の電位）。入れた電流で内側に＋がたまる
  const charges: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = L0 + 30 + i * 46;
    charges.push(`<text x="${x}" y="${MY - 34}" font-size="15" font-weight="700" fill="var(--hanko)" text-anchor="middle">＋</text>`);
    charges.push(`<text x="${x}" y="${MY + 46}" font-size="17" font-weight="700" fill="var(--instant)" text-anchor="middle">−</text>`);
  }
  const extra = Math.round(s.delta * 10);
  for (let i = 0; i < extra; i++) charges.push(`<text x="${L0 + 52 + i * 46}" y="${MY + 64}" font-size="15" font-weight="700" fill="var(--claude)" text-anchor="middle">＋</text>`);
  // 細胞の全体像（左上の小図）と拡大枠
  const neuron = `<g>
      <path d="M 52 70 L 18 40 M 52 70 L 30 104 M 64 62 L 70 24 M 80 76 L 150 88" stroke="var(--ink-soft)" stroke-width="4" stroke-linecap="round" fill="none"/>
      <circle cx="58" cy="74" r="20" fill="#f7e3c4" stroke="#c99643" stroke-width="2.5"/>
      <circle cx="58" cy="74" r="7" fill="#c9a3d6"/>
      <rect x="66" y="80" width="16" height="12" fill="none" stroke="var(--claude)" stroke-width="2.5"/>
      <path d="M 82 80 L ${L0} ${MY - 60} M 82 92 L ${L0} ${MY + 80}" stroke="var(--claude)" stroke-width="1.2" stroke-dasharray="4 3"/>
      <text x="14" y="134" font-size="12" fill="var(--ink-soft)">神経細胞（全体像）</text>
      <text x="14" y="150" font-size="12" fill="var(--claude)">枠の中を拡大</text>
    </g>`;
  // 電極と電位計
  const pot = s.potential;
  const meter = `<g>
      <line x1="${R0 - 40}" x2="${R0 - 40}" y1="20" y2="${MY - 40}" stroke="var(--ink)" stroke-width="2"/>
      <line x1="${R0 - 70}" x2="${R0 - 70}" y1="20" y2="${MY + 58}" stroke="var(--ink)" stroke-width="2"/>
      <circle cx="${R0 - 70}" cy="${MY + 60}" r="3.5" fill="var(--ink)"/>
      <rect x="${R0 - 112}" y="2" width="96" height="22" rx="4" fill="var(--ink)"/>
      <text x="${R0 - 64}" y="17" font-size="11.5" font-weight="700" text-anchor="middle" fill="#fff" font-variant-numeric="tabular-nums">膜電位 ${pot.toFixed(2)}</text>
      <line x1="${L0 + 40}" x2="${L0 + 40}" y1="20" y2="${MY + 58}" stroke="${s.injecting && t !== null ? "var(--hanko)" : "var(--ink-soft)"}" stroke-width="2"/>
      <text x="${L0 + 46}" y="16" font-size="11.5" fill="${s.injecting && t !== null ? "var(--hanko)" : "var(--ink-soft)"}">${s.injecting && t !== null ? "電流を入れている" : "電流を入れる電極"}</text>
    </g>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="神経細胞の膜の一部分を拡大した図：膜の内外の電荷、イオンの通り道、膜電位を測る電極">
    <rect x="${L0}" y="40" width="${R0 - L0}" height="${MY - 40 - 24}" fill="#eaf4fb"/>
    <rect x="${L0}" y="${MY + 24}" width="${R0 - L0}" height="${H - 60 - MY - 24}" fill="#f6eefa"/>
    <text x="${L0 + 6}" y="56" font-size="12" fill="var(--ink-soft)">細胞の外</text>
    <text x="${L0 + 6}" y="${H - 66}" font-size="12" fill="var(--ink-soft)">細胞の中</text>
    ${lipids.join("")}${channels}${charges.join("")}${arrows}${meter}${neuron}
    <text x="14" y="${H - 44}" font-size="12" fill="var(--ink)"><tspan fill="#c99643" font-weight="700">黄：膜（脂質の二重の層）</tspan>　<tspan fill="var(--relax)" font-weight="700">緑：イオンの通り道（${n}本）</tspan>　<tspan fill="var(--claude)" font-weight="700">紫の矢印：膜を通る正味の電流</tspan></text>
    <text x="14" y="${H - 26}" font-size="11.5" fill="var(--ink-soft)">＋と−：膜の両側にたまった電荷。紫の＋：入れた電流で中にたまった電荷</text>
    <text x="14" y="${H - 9}" font-size="11.5" fill="var(--ink-soft)">受け身の膜の模型：通りやすさは一定、イオンの種類は区別しない。通り道の本数は模式的な表示</text>
  </svg>`;
}
