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

/**
 * 試験機。ゲルのような軟らかい仮想の試験片を、押し板で押し込み、深さを保って力センサで押し返す力を測る。
 * target の試験片を押す（both は二台同時）。press は 0〜1（押し込みの進み具合。1で所定の深さに保持）。
 * 押し板は最初から試験片に触れていて、押し込む深さは時間に比例する（モデルと同じ一定の速さ）。
 */
export function benchSvg(
  target: "A" | "B" | "both",
  press: number,
  flash = false,
  arrows: { a: number; b: number } | null = null,
  /** 離した後：押し板を上げ、各試験片のへこみ（深さ1に対する割合）を描く */
  released: { a: number; b: number } | null = null,
): string {
  const pressed = (k: "A" | "B") => target === "both" || target === k;
  const BASE_Y = 210;
  const H0 = 78; // 試験片の元の高さ
  const DEPTH_PX = 20; // 押し込む深さ（図の上）
  const station = (x0: number, label: "A" | "B", active: boolean, force: number) => {
    const dent = released ? Math.max(0, label === "A" ? released.a : released.b) : null;
    const p = dent !== null ? Math.min(1, dent) : active ? Math.max(0, Math.min(1, press)) : 0;
    const cx = x0 + 90;
    const top = BASE_Y - H0 + DEPTH_PX * p;
    const platenTop = dent !== null ? BASE_Y - H0 - 26 : top;
    const h = BASE_Y - top;
    const w = 96 * (1 + 0.16 * p); // 押されると少し横に広がる
    // 試験片の格子（変形を追える印）
    const grid: string[] = [];
    for (let k = 1; k < 4; k++) {
      const y = top + (h * k) / 4;
      grid.push(`<line x1="${cx - w / 2 + 4}" x2="${cx + w / 2 - 4}" y1="${y}" y2="${y}" stroke="var(--gel-edge)" stroke-width="1" opacity="0.55"/>`);
    }
    for (let k = 1; k < 4; k++) {
      const x = cx - w / 2 + (w * k) / 4;
      const bulge = (x - cx) * 0.18 * p;
      grid.push(`<path d="M ${x - bulge * 0.2} ${top + 3} Q ${x + bulge} ${top + h / 2} ${x - bulge * 0.2} ${BASE_Y - 3}" stroke="var(--gel-edge)" stroke-width="1" fill="none" opacity="0.55"/>`);
    }
    const lcd = Number.isFinite(force) ? force.toFixed(2) : "—";
    const arrowLen = Number.isFinite(force) ? Math.min(120, force * 42) : 0;
    return `
      <g>
        <!-- 枠：支柱と上の梁 -->
        <rect x="${x0 + 8}" y="16" width="8" height="${BASE_Y - 16}" rx="2" fill="var(--steel)"/>
        <rect x="${x0 + 164}" y="16" width="8" height="${BASE_Y - 16}" rx="2" fill="var(--steel)"/>
        <rect x="${x0 + 6}" y="14" width="168" height="14" rx="3" fill="var(--ink-soft)"/>
        <!-- 力センサの表示 -->
        <rect x="${cx - 30}" y="0" width="60" height="16" rx="3" fill="var(--ink)"/>
        <text x="${cx}" y="12" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff" font-variant-numeric="tabular-nums">力 ${lcd}</text>
        <!-- 駆動軸 → 力センサ → 押し板 -->
        <rect x="${cx - 4}" y="28" width="8" height="${platenTop - 28 - 26}" fill="var(--ink-soft)"/>
        <rect x="${cx - 24}" y="${platenTop - 26}" width="48" height="16" rx="3" fill="#fff" stroke="var(--ink)" stroke-width="1.5"/>
        <text x="${cx}" y="${platenTop - 14.5}" text-anchor="middle" font-size="9" fill="var(--ink)">力センサ</text>
        <rect x="${cx - 60}" y="${platenTop - 10}" width="120" height="10" rx="2" fill="var(--ink)"/>
        ${dent !== null ? `<line x1="${cx - 56}" x2="${cx + 56}" y1="${BASE_Y - H0}" y2="${BASE_Y - H0}" stroke="var(--ink-soft)" stroke-width="1" stroke-dasharray="3 3"/><text x="${cx + 58}" y="${BASE_Y - H0 + 3}" font-size="8.5" fill="var(--ink-soft)">元の高さ</text>` : ""}
        <!-- 試験片 -->
        <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="10" fill="var(--gel)" stroke="var(--gel-edge)" stroke-width="2"/>
        ${grid.join("")}
        <path d="M ${cx - w / 2 + 10} ${top + 9} q ${w * 0.2} -4 ${w * 0.38} 0" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.7"/>
        <!-- 深さの目盛り（左の支柱の内側） -->
        <line x1="${x0 + 24}" x2="${x0 + 24}" y1="${BASE_Y - H0 - 6}" y2="${BASE_Y - H0 + DEPTH_PX + 6}" stroke="var(--ink-soft)" stroke-width="1.5"/>
        <line x1="${x0 + 20}" x2="${x0 + 28}" y1="${BASE_Y - H0}" y2="${BASE_Y - H0}" stroke="var(--ink-soft)" stroke-width="1.5"/>
        <line x1="${x0 + 20}" x2="${x0 + 28}" y1="${BASE_Y - H0 + DEPTH_PX}" y2="${BASE_Y - H0 + DEPTH_PX}" stroke="var(--ink-soft)" stroke-width="1.5"/>
        <path d="M ${x0 + 29} ${top} l 7 -4 v 8 z" fill="var(--claude)"/>
        <text x="${x0 + 22}" y="${BASE_Y - H0 - 10}" font-size="9" fill="var(--ink-soft)">深さ</text>
        <!-- 押し返す力の矢印（長さが力に比例） -->
        ${arrowLen ? `<line x1="${x0 + 152}" x2="${x0 + 152}" y1="${BASE_Y - 2}" y2="${BASE_Y - arrowLen + 8}" stroke="${label === "A" ? "var(--ink-soft)" : "var(--claude)"}" stroke-width="4" ${label === "A" ? 'stroke-dasharray="5 4"' : ""}/>
        <path d="M ${x0 + 145} ${BASE_Y - arrowLen + 10} L ${x0 + 152} ${BASE_Y - arrowLen - 2} L ${x0 + 159} ${BASE_Y - arrowLen + 10} z" fill="${label === "A" ? "var(--ink-soft)" : "var(--claude)"}"/>` : ""}
        ${dent === null && active && press >= 1 ? `<text x="${cx}" y="${top + 22}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink)" stroke="var(--gel)" stroke-width="4" paint-order="stroke">深さ：ここで固定</text>` : ""}
        <!-- 支持台と名札 -->
        <rect x="${x0 + 4}" y="${BASE_Y}" width="172" height="10" rx="2" fill="var(--steel)"/>
        <g transform="translate(${cx - 16}, ${BASE_Y + 16})">
          <rect width="32" height="22" rx="5" fill="var(--ink)"/>
          <text x="16" y="16" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${label}</text>
        </g>
      </g>`;
  };
  const fa = arrows ? arrows.a : NaN;
  const fb = arrows ? arrows.b : NaN;
  return `
    <svg viewBox="0 0 360 250" overflow="visible" role="img" aria-label="試験機：ゲルのような軟らかい試験片AとBを押し板で押し込み、深さを保って押し返す力を力センサで測る。右の矢印の長さが押し返す力">
      ${station(0, "A", pressed("A"), released ? NaN : fa)}
      ${station(180, "B", pressed("B"), released ? NaN : fb)}
      ${flash ? `<rect class="flash" x="0" y="0" width="360" height="250" fill="#fff"/>` : ""}
    </svg>`;
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


/** 証拠写真の拡大図：同じ時刻のAとBの試験片の上面を、へこみの目盛りを拡大して並べる */
export function dentCloseupSvg(dentA: number, dentB: number, h: number, frame: boolean): string {
  const W = 300;
  const H = 220;
  const top = 46;
  const scale = 240; // へこみ1あたりの画素（拡大）
  const yOf = (d: number) => top + Math.min(0.62, Math.max(-0.02, d)) * scale;
  const bottom = H - 28;
  const block = (x: number, d: number, color: string, label: string) => `
    <rect x="${x}" y="${yOf(d)}" width="96" height="${Math.max(4, bottom - yOf(d))}" rx="6" fill="var(--gel)" stroke="${color}" stroke-width="2.5"/>
    <text x="${x + 48}" y="${H - 10}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">${label}</text>
    <text x="${x + 48}" y="${Math.min(bottom - 6, yOf(d) + 20)}" text-anchor="middle" font-size="13" font-weight="700" fill="${color}" font-variant-numeric="tabular-nums">${d.toFixed(3)}</text>`;
  const ticks = [0, 0.2, 0.4, 0.6]
    .map((v) => `<line x1="30" x2="36" y1="${yOf(v)}" y2="${yOf(v)}" stroke="var(--ink-soft)"/><text x="27" y="${yOf(v) + 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">${v.toFixed(1)}</text>`)
    .join("");
  const ya = yOf(dentA);
  const yb = yOf(dentB);
  const d = dentB - dentA;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="証拠写真の拡大図：離して${h}秒後のAとBのへこみ">
    ${frame ? `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="10" fill="none" stroke="var(--hanko)" stroke-width="3"/>` : `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="10" fill="none" stroke="var(--line)" stroke-width="1.5"/>`}
    <text x="12" y="22" font-size="13" font-weight="700" fill="var(--ink)">離して ${h.toFixed(1)}秒後のへこみ</text>
    <text x="${W - 12}" y="22" font-size="13" font-weight="700" text-anchor="end" fill="${frame ? "var(--hanko)" : "var(--ink-soft)"}" font-variant-numeric="tabular-nums">差 ${(d >= 0 ? "+" : "−") + Math.abs(d).toFixed(3)}</text>
    <line x1="33" x2="33" y1="${yOf(0)}" y2="${yOf(0.62)}" stroke="var(--ink-soft)"/>${ticks}
    <line x1="40" x2="${W - 8}" y1="${yOf(0)}" y2="${yOf(0)}" stroke="var(--ink-soft)" stroke-dasharray="4 3"/>
    <text x="${W - 10}" y="${yOf(0) - 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">押す前の高さ</text>
    ${block(46, dentA, "var(--ink-soft)", "見本A")}
    ${block(190, dentB, "var(--claude)", "試料B")}
    <line x1="142" x2="186" y1="${ya}" y2="${ya}" stroke="var(--ink-soft)" stroke-dasharray="3 3"/>
    <line x1="166" x2="166" y1="${ya}" y2="${yb}" stroke="var(--hanko)" stroke-width="3"/>
  </svg>`;
}

/** 離した後の戻りのグラフ：Aは基準の線、Bは測った点。いまの時刻と、撮った写真の印 */
export function recoveryGraphSvg(recB: readonly { h: number; dent: number }[], dentA: (h: number) => number, cursor: number, photoHs: readonly number[]): string {
  const W = 340;
  const H = 220;
  const L = 34;
  const R = 10;
  const T = 30;
  const B = 32;
  const tMax = 40;
  const yMax = 0.7;
  const xs = (h: number) => L + ((W - L - R) * h) / tMax;
  const ys = (d: number) => T + (H - T - B) * (Math.min(yMax, Math.max(0, d)) / yMax);
  const aPts: string[] = [];
  for (let i = 0; i <= 160; i++) {
    const h = (tMax * i) / 160;
    aPts.push(`${xs(h).toFixed(1)},${ys(dentA(h)).toFixed(1)}`);
  }
  const bLine = recB.map((p) => `${xs(p.h).toFixed(1)},${ys(p.dent).toFixed(1)}`).join(" ");
  const grid = [0, 0.2, 0.4, 0.6].map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 4}" y="${ys(v) + 4}" font-size="11" text-anchor="end" fill="var(--ink-soft)">${v.toFixed(1)}</text>`).join("");
  const ticks = [0, 10, 20, 30, 40].map((h) => `<text x="${xs(h)}" y="${H - 14}" font-size="11" text-anchor="middle" fill="var(--ink-soft)">${h}</text>`).join("");
  const cy = recB.find((p) => Math.abs(p.h - cursor) < 1e-9)?.dent ?? dentA(cursor);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="離した後のへこみの戻り：見本Aの線と試料Bの記録">
    <text x="4" y="16" font-size="13" font-weight="700" fill="var(--ink)">へこみの戻り（下ほど深い）</text>
    ${grid}${ticks}
    <text x="${W - R}" y="${H - 1}" font-size="11" text-anchor="end" fill="var(--ink-soft)">離してからの秒数 →</text>
    <polyline points="${aPts.join(" ")}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="6 4"/>
    <polyline points="${bLine}" fill="none" stroke="var(--claude)" stroke-width="2.5"/>
    ${photoHs.map((h) => `<path d="M${xs(h) - 5} ${T - 10} h10 l-5 7 z" fill="var(--hanko)"/>`).join("")}
    <line x1="${xs(cursor)}" x2="${xs(cursor)}" y1="${T}" y2="${H - B}" stroke="var(--claude)" stroke-width="1.5"/>
    <circle cx="${xs(cursor)}" cy="${ys(cy)}" r="5" fill="var(--claude)"/>
  </svg>`;
}
