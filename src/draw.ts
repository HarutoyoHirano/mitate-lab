// 試験台（素材と押し棒）と、記録のグラフを描く。真のモデルの曲線は描かない。
import { BASE, CANDIDATES, PUSH_SECONDS, RECORD_AT, type CandidateId, type ObservationSpec } from "../server/model/public.js";
import { forceAfterPush } from "../server/model/sls.js";
import type { PublicSessionView } from "./api.js";

export const CAND_COLOR: Record<CandidateId, string> = {
  overall: "var(--overall)",
  instant: "var(--instant)",
  relax: "var(--relax)",
  same: "var(--same)",
};

export const TIME_LABEL: Record<number, string> = { 0: "直後", 0.5: "0.5秒後", 2: "2秒後", 5: "5秒後", 20: "20秒後" };

/** 試験台：同じ見た目の二つの素材と押し棒。press は 0（上）〜1（押し込み） */
export function benchSvg(target: "A" | "B", press: number): string {
  const squish = 0.22 * press;
  const block = (x: number, label: string, active: boolean) => {
    const h = 70 * (1 - squish * (active ? 1 : 0));
    const w = 96 * (1 + squish * 0.35 * (active ? 1 : 0));
    const y = 150 - h;
    const cx = x + 48;
    return `
      <g>
        <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="var(--gel)" stroke="var(--gel-edge)" stroke-width="2"/>
        <path d="M ${cx - w / 2 + 12} ${y + 12} q ${w * 0.25} -6 ${w * 0.45} 0" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.7"/>
        <text x="${cx}" y="176" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)">${label}</text>
      </g>`;
  };
  const ax = target === "A" ? 40 : 184;
  const rodTop = 10;
  // 押し棒の先：押す前は素材の少し上、押し込むと素材の上面と一緒に下がる
  const blockTop = 150 - 70 * (1 - squish);
  const tipBottom = press <= 0 ? 66 : 66 + (blockTop - 66) * Math.min(1, press * 4);
  const y = tipBottom - 8;
  return `
    <svg viewBox="0 0 320 190" role="img" aria-label="試験台：素材Aと素材Bと押し棒">
      <rect x="10" y="150" width="300" height="10" fill="var(--steel)"/>
      ${block(40, "A", target === "A")}
      ${block(184, "B", target === "B")}
      <g>
        <rect x="${ax + 44}" y="${rodTop}" width="8" height="${y - rodTop}" fill="var(--ink-soft)"/>
        <rect x="${ax + 28}" y="${y}" width="40" height="8" rx="2" fill="var(--ink)"/>
      </g>
    </svg>`;
}

interface PanelOpts {
  view: PublicSessionView;
  pushSeconds: number;
  selected: ObservationSpec | null;
  yMin: number;
  yMax: number;
}

