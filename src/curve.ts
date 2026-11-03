// 曲線の描画：押している間と、押し終わってから20秒後までの押し返し。
// Aは基準カードの値なので真の線を描いてよい。Bは測った点（誤差つき）とそれを結ぶ線だけ。
import type { CurvePoint } from "../server/model/generator.js";
import { BASE, RECORD_AT, type MaterialParams } from "../server/model/public.js";
import { forceAfterPush, forceDuringPush } from "../server/model/sls.js";

export const HOLD_MAX = 20;

export interface Frame {
  readonly W: number;
  readonly H: number;
  readonly L: number;
  readonly R: number;
  readonly T: number;
  readonly B: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly pushSeconds: number;
}

export function xOf(f: Frame, t: number): number {
  const inner = f.W - f.L - f.R;
  const pushW = inner * 0.16;
  if (t <= f.pushSeconds) return f.L + pushW * (t / f.pushSeconds);
  return f.L + pushW + (inner - pushW) * Math.min(1, (t - f.pushSeconds) / HOLD_MAX);
}

export function yOf(f: Frame, v: number): number {
  return f.T + (f.H - f.T - f.B) * (1 - (Math.min(f.yMax, Math.max(f.yMin, v)) - f.yMin) / (f.yMax - f.yMin));
}

/** 真の曲線（公開の値：見本A、または素材をつくる挑戦の自作素材） */
export function trueCurve(p: MaterialParams, pushSeconds: number): CurvePoint[] {
  const pts: CurvePoint[] = [{ t: 0, force: 0 }];
  for (let k = 1; k <= 20; k++) pts.push({ t: (pushSeconds * k) / 20, force: forceDuringPush(p, pushSeconds, (pushSeconds * k) / 20) });
  for (let k = 1; k <= 80; k++) {
    const h = (HOLD_MAX * k) / 80;
    pts.push({ t: pushSeconds + h, force: forceAfterPush(p, pushSeconds, h) });
  }
  return pts;
}

function axes(f: Frame, big: boolean): string {
  const fs = big ? 12 : 10;
  const step = f.yMax - f.yMin > 1.6 ? 0.5 : 0.25;
  const lines: string[] = [];
  for (let v = Math.ceil(f.yMin / step) * step; v <= f.yMax + 1e-9; v += step) {
    lines.push(`<line x1="${f.L}" x2="${f.W - f.R}" y1="${yOf(f, v)}" y2="${yOf(f, v)}" stroke="var(--grid)"/>`);
    if (big) lines.push(`<text x="${f.L - 6}" y="${yOf(f, v) + 4}" font-size="${fs}" text-anchor="end" fill="var(--ink-soft)">${v.toFixed(2)}</text>`);
  }
  const x0 = xOf(f, f.pushSeconds);
  const ticks =
    [0, 5, 10, 15, 20]
      .map((h) => `<text x="${xOf(f, f.pushSeconds + h)}" y="${f.H - (big ? 10 : 6)}" font-size="${fs}" text-anchor="middle" fill="var(--ink-soft)">${h}</text>`)
      .join("") +
    `<text x="${f.W - f.R}" y="${f.T + 14}" font-size="${fs}" text-anchor="end" fill="var(--ink-soft)">押し終わってからの秒数 →</text>`;
  return `${lines.join("")}
    <rect x="${f.L}" y="${f.T}" width="${x0 - f.L}" height="${f.H - f.T - f.B}" fill="var(--claude-wash)" opacity="0.6"/>
    <text x="${(f.L + x0) / 2}" y="${f.T + 14}" font-size="${fs}" text-anchor="middle" fill="var(--claude)" font-weight="700">押している間</text>
    ${big ? `<text x="${(f.L + x0) / 2}" y="${f.T + 28}" font-size="${fs - 1}" text-anchor="middle" fill="var(--claude)">${f.pushSeconds}秒・横に拡大</text>` : ""}
    <line x1="${f.L}" x2="${f.L}" y1="${f.T}" y2="${f.H - f.B}" stroke="var(--ink-soft)"/>
    <line x1="${f.L}" x2="${f.W - f.R}" y1="${f.H - f.B}" y2="${f.H - f.B}" stroke="var(--ink-soft)"/>
    ${big ? ticks : ""}`;
}

