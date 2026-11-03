// 第2幕：見方を変える。隠れた答えは持たない（公開の式で計算するだけ）。
import {
  BASE_MEMBRANE,
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

/** 回路図。lens が membrane のとき、並列部分に細胞の膜の札を付け、電池（基準の電位）を足す */
export function circuitSvg(lens: Lens): string {
  const m = lens === "membrane";
  const lab = (x: number, y: number, a: string, b: string) =>
    `<text x="${x}" y="${y}" font-size="13" fill="var(--ink)" class="tag-swap">${m ? b : a}</text>`;
  return `
  <svg viewBox="0 0 520 250" role="img" aria-label="${m ? "細胞の膜の等価回路" : "素材と同じ形の式で書ける回路"}">
    <!-- 電流の入口 -->
    <circle cx="50" cy="125" r="20" fill="#fff" stroke="var(--ink)" stroke-width="2"/>
    <path d="M50 137 V113 M44 119 L50 112 L56 119" stroke="var(--ink)" stroke-width="2" fill="none"/>
    ${lab(80, 130, "一定の電流を入れる（＝押す速さ）", "電流を入れる")}
    <path d="M50 105 V40 H${m ? 300 : 160}" stroke="var(--ink)" stroke-width="2" fill="none"/>
    <path d="M50 145 V210 H440 V40 H${m ? 440 : 230}" stroke="var(--ink)" stroke-width="2" fill="none"/>
    ${
      m
        ? ""
        : `<!-- C∞（待ったあとも残るかたさ） -->
    <path d="M160 28 V52 M170 28 V52" stroke="var(--ink)" stroke-width="3"/>
    <path d="M170 40 H300" stroke="var(--ink)" stroke-width="2"/>
    <text x="128" y="20" font-size="13" fill="var(--overall)">コンデンサ C∞（待ったあとも残るかたさ）</text>`
    }
    <!-- 並列部分（上乗せ分）：ここが細胞の膜と同じ形 -->
    <rect x="290" y="60" width="160" height="130" rx="10" fill="${m ? "var(--claude-wash)" : "none"}" stroke="${m ? "var(--claude)" : "var(--line)"}" stroke-dasharray="${m ? "0" : "5 4"}"/>
    <path d="M300 40 V80 M440 40 V80" stroke="var(--ink)" stroke-width="2"/>
    <path d="M300 80 H330 M410 80 H440" stroke="var(--ink)" stroke-width="2"/>
    <path d="M330 68 V92 M340 68 V92" stroke="var(--ink)" stroke-width="3"/>
    <path d="M340 80 H410" stroke="var(--ink)" stroke-width="2"/>
    <path d="M300 80 V160 H330 l5 -8 l10 16 l10 -16 l10 16 l10 -16 l10 16 l5 -8 H440 V80" stroke="var(--ink)" stroke-width="2" fill="none"/>
    ${m ? `<path d="M440 160 V210" stroke="var(--ink)" stroke-width="2"/><path d="M455 176 H475 M460 186 H470" stroke="var(--ink)" stroke-width="3"/><text x="452" y="206" font-size="12" fill="var(--ink)">電池</text>` : ""}
    ${lab(310, 110, "コンデンサ C1（上乗せのかたさ）", "膜（電荷をためる）")}
    ${lab(306, 182, "抵抗 R（ねばり）", "イオンの通りにくさ")}
    ${m ? `<text x="60" y="238" font-size="12" fill="var(--ink-soft)">電池＝イオンの濃さの差がつくる基準の電位</text>` : `<text x="60" y="238" font-size="12" fill="var(--ink-soft)">点線の中＝上乗せ分（時定数＝R×C1）</text>`}
  </svg>`;
}

export interface Act2Run {
  readonly perm: Permeability;
  readonly half: number;
  readonly deltaAtStop: number;
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
        const halfX = offset + xs(membraneHalfReturnTime(m));
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