function panelSvg(o: PanelOpts): string {
  const W = 200;
  const H = 230;
  const L = 32;
  const R = 6;
  const T = 26;
  const B = 30;
  const xs = (i: number) => L + ((W - L - R) * (i + 0.5)) / RECORD_AT.length;
  const half = (W - L - R) / RECORD_AT.length / 2;
  const ys = (v: number) => T + (H - T - B) * (1 - (v - o.yMin) / (o.yMax - o.yMin));
  const idx = (t: number) => (RECORD_AT as readonly number[]).indexOf(t);
  const ticks: string[] = [];
  const step = o.yMax - o.yMin > 1.5 ? 0.5 : 0.25;
  for (let v = Math.ceil(o.yMin / step) * step; v <= o.yMax + 1e-9; v += step) {
    ticks.push(`<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/>
      <text x="${L - 4}" y="${ys(v) + 4}" font-size="10" text-anchor="end" fill="var(--ink-soft)">${v.toFixed(step < 0.5 ? 2 : 1)}</text>`);
  }
  const xlabels = RECORD_AT.map(
    (t, i) => `<text x="${xs(i)}" y="${H - 12}" font-size="9.5" text-anchor="middle" fill="var(--ink-soft)">${t === 0 ? "直後" : t + "秒"}</text>`,
  ).join("");
  // 基準カードの値（Aの公開値）：短い横線
  const baseMarks = RECORD_AT.map((t, i) => {
    const v = forceAfterPush(BASE, o.pushSeconds, t);
    return `<line x1="${xs(i) - half + 3}" x2="${xs(i) + half - 3}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="3 2"/>`;
  }).join("");
  // 選んだ観察の位置
  let sel = "";
  if (o.selected && o.selected.pushSeconds === o.pushSeconds) {
    const i = idx(o.selected.recordAt);
    sel = `<rect x="${xs(i) - half}" y="${T}" width="${2 * half}" height="${H - T - B}" fill="var(--claude-wash)" opacity="0.8"/>`;
  }
  // 予測の帯（保存した予想の押し方・時刻について）
  let bands = "";
  const pend = o.view.pendingPrediction;
  if (pend && pend.pushSeconds === o.pushSeconds) {
    const i = idx(pend.recordAt);
    const n = o.view.predictionBands.length;
    bands = o.view.predictionBands
      .map((b, k) => {
        const x = xs(i) - half + 2 + ((2 * half - 4) * (k + 0.5)) / Math.max(n, 1) - 3;
        const y1 = ys(Math.min(b.high, o.yMax));
        const y2 = ys(Math.max(b.low, o.yMin));
        return `<rect x="${x}" y="${y1}" width="6" height="${Math.max(2, y2 - y1)}" fill="${CAND_COLOR[b.id]}" opacity="0.55"><title>${CANDIDATES[b.id].label}なら、この範囲</title></rect>`;
      })
      .join("");
  }
  // Aの測定：白抜きの丸
  const aPts = o.view.measuredA
    .filter((m) => m.pushSeconds === o.pushSeconds)
    .map((m) => `<circle cx="${xs(idx(m.recordAt)) - 6}" cy="${ys(m.force)}" r="4" fill="#fff" stroke="var(--ink)" stroke-width="2"><title>Aの記録</title></circle>`)
    .join("");
  // Bの記録：塗りつぶした四角＋誤差のひげ
  const bPts = o.view.records
    .filter((r) => r.pushSeconds === o.pushSeconds)
    .map((r) => {
      const x = xs(idx(r.recordAt)) + 6;
      const e = o.view.error;
      return `<g><line x1="${x}" x2="${x}" y1="${ys(r.force + e)}" y2="${ys(r.force - e)}" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="${x - 4}" y="${ys(r.force) - 4}" width="8" height="8" fill="var(--ink)"><title>Bの記録 ${r.id}</title></rect></g>`;
    })
    .join("");
  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.pushSeconds}秒かけて押したときの記録">
      <text x="${L}" y="16" font-size="12" font-weight="700" fill="var(--ink)">${o.pushSeconds}秒かけて押す</text>
      ${ticks.join("")}
      <line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--ink-soft)"/>
      ${sel}${baseMarks}${bands}${aPts}${bPts}${xlabels}
    </svg>`;
}

export function graphHtml(view: PublicSessionView, selected: ObservationSpec | null): string {
  const values: number[] = [];
  for (const T of PUSH_SECONDS) for (const t of RECORD_AT) values.push(forceAfterPush(BASE, T, t));
  for (const r of view.records) values.push(r.force + view.error);
  for (const m of view.measuredA) values.push(m.force);
  for (const b of view.predictionBands) values.push(Math.min(b.high, 4));
  const yMax = Math.ceil((Math.max(...values) + 0.1) * 4) / 4;
  const yMin = 0.75;
  return `
    <div class="panels">${PUSH_SECONDS.map((T) => panelSvg({ view, pushSeconds: T, selected, yMin, yMax })).join("")}</div>
    <div class="legend">
      <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="3 2"/></svg>Aの基準カードの値</span>
      <span><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="#fff" stroke="var(--ink)" stroke-width="2"/></svg>Aの記録</span>
      <span><svg width="12" height="12"><rect x="1.5" y="1.5" width="9" height="9" fill="var(--ink)"/></svg>Bの記録（縦線は誤差の範囲 ±${view.error}）</span>
      <span>縦の色帯：予想を保存した観察で、候補ごとに予測される範囲</span>
    </div>
    <p class="note">点はどれも、別々に押して記録した一点です。点どうしを線で結んでいません。横軸は押し終わってからの時間です。</p>`;
}