function poly(f: Frame, pts: readonly CurvePoint[], until: number): string {
  return pts
    .filter((p) => p.t <= until + 1e-9)
    .map((p) => `${xOf(f, p.t).toFixed(1)},${yOf(f, p.force).toFixed(1)}`)
    .join(" ");
}

export interface CurveGraphOpts {
  readonly pushSeconds: number;
  readonly b: readonly CurvePoint[] | null;
  readonly until: number;
  readonly yMax: number;
  readonly big: boolean;
  readonly error: number;
  readonly title?: string;
  /** 答え合わせ：開示した値で計算したBの線（終了後だけ） */
  readonly bTrue?: MaterialParams;
  /** Claudeが参照した記録の時刻（押し終わりからの秒数）。該当する点を強調する */
  readonly highlight?: readonly number[];
  /** 「この説明で重ねてみる」：候補の予測線（押し終わりの測定値に合わせたもの） */
  readonly overlay?: { readonly points: readonly CurvePoint[]; readonly color: string };
}

/** 判定（比較器）に使う記録か：押し終わりからの秒数が 0・0.5・2・5・20 */
function isJudged(t: number, pushSeconds: number): boolean {
  return t >= pushSeconds - 1e-9 && (RECORD_AT as readonly number[]).some((h) => Math.abs(t - pushSeconds - h) < 1e-9);
}

/** 測った曲線：A（基準の真の線、点線）とB（測った点と線） */
export function curveGraphSvg(o: CurveGraphOpts): string {
  const f: Frame = o.big
    ? { W: 600, H: 300, L: 46, R: 10, T: 10, B: 30, yMin: 0, yMax: o.yMax, pushSeconds: o.pushSeconds }
    : { W: 220, H: 120, L: 10, R: 6, T: 20, B: 8, yMin: 0, yMax: o.yMax, pushSeconds: o.pushSeconds };
  const a = trueCurve(BASE, o.pushSeconds);
  const until = o.until;
  const bPts = o.b ? o.b.filter((p) => p.t <= until + 1e-9) : [];
  const bLine = o.b ? `<polyline points="${poly(f, [{ t: 0, force: 0 }, ...o.b], until)}" fill="none" stroke="var(--claude)" stroke-width="${o.big ? 3 : 2}"/>` : "";
  const hl = (t: number) => (o.highlight ?? []).some((h) => Math.abs(t - o.pushSeconds - h) < 1e-9);
  const bDots = o.big
    ? bPts
        .map((p) => {
          const x = xOf(f, p.t);
          const y = yOf(f, p.force);
          if (!isJudged(p.t, o.pushSeconds)) return `<circle cx="${x}" cy="${y}" r="2.2" fill="var(--claude)" opacity="0.45"/>`;
          return `<line x1="${x}" x2="${x}" y1="${yOf(f, p.force + o.error)}" y2="${yOf(f, p.force - o.error)}" stroke="var(--claude)" stroke-width="2" opacity="0.7"/>
            <circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="var(--claude)" stroke-width="3"/>
            ${hl(p.t) ? `<circle class="hl" cx="${x}" cy="${y}" r="13" fill="none" stroke="var(--hanko)" stroke-width="3"/>` : ""}`;
        })
        .join("")
    : "";
  const bTrueLine = o.bTrue ? `<polyline points="${poly(f, trueCurve(o.bTrue, o.pushSeconds), until)}" fill="none" stroke="var(--relax)" stroke-width="2.5" stroke-dasharray="2 4"/>` : "";
  const head = bPts.length && until < o.pushSeconds + HOLD_MAX ? bPts[bPts.length - 1]! : null;
  return `<svg viewBox="0 0 ${f.W} ${f.H}" class="${o.big ? "curve-big" : "curve-mini"}" role="img" aria-label="押し返しの変化：見本Aと試料B">
    ${o.title ? `<text x="${f.L}" y="13" font-size="11" font-weight="700" fill="var(--ink)">${o.title}</text>` : ""}
    ${axes(f, o.big)}
    <polyline points="${poly(f, a, until)}" fill="none" stroke="var(--ink-soft)" stroke-width="${o.big ? 2.5 : 1.5}" stroke-dasharray="6 4"/>
    ${o.overlay ? `<polyline points="${poly(f, o.overlay.points, until)}" fill="none" stroke="${o.overlay.color}" stroke-width="3.5" stroke-dasharray="10 5" opacity="0.95"/>` : ""}
    ${bTrueLine}${bLine}${bDots}
    ${head && o.big ? `<circle cx="${xOf(f, head.t)}" cy="${yOf(f, head.force)}" r="7" fill="none" stroke="var(--claude)" stroke-width="2"/>` : ""}
  </svg>`;
}

