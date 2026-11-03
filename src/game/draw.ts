// ゲーム版の図：検査ロボ、回復カメラ（パッド）、膜カメラ、膜電位のグラフ、対決の目盛り。
// 図はどれも、渡された記録・計算値から描く（隠れた答えは受け取らない）。
import { BASE_MEM, deltaMv, PULSE_MS, RECORD_MS, REST_MV, type Membrane } from "../../server/model/membraneGame.js";

export type Mood = "calm" | "scan" | "shock" | "smug";

/** 検査ロボ KENSA-07（定型ルールで動く。AIではない） */
export function robotSvg(mood: Mood): string {
  const eye = (x: number) => {
    if (mood === "shock") return `<circle cx="${x}" cy="30" r="6.5" fill="var(--g-warn)"/><circle cx="${x}" cy="30" r="2.5" fill="var(--g-panel)"/>`;
    if (mood === "smug") return `<path d="M${x - 6} 31 q6 -7 12 0" stroke="var(--g-warn)" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    if (mood === "scan") return `<rect x="${x - 7}" y="27" width="14" height="6" rx="3" fill="var(--g-accent)"/>`;
    return `<rect x="${x - 4}" y="23" width="8" height="14" rx="4" fill="var(--g-warn)"/>`;
  };
  return `<svg viewBox="0 0 64 60" width="58" height="54" aria-hidden="true">
    <line x1="32" y1="2" x2="32" y2="10" stroke="var(--g-warn)" stroke-width="2.5"/>
    <circle cx="32" cy="3" r="3" fill="var(--g-warn)"/>
    <rect x="5" y="10" width="54" height="44" rx="12" fill="var(--g-panel)" stroke="var(--g-line-strong)" stroke-width="2.5"/>
    <rect x="12" y="17" width="40" height="28" rx="8" fill="var(--g-screen)"/>
    ${eye(24)}${eye(40)}
  </svg>`;
}

export interface PadState {
  /** 押し板と試験片の状態：push＝押している（進み 0〜1）、hold＝深さを保つ、release＝離した後 */
  readonly phase: "idle" | "push" | "hold" | "release";
  readonly press: number;
  /** 離した後のへこみ（深さ1に対する割合）。B は記録の値、A は基準の計算 */
  readonly dentA: number;
  readonly dentB: number;
  /** 力の表示（押している間と保つ間） */
  readonly forceA: number | null;
  readonly forceB: number | null;
  readonly highlight: boolean;
}

/**
 * 回復カメラ：見本A（基準の計算）と試料B（測定記録）のパッドを並べる。
 * 縦の目盛りは「押した深さ＝1」を 96 画素で描く（へこみの差を見やすくするため、厚みに対して深さを大きめに描いている）。
 */
export function padCameraSvg(s: PadState): string {
  const W = 760;
  const H = 300;
  const BASE_Y = 262;
  const TOP0 = 108;
  const DEPTH_PX = 96;
  const st = (x0: number, label: "A" | "B") => {
    const dent = s.phase === "release" ? (label === "A" ? s.dentA : s.dentB) : s.phase === "idle" ? 0 : s.phase === "push" ? s.press : 1;
    const top = TOP0 + DEPTH_PX * Math.max(-0.05, Math.min(1.05, dent));
    const platenY = s.phase === "release" || s.phase === "idle" ? TOP0 - 46 : top - 14;
    const padL = x0 + 46;
    const padW = 240;
    const bulge = s.phase === "push" || s.phase === "hold" ? 10 * dent : 4 * Math.max(0, dent);
    const fill = label === "A" ? "var(--g-pad-a)" : "var(--g-pad-b)";
    const edge = label === "A" ? "var(--g-pad-a-edge)" : "var(--g-pad-b-edge)";
    const force = label === "A" ? s.forceA : s.forceB;
    const grid = [1, 2, 3]
      .map((k) => `<line x1="${padL - bulge * 0.5}" x2="${padL + padW + bulge * 0.5}" y1="${top + ((BASE_Y - top) * k) / 4}" y2="${top + ((BASE_Y - top) * k) / 4}" stroke="${edge}" stroke-width="1" opacity="0.45"/>`)
      .concat(
        [1, 2, 3].map((k) => {
          const x = padL + (padW * k) / 4;
          const b = (x - (padL + padW / 2)) * 0.06 * dent;
          return `<path d="M${x} ${top + 2} Q${x + b * 2} ${(top + BASE_Y) / 2} ${x} ${BASE_Y - 2}" stroke="${edge}" stroke-width="1" fill="none" opacity="0.45"/>`;
        }),
      )
      .join("");
    const valueText =
      s.phase === "release"
        ? `<text x="${padL + padW / 2}" y="${top + 28}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--g-ink)" font-variant-numeric="tabular-nums">へこみ ${dent.toFixed(3)}</text>`
        : "";
    return `<g>
      <text x="${x0 + 10}" y="22" font-size="16" font-weight="700" fill="var(--g-ink)">${label === "A" ? "見本 A" : "試料 B"}</text>
      <text x="${x0 + 330}" y="22" font-size="12.5" text-anchor="end" fill="var(--g-soft)">${label === "A" ? "基準の計算" : "測定の記録（誤差 ±0.01）"}</text>
      <rect x="${x0 + 156}" y="34" width="12" height="${Math.max(0, platenY - 34)}" fill="var(--g-steel)"/>
      <rect x="${x0 + 30}" y="${platenY}" width="272" height="14" rx="3" fill="var(--g-steel-dark)"/>
      ${force !== null && (s.phase === "push" || s.phase === "hold") ? `<g><rect x="${x0 + 186}" y="40" width="96" height="26" rx="5" fill="var(--g-screen)"/><text x="${x0 + 234}" y="58" text-anchor="middle" font-size="14" font-weight="700" fill="var(--g-accent)" font-variant-numeric="tabular-nums">力 ${force.toFixed(2)}</text></g>` : ""}
      <line x1="${x0 + 20}" x2="${x0 + 316}" y1="${TOP0}" y2="${TOP0}" stroke="var(--g-soft)" stroke-dasharray="5 4"/>
      <text x="${x0 + 22}" y="${TOP0 - 6}" font-size="11.5" fill="var(--g-soft)">押す前の表面（へこみ 0）</text>
      <rect x="${padL - bulge * 0.5}" y="${top}" width="${padW + bulge}" height="${BASE_Y - top}" rx="14" fill="${fill}" stroke="${edge}" stroke-width="2.5"/>
      ${grid}
      <circle cx="${padL + padW / 2}" cy="${top + 1}" r="5" fill="${edge}"/>
      ${valueText}
      <rect x="${x0 + 20}" y="${BASE_Y}" width="300" height="10" rx="3" fill="var(--g-steel)"/>
      <line x1="${x0 + 14}" x2="${x0 + 14}" y1="${TOP0}" y2="${TOP0 + DEPTH_PX}" stroke="var(--g-soft)" stroke-width="1.5"/>
      <line x1="${x0 + 9}" x2="${x0 + 19}" y1="${TOP0 + DEPTH_PX}" y2="${TOP0 + DEPTH_PX}" stroke="var(--g-soft)" stroke-width="1.5"/>
      <text x="${x0 + 8}" y="${TOP0 + 4}" font-size="11" text-anchor="end" fill="var(--g-soft)">0</text>
      <text x="${x0 + 8}" y="${TOP0 + DEPTH_PX + 4}" font-size="11" text-anchor="end" fill="var(--g-soft)">1</text>
    </g>`;
  };
  const diff = s.dentB - s.dentA;
  const badge =
    s.phase === "release"
      ? `<g><rect x="${W / 2 - 52}" y="${H - 30}" width="104" height="26" rx="13" fill="${s.highlight ? "var(--g-warn)" : "var(--g-chip)"}"/>
         <text x="${W / 2}" y="${H - 12}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${s.highlight ? "var(--g-on-warn)" : "var(--g-ink)"}" font-variant-numeric="tabular-nums">差 ${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(3)}</text></g>`
      : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="cam-svg" role="img" aria-label="回復カメラ：見本Aと試料Bのパッドのへこみ">
    ${st(10, "A")}${st(400, "B")}${badge}
  </svg>`;
}

/** 回復の記録のグラフ（小さく）：Aは基準の線、Bは記録 */
export function recoveryMiniSvg(rec: readonly { h: number; dent: number }[], dentA: (h: number) => number, cursor: number, until: number): string {
  const W = 360;
  const H = 120;
  const L = 30;
  const R = 8;
  const T = 10;
  const B = 22;
  const tMax = 40;
  const xs = (h: number) => L + ((W - L - R) * Math.min(tMax, h)) / tMax;
  const ys = (d: number) => T + (H - T - B) * (Math.min(0.75, Math.max(-0.02, d)) / 0.75);
  const a: string[] = [];
  for (let i = 0; i <= 120; i++) a.push(`${xs((tMax * i) / 120).toFixed(1)},${ys(dentA((tMax * i) / 120)).toFixed(1)}`);
  const b = rec.filter((p) => p.h <= until + 1e-9).map((p) => `${xs(p.h).toFixed(1)},${ys(p.dent).toFixed(1)}`);
  return `<svg viewBox="0 0 ${W} ${H}" class="mini-svg" role="img" aria-label="へこみの戻りの記録（下ほど深い）">
    ${[0, 0.25, 0.5].map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--g-line)"/><text x="${L - 4}" y="${ys(v) + 4}" font-size="9.5" text-anchor="end" fill="var(--g-soft)">${v}</text>`).join("")}
    ${[0, 10, 20, 30, 40].map((h) => `<text x="${xs(h)}" y="${H - 6}" font-size="9.5" text-anchor="middle" fill="var(--g-soft)">${h}</text>`).join("")}
    <polyline points="${a.join(" ")}" fill="none" stroke="var(--g-soft)" stroke-width="1.8" stroke-dasharray="5 4"/>
    ${b.length > 1 ? `<polyline points="${b.join(" ")}" fill="none" stroke="var(--g-accent)" stroke-width="2"/>` : ""}
    <line x1="${xs(cursor)}" x2="${xs(cursor)}" y1="${T}" y2="${H - B}" stroke="var(--g-warn)" stroke-width="1.5"/>
  </svg>`;
}

/** 膜カメラ：神経細胞の膜の一部分を、二つ並べて拡大する。t は流し始めからのミリ秒 */
export function membraneCameraSvg(a: Membrane, b: Membrane, t: number, labels: { a: string; b: string; bNote: string }, highlight: boolean): string {
  const W = 760;
  const H = 300;
  const st = (x0: number, m: Membrane, label: string, note: string, isB: boolean) => {
    const dv = deltaMv(m, t);
    const v = REST_MV + dv;
    const mid = 150;
    const band = 24;
    const left = x0 + 24;
    const width = 310;
    const nCh = Math.max(1, Math.min(8, Math.round(3 * m.g)));
    const chX = Array.from({ length: nCh }, (_, i) => left + ((i + 0.5) * width) / nCh);
    // 膜にたまる電荷の数 ∝ 容量 × 電位の差（同じ電位でも、容量が大きい膜は多くの電荷をためる）
    const q = Math.round(((m.c * Math.max(0, dv)) / 10) * 7);
    const charges = Array.from({ length: Math.min(18, q) }, (_, i) => left + 14 + ((i + 0.5) * (width - 28)) / Math.max(1, Math.min(18, q)));
    const injecting = t > 0 && t <= PULSE_MS;
    const leak = (m.g * Math.max(0, dv)) / 10; // 通り道から外へ出る正味の電流（基準膜Aに流す電流＝1）
    const col = isB ? "var(--g-accent)" : "var(--g-soft)";
    return `<g>
      <text x="${x0 + 10}" y="22" font-size="16" font-weight="700" fill="var(--g-ink)">${label}</text>
      <text x="${x0 + 340}" y="22" font-size="12.5" text-anchor="end" fill="var(--g-soft)">${note}</text>
      <text x="${x0 + 26}" y="${mid - band / 2 - 52}" font-size="12" fill="var(--g-soft)">細胞の外</text>
      <text x="${x0 + 26}" y="${mid + band / 2 + 66}" font-size="12" fill="var(--g-soft)">細胞の中</text>
      <rect x="${left}" y="${mid - band / 2}" width="${width}" height="${band}" rx="6" fill="var(--g-membrane)" stroke="var(--g-membrane-edge)" stroke-width="1.5"/>
      ${Array.from({ length: 30 }, (_, i) => `<circle cx="${left + 6 + i * (width - 12) / 29}" cy="${mid - band / 2 + 4}" r="3" fill="var(--g-membrane-edge)" opacity="0.55"/><circle cx="${left + 6 + i * (width - 12) / 29}" cy="${mid + band / 2 - 4}" r="3" fill="var(--g-membrane-edge)" opacity="0.55"/>`).join("")}
      ${chX.map((x) => `<rect x="${x - 7}" y="${mid - band / 2 - 4}" width="14" height="${band + 8}" rx="4" fill="var(--g-channel)" stroke="var(--g-channel-edge)" stroke-width="1.5"/>`).join("")}
      ${charges.map((x) => `<text x="${x}" y="${mid + band / 2 + 20}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--g-plus)">+</text><text x="${x}" y="${mid - band / 2 - 9}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--g-minus)">−</text>`).join("")}
      ${leak > 0.03 ? chX.map((x) => `<path d="M${x} ${mid - band / 2 - 6} V${mid - band / 2 - 16 - 16 * Math.min(1.6, leak)}" stroke="var(--g-plus)" stroke-width="${1.5 + 2.5 * Math.min(1.6, leak)}" marker-end="url(#arr)" opacity="0.8"/>`).join("") : ""}
      <rect x="${x0 + 168}" y="${H - 64}" width="10" height="44" fill="var(--g-steel)"/>
      <path d="M${x0 + 168} ${H - 64} l5 -12 l5 12 z" fill="var(--g-steel)"/>
      ${injecting ? `<path d="M${x0 + 173} ${H - 80} V${mid + band / 2 + 34}" stroke="var(--g-warn)" stroke-width="4" marker-end="url(#arrw)"/>` : ""}
      <rect x="${x0 + 190}" y="${H - 52}" width="128" height="32" rx="6" fill="var(--g-screen)"/>
      <text x="${x0 + 254}" y="${H - 30}" text-anchor="middle" font-size="16" font-weight="700" fill="${col === "var(--g-soft)" ? "var(--g-on-screen)" : "var(--g-accent)"}" font-variant-numeric="tabular-nums">${v.toFixed(1)} mV</text>
    </g>`;
  };
  const d = deltaMv(b, t) - deltaMv(a, t);
  return `<svg viewBox="0 0 ${W} ${H}" class="cam-svg" role="img" aria-label="膜カメラ：膜Aと膜Bの電荷、イオンの通り道、膜電位">
    <defs>
      <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--g-plus)"/></marker>
      <marker id="arrw" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--g-warn)"/></marker>
    </defs>
    ${st(10, a, labels.a, "基準の膜", false)}${st(400, b, labels.b, labels.bNote, true)}
    <g><rect x="${W / 2 - 48}" y="${H - 50}" width="96" height="28" rx="14" fill="${highlight ? "var(--g-warn)" : "var(--g-chip)"}"/>
    <text x="${W / 2}" y="${H - 31}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${highlight ? "var(--g-on-warn)" : "var(--g-ink)"}" font-variant-numeric="tabular-nums">差 ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} mV</text></g>
  </svg>`;
}

/** 膜電位のグラフ（0〜200 ミリ秒）。A は点線、B は実線。until までを描く */
export function memGraphSvg(a: Membrane, b: Membrane, until: number, cursor: number | null, marks: readonly number[] = []): string {
  const W = 760;
  const H = 210;
  const L = 52;
  const R = 12;
  const T = 14;
  const B = 34;
  const vMin = REST_MV - 1;
  const top = REST_MV + Math.max(12, ...[a, b].map((m) => deltaMv(m, PULSE_MS) + 1.5));
  const xs = (t: number) => L + ((W - L - R) * t) / RECORD_MS;
  const ys = (v: number) => T + (H - T - B) * (1 - (v - vMin) / (top - vMin));
  const line = (m: Membrane, upto: number) => {
    const pts: string[] = [];
    for (let t = 0; t <= upto + 1e-9; t += 1) pts.push(`${xs(t).toFixed(1)},${ys(REST_MV + deltaMv(m, t)).toFixed(1)}`);
    return pts.join(" ");
  };
  const ticksV = [REST_MV, REST_MV + 5, REST_MV + 10, REST_MV + 15, REST_MV + 20].filter((v) => v <= top);
  return `<svg viewBox="0 0 ${W} ${H}" class="graph-svg" role="img" aria-label="膜電位の変化：膜Aと膜B">
    <rect x="${xs(0)}" y="${T}" width="${xs(PULSE_MS) - xs(0)}" height="${H - T - B}" fill="var(--g-band)"/>
    <text x="${xs(4)}" y="${T + 14}" font-size="11.5" fill="var(--g-soft)">電流を流している間（100ミリ秒）</text>
    ${ticksV.map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--g-line)"/><text x="${L - 6}" y="${ys(v) + 4}" font-size="11" text-anchor="end" fill="var(--g-soft)">${v}</text>`).join("")}
    ${[0, 50, 100, 150, 200].map((t) => `<text x="${xs(t)}" y="${H - 16}" font-size="11" text-anchor="middle" fill="var(--g-soft)">${t}</text>`).join("")}
    <text x="${W - R}" y="${H - 2}" font-size="11" text-anchor="end" fill="var(--g-soft)">流し始めからのミリ秒 →</text>
    <text x="${L}" y="${T - 2}" font-size="11" fill="var(--g-soft)">mV</text>
    <polyline points="${line(a, until)}" fill="none" stroke="var(--g-soft)" stroke-width="2.2" stroke-dasharray="6 4"/>
    <polyline points="${line(b, until)}" fill="none" stroke="var(--g-accent)" stroke-width="3"/>
    ${marks.map((t) => `<path d="M${xs(t) - 5} ${T + 2} h10 l-5 7 z" fill="var(--g-warn)"/>`).join("")}
    ${cursor !== null ? `<line x1="${xs(cursor)}" x2="${xs(cursor)}" y1="${T}" y2="${H - B}" stroke="var(--g-warn)" stroke-width="1.8"/>` : ""}
  </svg>`;
}

/** 対決の目盛り：差（B−A）を中央0の横棒に。ロボの通過帯、または隠す違いに必要な帯を塗る */
export function diffMeterSvg(diff: number, kind: "robot" | "hidden" | "final", pass: number, range: number, unit = ""): string {
  const W = 420;
  const H = 46;
  const L = 10;
  const R = 10;
  const xs = (d: number) => L + ((W - L - R) * (Math.max(-range, Math.min(range, d)) + range)) / (2 * range);
  const zone =
    kind === "hidden"
      ? `<rect x="${xs(-range)}" y="12" width="${xs(-pass) - xs(-range)}" height="14" rx="3" fill="var(--g-zone-hidden)"/><rect x="${xs(pass)}" y="12" width="${xs(range) - xs(pass)}" height="14" rx="3" fill="var(--g-zone-hidden)"/>`
      : `<rect x="${xs(-pass)}" y="12" width="${xs(pass) - xs(-pass)}" height="14" rx="3" fill="var(--g-zone-pass)"/>`;
  const out = Math.abs(diff) > range;
  return `<svg viewBox="0 0 ${W} ${H}" class="meter-svg" aria-hidden="true">
    <rect x="${L}" y="12" width="${W - L - R}" height="14" rx="3" fill="var(--g-track)"/>
    ${zone}
    <line x1="${xs(0)}" x2="${xs(0)}" y1="6" y2="32" stroke="var(--g-soft)" stroke-width="1.5"/>
    <text x="${xs(0)}" y="44" font-size="10.5" text-anchor="middle" fill="var(--g-soft)">差 0（見本と同じ）</text>
    <rect x="${xs(diff) - 4}" y="4" width="8" height="30" rx="3" fill="var(--g-marker)"/>
    ${out ? `<text x="${diff > 0 ? W - R : L}" y="44" font-size="10.5" text-anchor="${diff > 0 ? "end" : "start"}" fill="var(--g-soft)">枠の外 ${unit}</text>` : ""}
  </svg>`;
}

export { BASE_MEM };

/**
 * 開幕の場面：柔らかいパッドの工場の検査台。ベルトで運ばれてくるパッドを、検査ロボが一つずつ押して、
 * 20秒後の力を見本と比べる（アニメーションは CSS。動きを減らす設定では止まる）。
 */
export function factorySvg(): string {
  const pad = (x: number, label: string, cls = "") =>
    `<g class="${cls}" transform="translate(${x} 0)"><rect x="0" y="176" width="74" height="30" rx="9" fill="var(--g-pad-b)" stroke="var(--g-pad-b-edge)" stroke-width="2"/><text x="37" y="196" text-anchor="middle" font-size="12" font-weight="700" fill="var(--g-ink)">${label}</text></g>`;
  return `<svg viewBox="0 0 760 250" class="factory" role="img" aria-label="パッド工場の検査台：ベルトで運ばれてくるパッドを、検査ロボKENSA-07が押して、20秒後の力を見本と比べる">
    <!-- 見本の台 -->
    <rect x="18" y="206" width="110" height="10" rx="3" fill="var(--g-steel)"/>
    <rect x="36" y="176" width="74" height="30" rx="9" fill="var(--g-pad-a)" stroke="var(--g-pad-a-edge)" stroke-width="2"/>
    <text x="73" y="196" text-anchor="middle" font-size="12" font-weight="700" fill="var(--g-ink)">見本A</text>
    <text x="73" y="234" text-anchor="middle" font-size="12" fill="var(--g-soft)">基準の値 1.00</text>
    <!-- ベルト -->
    <rect x="160" y="206" width="580" height="12" rx="6" fill="var(--g-steel-dark)"/>
    ${[176, 260, 344, 428, 512, 596, 680, 724].map((x) => `<circle cx="${x}" cy="212" r="4" fill="var(--g-steel)"/>`).join("")}
    <g class="belt">${pad(180, "パッド")}${pad(560, "パッド")}${pad(660, "パッド")}</g>
    <!-- 検査の位置のパッド（いま押されている） -->
    <g class="under-test">${pad(398, "試料B")}</g>
    <!-- 検査ロボ -->
    <g transform="translate(402 4)">${robotSvg("calm").replace('width="58" height="54"', 'width="68" height="64"')}</g>
    <rect x="356" y="66" width="160" height="12" rx="4" fill="var(--g-steel-dark)"/>
    <rect x="368" y="78" width="8" height="128" fill="var(--g-steel)"/>
    <rect x="496" y="78" width="8" height="128" fill="var(--g-steel)"/>
    <g class="press"><rect x="431" y="78" width="10" height="70" fill="var(--g-steel)"/><rect x="402" y="146" width="68" height="12" rx="3" fill="var(--g-steel-dark)"/></g>
    <!-- 表示 -->
    <g transform="translate(530 40)">
      <rect width="210" height="96" rx="10" fill="var(--g-screen)"/>
      <text x="14" y="24" font-size="12" fill="var(--g-on-screen)">KENSA-07 の検査</text>
      <text x="14" y="46" font-size="13" font-weight="700" fill="var(--g-accent)" class="step s1">① 押す</text>
      <text x="80" y="46" font-size="13" font-weight="700" fill="var(--g-accent)" class="step s2">② 20秒待つ</text>
      <text x="14" y="66" font-size="13" font-weight="700" fill="var(--g-accent)" class="step s3">③ 力を読む 1.00</text>
      <text x="14" y="86" font-size="13" font-weight="700" fill="var(--g-warn)" class="step s4">④ 見本と区別できません</text>
    </g>
    <text x="436" y="240" text-anchor="middle" font-size="12" fill="var(--g-soft)">検査の位置</text>
  </svg>`;
}
