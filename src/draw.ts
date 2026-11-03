// 試験台（素材と押し棒）と、記録のグラフを描く。真のモデルの曲線は描かない。
import { BASE, PUSH_SECONDS, RECORD_AT, type CandidateId, type ObservationSpec } from "../server/model/public.js";
import { forceAfterPush } from "../server/model/sls.js";
import type { PublicSessionView } from "./api.js";

export const CAND_COLOR: Record<CandidateId, string> = {
  overall: "var(--overall)",
  instant: "var(--instant)",
  relax: "var(--relax)",
  same: "var(--same)",
};

export const TIME_LABEL: Record<number, string> = { 0: "押し終わった瞬間", 0.5: "0.5秒後", 2: "2秒後", 5: "5秒後", 20: "20秒後" };
export const TIME_SHORT: Record<number, string> = { 0: "瞬間", 0.5: "0.5秒後", 2: "2秒後", 5: "5秒後", 20: "20秒後" };
export const SPEED_LABEL: Record<number, string> = { 0.2: "すばやく", 1: "ふつう", 5: "ゆっくり" };

export function specLabel(s: ObservationSpec): string {
  return `${SPEED_LABEL[s.pushSeconds]}（${s.pushSeconds}秒）押して、${TIME_LABEL[s.recordAt]}`;
}

/** 試験台。target の素材を押し棒が押す（both は導入の場面で二本同時）。press は 0〜1 */
export function benchSvg(
  target: "A" | "B" | "both",
  press: number,
  flash = false,
  arrows: { a: number; b: number } | null = null,
): string {
  const squish = 0.24 * press;
  const pressed = (k: "A" | "B") => target === "both" || target === k;
  const block = (cx: number, label: string, active: boolean) => {
    const s = active ? squish : 0;
    const h = 84 * (1 - s);
    const w = 118 * (1 + s * 0.4);
    const y = 178 - h;
    return `
      <g>
        <ellipse cx="${cx}" cy="180" rx="${w / 2 + 6}" ry="5" fill="#000" opacity="0.08"/>
        <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="18" fill="var(--gel)" stroke="var(--gel-edge)" stroke-width="2.5"/>
        <path d="M ${cx - w / 2 + 16} ${y + 15} q ${w * 0.22} -7 ${w * 0.42} 0" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.75"/>
        <circle cx="${cx + w / 2 - 22}" cy="${y + h - 20}" r="4" fill="#fff" opacity="0.5"/>
        <g transform="translate(${cx - 16}, 196)">
          <rect width="32" height="24" rx="5" fill="var(--ink)"/>
          <text x="16" y="17" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">${label}</text>
        </g>
      </g>`;
  };
  const rod = (cx: number, active: boolean) => {
    const top = 178 - 84 * (1 - (active ? squish : 0));
    const tip = active && press > 0 ? 70 + (top - 70) * Math.min(1, press * 3) : 70;
    return `<g><rect x="${cx - 5}" y="8" width="10" height="${tip - 16}" fill="var(--ink-soft)"/>
      <rect x="${cx - 26}" y="${tip - 10}" width="52" height="10" rx="3" fill="var(--ink)"/></g>`;
  };
  const rods = target === "both" ? rod(90, true) + rod(250, true) : rod(target === "A" ? 90 : 250, true);
  return `
    <svg viewBox="0 0 340 230" overflow="visible" role="img" aria-label="試験台：見た目がそっくりな素材AとB">
      <rect x="12" y="178" width="316" height="12" rx="2" fill="var(--steel)"/>
      ${block(90, "A", pressed("A"))}
      ${block(250, "B", pressed("B"))}
      ${rods}
      ${arrows ? pushBackArrow(90, arrows.a, true) + pushBackArrow(250, arrows.b, false) : ""}
      ${flash ? `<rect class="flash" x="0" y="0" width="340" height="230" fill="#fff"/>` : ""}
    </svg>`;
}

/** 押し返しの矢印（長さが力に比例）。A は基準カードの値（点線） */
function pushBackArrow(cx: number, force: number, isA: boolean): string {
  const x = cx + 72;
  const base = 176;
  const len = Math.min(150, force * 52);
  const top = base - len;
  const color = isA ? "var(--ink-soft)" : "var(--claude)";
  return `<g>
    <line x1="${x}" x2="${x}" y1="${base}" y2="${top + 10}" stroke="${color}" stroke-width="${isA ? 3 : 5}" ${isA ? 'stroke-dasharray="5 4"' : ""}/>
    <path d="M ${x - 9} ${top + 12} L ${x} ${top - 2} L ${x + 9} ${top + 12} z" fill="${color}"/>
    <text x="${x}" y="${top - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="${color}">${force.toFixed(2)}</text>
  </g>`;
}

interface PanelOpts {
  view: PublicSessionView;
  pushSeconds: number;
  selected: ObservationSpec | null;
  pin: number | null;
  yMin: number;
  yMax: number;
  big: boolean;
  freshId: string | null;
}