/** 予想の絵：押し終わりの高さが、Aの線（点線）と比べて ほぼ同じ／高い／低い／まだ分からない。押し終わりに丸印 */
export function shapeThumb(kind: "same" | "higher" | "lower" | "unknown"): string {
  const a = "M6 46 L22 14 C 34 30, 50 38, 90 40";
  if (kind === "unknown")
    return `<svg viewBox="0 0 96 50" width="96" height="50" aria-hidden="true">
    <path d="${a}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5 3"/>
    <text x="40" y="22" font-size="20" font-weight="700" fill="var(--claude)" text-anchor="middle">?</text></svg>`;
  const peak = kind === "higher" ? 4 : kind === "lower" ? 26 : 14;
  const b = kind === "same" ? "M6 46 L22 14 C 34 31, 50 38, 90 40" : kind === "higher" ? "M6 46 L22 4 C 36 12, 52 30, 90 40" : "M6 46 L22 26 C 30 36, 44 40, 90 40";
  return `<svg viewBox="0 0 96 50" width="96" height="50" aria-hidden="true">
    <path d="${a}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5 3"/>
    <path d="${b}" fill="none" stroke="var(--claude)" stroke-width="3"/>
    <circle cx="22" cy="${peak}" r="4.5" fill="#fff" stroke="var(--claude)" stroke-width="2.5"/>
  </svg>`;
}

/** 素材をつくる挑戦：見本と自作素材の真の曲線、検査の時刻に印 */
/** 素材をつくる挑戦の二つのグラフで共通に使う縦軸の上限 */
export function makeYMax(p: MaterialParams): number {
  const peak = Math.max(...[0.2, 1].flatMap((T) => [forceDuringPush(p, T, T), forceDuringPush(BASE, T, T)]));
  return Math.max(2.5, Math.ceil((peak + 0.3) * 2) / 2);
}

export function makeGraphSvg(p: MaterialParams, pushSeconds: number, testAt: number, title: string, ok: boolean, yMax: number): string {
  const f: Frame = { W: 360, H: 220, L: 40, R: 10, T: 26, B: 26, yMin: 0, yMax, pushSeconds };
  const a = trueCurve(BASE, pushSeconds);
  const m = trueCurve(p, pushSeconds);
  const tx = xOf(f, pushSeconds + testAt);
  const fa = forceAfterPush(BASE, pushSeconds, testAt);
  const fm = forceAfterPush(p, pushSeconds, testAt);
  return `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${title}">
    <text x="${f.L}" y="16" font-size="13" font-weight="700" fill="var(--ink)">${title}</text>
    ${axes(f, true)}
    <polyline points="${poly(f, a, 99)}" fill="none" stroke="var(--ink-soft)" stroke-width="2.5" stroke-dasharray="6 4"/>
    <polyline points="${poly(f, m, 99)}" fill="none" stroke="var(--relax)" stroke-width="3"/>
    <line x1="${tx}" x2="${tx}" y1="${f.T}" y2="${f.H - f.B}" stroke="${ok ? "var(--ok)" : "var(--hanko)"}" stroke-width="2" stroke-dasharray="3 3"/>
    <circle cx="${tx}" cy="${yOf(f, fa)}" r="5" fill="#fff" stroke="var(--ink-soft)" stroke-width="2"/>
    <circle cx="${tx}" cy="${yOf(f, fm)}" r="6" fill="var(--relax)"/>
  </svg>`;
}
