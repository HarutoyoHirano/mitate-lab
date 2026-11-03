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
export function carrySvg(truth: MaterialParams): string {
  const T = 1;
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
export function act2GraphSvg(runs: readonly Act2Run[]): string {
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
      ${half}${lines}
      <text x="${offset + W / 4 + L / 2}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--ink-soft)">止めてからの時間</text>`;
  };
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