function panelSvg(o: PanelOpts): string {
  const W = o.big ? 560 : 200;
  const H = o.big ? 300 : 150;
  const L = o.big ? 46 : 28;
  const R = 8;
  const T = o.big ? 14 : 22;
  const B = o.big ? 34 : 22;
  const n = RECORD_AT.length;
  const colW = (W - L - R) / n;
  const xs = (i: number) => L + colW * (i + 0.5);
  const ys = (v: number) => T + (H - T - B) * (1 - (v - o.yMin) / (o.yMax - o.yMin));
  const idx = (t: number) => (RECORD_AT as readonly number[]).indexOf(t);
  const fs = o.big ? 12 : 9;
  const step = o.yMax - o.yMin > 1.5 ? 0.5 : 0.25;
  const ticks: string[] = [];
  for (let v = Math.ceil(o.yMin / step) * step; v <= o.yMax + 1e-9; v += step) {
    ticks.push(`<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/>`);
    if (o.big) ticks.push(`<text x="${L - 6}" y="${ys(v) + 4}" font-size="${fs}" text-anchor="end" fill="var(--ink-soft)">${v.toFixed(2)}</text>`);
  }
  // 列（クリックすると、その時刻を選んで予想ピンを置ける）
  const cols = RECORD_AT.map((t, i) => {
    const isSel = o.selected && o.selected.pushSeconds === o.pushSeconds && o.selected.recordAt === t;
    return `<rect class="col${isSel ? " sel" : ""}" data-col="${t}" x="${L + colW * i + 1}" y="${T}" width="${colW - 2}" height="${H - T - B}" rx="6"/>`;
  }).join("");
  const xlabels = RECORD_AT.map(
    (t, i) => `<text x="${xs(i)}" y="${H - (o.big ? 12 : 7)}" font-size="${fs}" text-anchor="middle" fill="var(--ink-soft)">${o.big ? TIME_SHORT[t] : t === 0 ? "瞬間" : `${t}`}</text>`,
  ).join("");
  const half = colW / 2;
  // Aの基準カードの値（公開）：点線
  const baseMarks = RECORD_AT.map((t, i) => {
    const v = forceAfterPush(BASE, o.pushSeconds, t);
    return `<line x1="${xs(i) - half + 6}" x2="${xs(i) + half - 6}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="4 3"/>`;
  }).join("");
  // 予測の帯（保存した予想について、候補ごと）
  let bands = "";
  const pend = o.view.pendingPrediction;
  if (o.big && pend && pend.pushSeconds === o.pushSeconds) {
    const i = idx(pend.recordAt);
    const nb = o.view.predictionBands.length;
    bands = o.view.predictionBands
      .map((b, k) => {
        const x = xs(i) + half - 10 - (nb - k) * 8;
        const y1 = ys(Math.min(b.high, o.yMax));
        const y2 = ys(Math.max(b.low, o.yMin));
        return `<rect x="${x}" y="${y1}" width="6" height="${Math.max(2, y2 - y1)}" rx="2" fill="${CAND_COLOR[b.id]}" opacity="0.6"/>`;
      })
      .join("");
  }
  // 予想ピン
  let pin = "";
  if (o.big && o.pin !== null && o.selected && o.selected.pushSeconds === o.pushSeconds) {
    const x = xs(idx(o.selected.recordAt)) - 18;
    const y = ys(Math.max(o.yMin, Math.min(o.yMax, o.pin)));
    pin = `<g class="pin"><line x1="${x - 14}" x2="${x + 14}" y1="${y}" y2="${y}" stroke="var(--claude)" stroke-width="2.5"/>
      <path d="M ${x} ${y} l -7 -16 a 8 8 0 1 1 14 0 z" fill="var(--claude)"/><circle cx="${x}" cy="${y - 19}" r="3" fill="#fff"/>
      <text x="${x + 18}" y="${y - 6}" font-size="12" fill="var(--claude)" font-weight="700">予想</text></g>`;
  }
  const aPts = o.view.measuredA
    .filter((m) => m.pushSeconds === o.pushSeconds)
    .map((m) => `<circle cx="${xs(idx(m.recordAt)) - (o.big ? 10 : 6)}" cy="${ys(m.force)}" r="${o.big ? 5 : 3.5}" fill="#fff" stroke="var(--ink)" stroke-width="2"/>`)
    .join("");
  const bPts = o.view.records
    .filter((r) => r.pushSeconds === o.pushSeconds)
    .map((r) => {
      const x = xs(idx(r.recordAt)) + (o.big ? 10 : 6);
      const e = o.view.error;
      const s = o.big ? 10 : 7;
      return `<g class="${r.id === o.freshId ? "pop" : ""}" style="transform-origin:${x}px ${ys(r.force)}px">
        <line x1="${x}" x2="${x}" y1="${ys(r.force + e)}" y2="${ys(r.force - e)}" stroke="var(--ink)" stroke-width="2"/>
        <rect x="${x - s / 2}" y="${ys(r.force) - s / 2}" width="${s}" height="${s}" fill="var(--ink)"/></g>`;
    })
    .join("");
  const title = o.big ? "" : `<text x="${L}" y="14" font-size="11" font-weight="700" fill="var(--ink)">${SPEED_LABEL[o.pushSeconds]}（${o.pushSeconds}秒）</text>`;
  return `
    <svg viewBox="0 0 ${W} ${H}" class="${o.big ? "big-graph" : "mini-graph"}" data-push="${o.pushSeconds}"
      data-ymin="${o.yMin}" data-ymax="${o.yMax}" data-top="${T}" data-bottom="${H - B}" data-h="${H}"
      role="img" aria-label="${SPEED_LABEL[o.pushSeconds]}押したときの記録">
      ${title}${ticks.join("")}${o.big ? cols : ""}
      <line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--ink-soft)"/>
      ${baseMarks}${bands}${aPts}${bPts}${pin}${xlabels}
    </svg>`;
}

export function yRange(view: PublicSessionView): { yMin: number; yMax: number } {
  const values: number[] = [];
  for (const T of PUSH_SECONDS) for (const t of RECORD_AT) values.push(forceAfterPush(BASE, T, t));
  for (const r of view.records) values.push(r.force + view.error);
  for (const m of view.measuredA) values.push(m.force);
  const yMax = Math.min(3.5, Math.ceil((Math.max(...values) + 0.25) * 4) / 4);
  return { yMin: 0.75, yMax };
}

export function graphHtml(view: PublicSessionView, selected: ObservationSpec, pin: number | null, freshId: string | null): string {
  const { yMin, yMax } = yRange(view);
  const big = panelSvg({ view, pushSeconds: selected.pushSeconds, selected, pin, yMin, yMax, big: true, freshId });
  const minis = PUSH_SECONDS.map((T) => `<button class="mini ${T === selected.pushSeconds ? "on" : ""}" data-set="push" data-val="${T}" aria-label="${SPEED_LABEL[T]}押した記録を大きく見る">${panelSvg({ view, pushSeconds: T, selected, pin: null, yMin, yMax, big: false, freshId })}</button>`).join("");
  return `
    <div class="big-wrap">${big}</div>
    <div class="legend">
      <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="4 3"/></svg>Aの基準カードの値</span>
      <span><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="#fff" stroke="var(--ink)" stroke-width="2"/></svg>Aの記録</span>
      <span><svg width="12" height="14"><line x1="6" x2="6" y1="0" y2="14" stroke="var(--ink)" stroke-width="2"/><rect x="1.5" y="2.5" width="9" height="9" fill="var(--ink)"/></svg>Bの記録（縦線は誤差 ±${view.error}）</span>
      <span><svg width="10" height="14"><rect x="2" y="0" width="6" height="14" rx="2" fill="var(--relax)" opacity="0.6"/></svg>候補ごとの予測の範囲</span>
    </div>
    <div class="minis">${minis}</div>`;
}

/** 解説：Bの5時刻（1秒で押したとき）とAの基準値 */
export function revealSvg(points: readonly { recordAt: number; force: number }[]): string {
  const W = 520;
  const H = 240;
  const L = 46;
  const R = 10;
  const T = 16;
  const B = 34;
  const vals = [...points.map((p) => p.force), ...RECORD_AT.map((t) => forceAfterPush(BASE, 1, t))];
  const yMin = 0.75;
  const yMax = Math.ceil((Math.max(...vals) + 0.2) * 4) / 4;
  const colW = (W - L - R) / RECORD_AT.length;
  const xs = (t: number) => L + colW * ((RECORD_AT as readonly number[]).indexOf(t) + 0.5);
  const ys = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
  const a = RECORD_AT.map((t) => `${xs(t)},${ys(forceAfterPush(BASE, 1, t))}`).join(" ");
  const b = points.map((p) => `${xs(p.recordAt)},${ys(p.force)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="答え合わせ：ふつうに押したときのAとB">
    ${[1, 1.5, 2, 2.5, 3].filter((v) => v <= yMax).map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${ys(v) + 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">${v.toFixed(1)}</text>`).join("")}
    <polyline points="${a}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5 4"/>
    <polyline points="${b}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>
    ${points.map((p) => `<rect x="${xs(p.recordAt) - 5}" y="${ys(p.force) - 5}" width="10" height="10" fill="var(--ink)"/>`).join("")}
    ${RECORD_AT.map((t) => `<text x="${xs(t)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--ink-soft)">${TIME_SHORT[t]}</text>`).join("")}
    <text x="${W - R}" y="${T + 10}" font-size="12" text-anchor="end" fill="var(--ink-soft)">点線：A　実線：B（終了後にだけ見せる、5時刻まとめた記録）</text>
  </svg>`;
}
