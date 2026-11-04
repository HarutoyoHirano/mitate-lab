// ゲーム版の図：検査ロボ、回復カメラ（クッション）、膜カメラ、膜電位のグラフ、対決の目盛り。
// 図はどれも、渡された記録・計算値から描く（隠れた答えは受け取らない）。
import { BASE_MEM, deltaMv, PULSE_MS, RECORD_MS, REST_MV, type Membrane } from "../../server/model/membraneGame.js";

export type Mood = "calm" | "scan" | "shock" | "smug";

/** 検査ロボ TEJUN（定型ルールで動く。AIではない） */
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
 * 回復カメラ：見本A（基準の計算）と試料B（測定記録）のクッションを並べる。
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
      .map(() => "")
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
        ? `<text x="${padL + padW / 2}" y="${top + 28}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--g-ink)" stroke="${fill}" stroke-width="5" paint-order="stroke" font-variant-numeric="tabular-nums">へこみ ${dent.toFixed(3)}</text>`
        : "";
    return `<g>
      <text x="${x0 + 10}" y="22" font-size="16" font-weight="700" fill="var(--g-ink)">${label === "A" ? "見本 A" : "試料 B"}</text>
      <text x="${x0 + 330}" y="22" font-size="12.5" text-anchor="end" fill="var(--g-soft)">${label === "A" ? "基準の計算" : "測定の記録（誤差 ±0.01）"}</text>
      <rect x="${x0 + 156}" y="34" width="12" height="${Math.max(0, platenY - 34)}" fill="var(--g-steel)"/>
      <rect x="${x0 + 30}" y="${platenY}" width="272" height="14" rx="3" fill="var(--g-steel-dark)"/>
      ${force !== null && (s.phase === "push" || s.phase === "hold") ? `<g><rect x="${x0 + 186}" y="40" width="96" height="26" rx="5" fill="var(--g-screen)"/><text x="${x0 + 234}" y="58" text-anchor="middle" font-size="14" font-weight="700" fill="var(--g-accent)" font-variant-numeric="tabular-nums">力 ${force.toFixed(2)}</text></g>` : ""}
      <line x1="${x0 + 20}" x2="${x0 + 316}" y1="${TOP0}" y2="${TOP0}" stroke="var(--g-soft)" stroke-dasharray="5 4"/>
      <text x="${x0 + 22}" y="${TOP0 - 6}" font-size="11.5" fill="var(--g-soft)">押す前の表面（へこみ 0）</text>
      <rect x="${padL - bulge * 0.5}" y="${top}" width="${padW + bulge}" height="${BASE_Y - top}" rx="22" fill="${fill}"/>
      <rect x="${padL - bulge * 0.5}" y="${top}" width="${padW + bulge}" height="${BASE_Y - top}" rx="22" fill="url(#hex-${label})" opacity="0.55"/>
      <rect x="${padL - bulge * 0.5}" y="${top}" width="${padW + bulge}" height="${BASE_Y - top}" rx="22" fill="none" stroke="${edge}" stroke-width="2.5"/>
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
  return `<svg viewBox="0 0 ${W} ${H}" class="cam-svg" role="img" aria-label="回復カメラ：見本Aと試料Bのクッションのへこみ">
    <defs>${hexPattern("hex-A", "var(--g-pad-a-edge)")}${hexPattern("hex-B", "var(--g-pad-b-edge)")}</defs>
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

/** 3Dプリントの格子（ハニカム）の模様 */
export function hexPattern(id: string, color: string, size = 9): string {
  const w = size * 3;
  const h = size * Math.sqrt(3);
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const d = `M${p(0, h / 2)} L${p(size / 2, 0)} L${p(size * 1.5, 0)} L${p(size * 2, h / 2)} L${p(size * 1.5, h)} L${p(size / 2, h)} Z M${p(size * 2, h / 2)} L${p(w, h / 2)}`;
  return `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.1"/></pattern>`;
}

/** 円盤形のクッション（横から見た図。上面のだ円と側面、側面に格子） */
function puck(cx: number, top: number, rx: number, height: number, label: string, kind: "A" | "B", pat: string, labelY?: number): string {
  const ry = rx * 0.24;
  const fill = kind === "A" ? "var(--g-pad-a)" : "var(--g-pad-b)";
  const edge = kind === "A" ? "var(--g-pad-a-edge)" : "var(--g-pad-b-edge)";
  return `<g>
    <path d="M${cx - rx} ${top} V${top + height} A${rx} ${ry} 0 0 0 ${cx + rx} ${top + height} V${top} Z" fill="${fill}" stroke="${edge}" stroke-width="2"/>
    <path d="M${cx - rx} ${top} V${top + height} A${rx} ${ry} 0 0 0 ${cx + rx} ${top + height} V${top} Z" fill="url(#${pat})" opacity="0.6"/>
    <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="2"/>
    <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="url(#${pat})" opacity="0.6"/>
    <ellipse cx="${cx - rx * 0.35}" cy="${top - ry * 0.25}" rx="${rx * 0.35}" ry="${ry * 0.3}" fill="#fff" opacity="0.35"/>
    <text x="${cx}" y="${labelY ?? top + height + ry + 18}" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--g-ink)">${label}</text>
  </g>`;
}

/**
 * 開幕の場面：再生医療ラボ（仮想）。左に膝の断面の模式図（太ももの骨・すねの骨・膝のお皿と、その間の人工クッション）、
 * 中央に3Dプリンタ（格子を積み重ねて円盤形のクッションを作る）、右に検査ロボの検査台と手順の表示。
 * 実在の人工関節・軟骨を描いたものではない（形は模式）。アニメーションは CSS（動きを減らす設定では止まる）。
 */
export function factorySvg(): string {
  return `<svg viewBox="0 0 760 290" class="factory" role="img" aria-label="再生医療ラボの検査：膝の骨と骨の間に入れる3Dプリントの人工クッションを、検査ロボTEJUNが押して調べる">
    <defs>
      ${hexPattern("hexF-A", "var(--g-pad-a-edge)", 5)}${hexPattern("hexF-B", "var(--g-pad-b-edge)", 5)}${hexPattern("hexF-K", "var(--g-pad-b-edge)", 3.2)}
      <linearGradient id="bone" x1="0" x2="1"><stop offset="0" stop-color="var(--g-bone-shade)"/><stop offset="0.45" stop-color="var(--g-bone)"/><stop offset="1" stop-color="var(--g-bone-shade)"/></linearGradient>
    </defs>
    <!-- 膝（横から見た模式図） -->
    <g transform="translate(8 6)">
      <path d="M50 0 H182 C178 52 184 96 180 128 C178 152 166 172 158 196 L156 274 H72 L70 196 C58 170 44 150 44 126 C42 92 52 52 50 0 Z" fill="var(--g-skin)" stroke="var(--g-skin-edge)" stroke-width="1.5"/>
      <path d="M94 0 H122 L124 84 C142 88 154 104 150 122 C147 136 132 142 118 136 C108 142 88 142 80 130 C70 116 78 94 92 86 Z" fill="url(#bone)" stroke="var(--g-bone-edge)" stroke-width="2"/>
      <g class="squash-knee">
        <path d="M72 140 C90 135 136 135 154 140 C159 144 158 151 151 153 C132 156 94 156 76 153 C69 151 67 144 72 140 Z" fill="var(--g-pad-b)" stroke="var(--g-pad-b-edge)" stroke-width="2.2"/>
        <path d="M72 140 C90 135 136 135 154 140 C159 144 158 151 151 153 C132 156 94 156 76 153 C69 151 67 144 72 140 Z" fill="url(#hexF-K)" opacity="0.7"/>
      </g>
      <path d="M68 158 C86 154 140 154 158 158 C163 165 158 174 146 178 L132 184 L130 274 H98 L96 184 L82 178 C70 174 63 165 68 158 Z" fill="url(#bone)" stroke="var(--g-bone-edge)" stroke-width="2"/>
      <ellipse cx="166" cy="116" rx="9" ry="15" fill="url(#bone)" stroke="var(--g-bone-edge)" stroke-width="2"/>
      <path d="M166 131 C166 150 154 166 146 180" fill="none" stroke="var(--g-bone-edge)" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
      <g font-size="11.5" fill="var(--g-soft)">
        <path d="M120 40 H196" stroke="var(--g-soft)"/><text x="200" y="44">太ももの骨</text>
        <path d="M120 230 H196" stroke="var(--g-soft)"/><text x="200" y="234">すねの骨</text>
        <path d="M176 112 H196" stroke="var(--g-soft)"/><text x="200" y="116">膝のお皿</text>
        <path d="M158 147 H196" stroke="var(--g-pad-b-edge)" stroke-width="2"/><text x="200" y="146" font-weight="700" fill="var(--g-ink)">人工の</text><text x="200" y="161" font-weight="700" fill="var(--g-ink)">クッション</text>
        <text x="200" y="186" fill="var(--g-warn)" font-weight="700">走る＝すばやく</text>
        <text x="200" y="201">歩く＝ゆっくり</text>
      </g>
    </g>
    <!-- 3Dプリンタ：格子を積み重ねて円盤形のクッションを作る -->
    <g transform="translate(300 30)">
      <rect x="0" y="0" width="122" height="190" rx="10" fill="var(--g-panel-2)" stroke="var(--g-steel-dark)" stroke-width="3"/>
      <rect x="0" y="22" width="122" height="8" fill="var(--g-steel-dark)"/>
      <g class="nozzle"><rect x="26" y="30" width="20" height="26" rx="3" fill="var(--g-steel-dark)"/><path d="M31 56 h10 l-5 9 z" fill="var(--g-warn)"/><circle cx="36" cy="69" r="2.5" fill="var(--g-warn)" class="drip"/></g>
      ${puck(61, 140, 40, 22, "", "B", "hexF-B")}
      <rect x="10" y="172" width="102" height="8" rx="2" fill="var(--g-steel)"/>
      <text x="61" y="210" text-anchor="middle" font-size="12" fill="var(--g-soft)">3Dプリンタ</text>
      <text x="61" y="226" text-anchor="middle" font-size="12" font-weight="700" fill="var(--g-ink)">新しい印刷条件</text>
    </g>
    <!-- 検査台 -->
    <rect x="440" y="238" width="170" height="10" rx="3" fill="var(--g-steel-dark)"/>
    ${puck(478, 210, 30, 20, "見本A", "A", "hexF-A", 270)}
    <g class="under-test">${puck(570, 210, 30, 20, "新作B", "B", "hexF-B", 270)}</g>
    <g transform="translate(536 34)">${robotSvg("calm").replace('width="58" height="54"', 'width="68" height="64"')}</g>
    <rect x="516" y="96" width="108" height="12" rx="4" fill="var(--g-steel-dark)"/>
    <rect x="524" y="108" width="7" height="130" fill="var(--g-steel)"/><rect x="609" y="108" width="7" height="130" fill="var(--g-steel)"/>
    <g class="press"><rect x="565" y="108" width="10" height="66" fill="var(--g-steel)"/><rect x="540" y="172" width="60" height="12" rx="3" fill="var(--g-steel-dark)"/></g>
    <!-- 表示 -->
    <g transform="translate(628 36)">
      <rect width="126" height="132" rx="10" fill="var(--g-screen)"/>
      <text x="10" y="22" font-size="11" fill="var(--g-on-screen)">TEJUN の検査</text>
      <text x="10" y="46" font-size="12.5" font-weight="700" fill="var(--g-accent)" class="step s1">① 押す</text>
      <text x="10" y="68" font-size="12.5" font-weight="700" fill="var(--g-accent)" class="step s2">② 20秒待つ</text>
      <text x="10" y="90" font-size="12.5" font-weight="700" fill="var(--g-accent)" class="step s3">③ 力を読む</text>
      <text x="10" y="114" font-size="12" font-weight="700" fill="var(--g-warn)" class="step s4">④ 区別できない</text>
    </g>
  </svg>`;
}

export interface TrackState {
  /** 一歩の中の位置（0〜1）と、いま何歩目か。走っていないときは null */
  readonly k: number | null;
  readonly u: number;
  /** いまのへこみ（A・B） */
  readonly dentA: number;
  readonly dentB: number;
  /** 接地しているか */
  readonly contact: boolean;
  readonly highlight: boolean;
}

/**
 * 走行テストの台：二本の試験脚が、膝のクッションA（見本）とB（新作）を一歩ずつ踏む。
 * クッションの縦のつぶれは、へこみ1（力1を長くかけたときのへこみ）を 52 画素で描く（見やすくするため拡大）。
 */
export function trackSvg(s: TrackState, labels: { a: string; aNote: string; b: string; bNote: string } = { a: "見本 A", aNote: "計算", b: "新作 B", bNote: "記録（誤差 ±0.01）" }): string {
  const W = 760;
  const H = 300;
  const BASE_Y = 262;
  const TOP0 = 178;
  const DEPTH_PX = 52;
  const lane = (x0: number, label: "A" | "B", dent: number) => {
    const fill = label === "A" ? "var(--g-pad-a)" : "var(--g-pad-b)";
    const edge = label === "A" ? "var(--g-pad-a-edge)" : "var(--g-pad-b-edge)";
    const top = TOP0 + DEPTH_PX * Math.max(-0.05, Math.min(1.2, dent));
    const cx = x0 + 170;
    const rx = 110;
    const ry = 18;
    // 試験脚：足の裏がクッションの上面に触れているか、少し上にある
    const footY = s.contact ? top - 4 : TOP0 - 26 - 12 * Math.sin(Math.PI * Math.min(1, Math.max(0, (s.u - 0.5) / 0.5)));
    const kneeX = cx + 24;
    const kneeY = footY - 66;
    const hipY = kneeY - 58;
    const bone = (x1: number, y1: number, x2: number, y2: number, w: number) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--g-bone-edge)" stroke-width="${w + 4}" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--g-bone)" stroke-width="${w}" stroke-linecap="round"/>`;
    return `<g>
      <text x="${x0 + 20}" y="24" font-size="16" font-weight="700" fill="var(--g-ink)">${label === "A" ? labels.a : labels.b}</text>
      <text x="${x0 + 330}" y="24" font-size="12.5" text-anchor="end" fill="var(--g-soft)">${label === "A" ? labels.aNote : labels.bNote}</text>
      <!-- 試験脚 -->
      ${bone(cx - 4, hipY, kneeX, kneeY, 16)}${bone(kneeX, kneeY, cx, footY - 14, 14)}
      <circle cx="${kneeX}" cy="${kneeY}" r="11" fill="var(--g-steel-dark)"/>
      <rect x="${cx - 46}" y="${footY - 16}" width="92" height="16" rx="7" fill="var(--g-steel-dark)"/>
      <rect x="${cx - 20}" y="${hipY - 18}" width="40" height="18" rx="5" fill="var(--g-steel)"/>
      ${s.contact && s.u < 0.12 ? `<g stroke="var(--g-warn)" stroke-width="3" stroke-linecap="round"><path d="M${cx - 62} ${top - 2} l-16 -10"/><path d="M${cx + 62} ${top - 2} l16 -10"/><path d="M${cx - 66} ${top + 10} l-18 0"/><path d="M${cx + 66} ${top + 10} l18 0"/></g>` : ""}
      <!-- クッション（円盤形・格子） -->
      <path d="M${cx - rx} ${top} V${BASE_Y} A${rx} ${ry} 0 0 0 ${cx + rx} ${BASE_Y} V${top} Z" fill="${fill}" stroke="${edge}" stroke-width="2"/>
      <path d="M${cx - rx} ${top} V${BASE_Y} A${rx} ${ry} 0 0 0 ${cx + rx} ${BASE_Y} V${top} Z" fill="url(#hexT-${label})" opacity="0.6"/>
      <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="2"/>
      <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="url(#hexT-${label})" opacity="0.6"/>
      <line x1="${x0 + 30}" x2="${x0 + 310}" y1="${TOP0}" y2="${TOP0}" stroke="var(--g-soft)" stroke-dasharray="5 4"/>
      <text x="${x0 + 30}" y="${TOP0 - 6}" font-size="11" fill="var(--g-soft)">踏む前の上面</text>
      <rect x="${x0 + 40}" y="${BASE_Y + 16}" width="260" height="10" rx="3" fill="var(--g-steel)"/>
      <text x="${x0 + 330}" y="${TOP0 + 26}" text-anchor="end" font-size="16" font-weight="700" fill="var(--g-ink)" font-variant-numeric="tabular-nums">${dent.toFixed(2)}</text>
      <text x="${x0 + 330}" y="${TOP0 + 42}" text-anchor="end" font-size="11" fill="var(--g-soft)">沈み込み</text>
    </g>`;
  };
  const d = s.dentB - s.dentA;
  return `<svg viewBox="0 0 ${W} ${H}" class="cam-svg track" role="img" aria-label="走行テスト：二本の試験脚がクッションAとBを一歩ずつ踏む">
    <defs>${hexPattern("hexT-A", "var(--g-pad-a-edge)", 7)}${hexPattern("hexT-B", "var(--g-pad-b-edge)", 7)}</defs>
    ${lane(10, "A", s.dentA)}${lane(400, "B", s.dentB)}
    ${s.k !== null ? `<g><rect x="${W / 2 - 52}" y="40" width="104" height="26" rx="13" fill="${s.highlight ? "var(--g-warn)" : "var(--g-chip)"}"/><text x="${W / 2}" y="58" text-anchor="middle" font-size="13.5" font-weight="700" fill="${s.highlight ? "var(--g-on-warn)" : "var(--g-ink)"}" font-variant-numeric="tabular-nums">差 ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(3)}</text></g>
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--g-soft)">${s.k + 1} 歩目</text>` : ""}
  </svg>`;
}

/**
 * 一歩ごとの記録：各歩の「着地中（足を上げる直前）」の沈み込みを棒で、「次の着地の直前（戻りきれなかった分）」を丸で。
 * Aは灰色、Bは青緑。棒や丸を押すと、その一歩・その点の証拠を撮る。
 */
export function stepBarsSvg(
  a: readonly { peak: number; pre: number }[],
  b: readonly { peak: number; pre: number }[],
  shown: number,
  photos: readonly { step: number; phase: string; distinguishable: boolean }[],
): string {
  const W = 760;
  const H = 230;
  const L = 44;
  const R = 10;
  const T = 16;
  const B = 34;
  const n = a.length;
  const slot = (W - L - R) / n;
  const yMax = Math.max(1, ...a.map((x) => x.peak), ...b.map((x) => x.peak)) * 1.08;
  const ys = (v: number) => T + (H - T - B) * (1 - Math.max(0, v) / yMax);
  const bars: string[] = [];
  for (let k = 0; k < Math.min(shown, n); k++) {
    const x = L + slot * k;
    const w = slot * 0.3;
    const pa = photos.find((p) => p.step === k && p.phase === "peak");
    const pr = photos.find((p) => p.step === k && p.phase === "pre");
    bars.push(`
      <rect x="${x + slot * 0.14}" y="${ys(a[k]!.peak)}" width="${w}" height="${ys(0) - ys(a[k]!.peak)}" rx="3" fill="var(--g-pad-a-edge)" opacity="0.7"/>
      <rect class="hit" data-act="run-photo" data-step="${k}" data-phase="peak" x="${x + slot * 0.14 + w + 2}" y="${ys(b[k]!.peak)}" width="${w}" height="${ys(0) - ys(b[k]!.peak)}" rx="3" fill="var(--g-accent)" ${pa ? `stroke="var(--g-warn)" stroke-width="3"` : ""}/>
      <circle cx="${x + slot * 0.14 + w / 2}" cy="${ys(a[k]!.pre)}" r="4.5" fill="var(--g-panel)" stroke="var(--g-pad-a-edge)" stroke-width="2"/>
      <circle class="hit" data-act="run-photo" data-step="${k}" data-phase="pre" cx="${x + slot * 0.14 + w * 1.5 + 2}" cy="${ys(b[k]!.pre)}" r="${pr ? 7 : 5.5}" fill="var(--g-panel)" stroke="${pr ? "var(--g-warn)" : "var(--g-accent)"}" stroke-width="3"/>
      ${pa?.distinguishable || pr?.distinguishable ? `<text x="${x + slot / 2}" y="${T + 10}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--g-warn)">★</text>` : ""}
      <text x="${x + slot / 2}" y="${H - 14}" text-anchor="middle" font-size="11" fill="var(--g-soft)">${k + 1}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="graph-svg bars" role="img" aria-label="一歩ごとの沈み込み：棒は着地中、丸は次の着地の直前">
    ${[0, 0.25, 0.5, 0.75, 1].filter((v) => v <= yMax).map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--g-line)"/><text x="${L - 6}" y="${ys(v) + 4}" font-size="11" text-anchor="end" fill="var(--g-soft)">${v}</text>`).join("")}
    <text x="${W - R}" y="${H - 1}" text-anchor="end" font-size="11" fill="var(--g-soft)">何歩目 →</text>
    ${bars.join("")}
  </svg>`;
}

// ---------- v12：水槽のたとえ（謎3） ----------
/**
 * 水槽のたとえと膜電位のグラフを一枚に。水位＝静止時からの上がり分（グラフの縦軸と同じ目盛り）、
 * 水槽の広さ＝容量、出口のトビラの開き＝イオンの通りやすさ、床＝静止時の電位（電池）。
 * 入る流れ（電極の電流）と出る流れ（通りやすさ×上がり分）の太さは計算値に比例させる。しきい値・発火は描かない。
 */
export function tankGraphSvg(
  a: Membrane,
  b: Membrane,
  t: number,
  labels: { a: string; b: string },
  opts: { until?: number; marks?: readonly number[]; top?: number } = {},
): string {
  const W = 760;
  const H = 300;
  const T = 34;
  const B = 66;
  const floorY = H - B;
  const top = opts.top ?? Math.max(12, ...[a, b].map((m) => deltaMv(m, PULSE_MS) + 1.5));
  const ys = (dv: number) => floorY - ((floorY - T) * Math.max(0, Math.min(top, dv))) / top;
  // グラフ（右）
  const GL = 392;
  const GR = W - 12;
  const xs = (ms: number) => GL + ((GR - GL) * ms) / RECORD_MS;
  const until = opts.until ?? RECORD_MS;
  const line = (m: Membrane) => {
    const pts: string[] = [];
    for (let ms = 0; ms <= until + 1e-9; ms += 1) pts.push(`${xs(ms).toFixed(1)},${ys(deltaMv(m, ms)).toFixed(1)}`);
    return pts.join(" ");
  };
  const flowing = t <= PULSE_MS;
  const tank = (cx: number, m: Membrane, label: string, kind: "A" | "B") => {
    const w = Math.max(24, Math.min(130, 52 * m.c));
    const L = cx - w / 2;
    const R = cx + w / 2;
    const dv = deltaMv(m, t);
    const wy = ys(dv);
    const door = Math.max(5, Math.min(34, 14 * m.g));
    const out = Math.max(0, m.g * dv); // 出る流れ（通りやすさ×上がり分）
    const outW = Math.min(16, 1.1 * out);
    const edge = kind === "A" ? "var(--g-soft)" : "var(--g-accent)";
    return `<g>
      <text x="${cx}" y="18" text-anchor="middle" font-size="15" font-weight="700" fill="var(--g-ink)">${label}</text>
      <rect x="${L}" y="${wy}" width="${w}" height="${floorY - wy}" fill="var(--g-water)" opacity="0.85"/>
      <line x1="${L}" x2="${R}" y1="${wy}" y2="${wy}" stroke="var(--g-water-edge)" stroke-width="2.5"/>
      <path d="M${L} ${T - 6} V${floorY} H${R} V${floorY - door}" fill="none" stroke="${edge}" stroke-width="3"/>
      <path d="M${R} ${floorY - door - 4} V${T - 6}" fill="none" stroke="${edge}" stroke-width="3"/>
      <rect x="${R - 3}" y="${floorY - door - 6}" width="8" height="6" rx="2" fill="var(--g-channel-edge)"/>
      <text x="${R + 6}" y="${floorY - door - 9}" font-size="12" fill="var(--g-channel-edge)" font-weight="700">出口</text>
      ${outW > 0.4 ? `<path d="M${R + 2} ${floorY - door / 2} h${14 + outW}" stroke="var(--g-water-edge)" stroke-width="${outW.toFixed(1)}" stroke-linecap="round"/>` : ""}
      ${flowing ? `<path d="M${cx} ${T - 10} V${Math.max(T, wy - 2)}" stroke="var(--g-warn)" stroke-width="5" stroke-linecap="round" opacity="0.85"/><path d="M${cx - 6} ${T - 14} h12" stroke="var(--g-warn)" stroke-width="4" stroke-linecap="round"/>` : ""}
      <text x="${cx}" y="${floorY + 28}" text-anchor="middle" font-size="13" fill="var(--g-ink)">広さ ×${m.c.toFixed(2)}</text>
      <text x="${cx}" y="${floorY + 44}" text-anchor="middle" font-size="13" fill="var(--g-ink)">出口 ×${m.g.toFixed(2)}</text>
      <path d="M${R + 4} ${wy} L${xs(t)} ${wy}" stroke="${edge}" stroke-width="1.6" stroke-dasharray="4 4" marker-end="url(#arrow-${kind})"/>
    </g>`;
  };
  const ticks = [0, 5, 10, 15, 20, 25].filter((v) => v <= top);
  return `<svg viewBox="0 0 ${W} ${H}" class="graph-svg tank" role="img" aria-label="水槽のたとえと膜電位のグラフ：${labels.a}と${labels.b}">
    <defs>
      <marker id="arrow-A" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--g-soft)"/></marker>
      <marker id="arrow-B" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--g-accent)"/></marker>
    </defs>
    <rect x="8" y="${floorY}" width="${GL - 30}" height="8" rx="3" fill="var(--g-steel-dark)"/>
    <text x="12" y="${H - 4}" font-size="12" fill="var(--g-soft)">床＝静止時の電位 ${REST_MV} mV（電池）　広さ＝容量　出口＝通りやすさ</text>
    ${tank(110, a, labels.a, "A")}${tank(270, b, labels.b, "B")}
    <rect x="${xs(0)}" y="${T}" width="${xs(PULSE_MS) - xs(0)}" height="${floorY - T}" fill="var(--g-band)"/>
    ${ticks.map((v) => `<line x1="${GL}" x2="${GR}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--g-line)"/><text x="${GR}" y="${ys(v) - 3}" font-size="12" text-anchor="end" fill="var(--g-soft)">${REST_MV + v} mV</text>`).join("")}
    ${[0, 100, 200].map((ms) => `<text x="${xs(ms)}" y="${floorY + 18}" font-size="12.5" text-anchor="middle" fill="var(--g-soft)">${ms}</text>`).join("")}
    <text x="${GR}" y="${floorY + 36}" font-size="12.5" text-anchor="end" fill="var(--g-soft)">流し始めからのミリ秒 →</text>
    <text x="${GR}" y="${H - 4}" font-size="12" text-anchor="end" fill="var(--g-soft)">色の帯＝電流を入れている100ミリ秒</text>
    <polyline points="${line(a)}" fill="none" stroke="var(--g-soft)" stroke-width="2.2" stroke-dasharray="6 4"/>
    <polyline points="${line(b)}" fill="none" stroke="var(--g-accent)" stroke-width="3"/>
    ${(opts.marks ?? []).map((ms) => `<path d="M${xs(ms) - 5} ${T - 8} h10 l-5 7 z" fill="var(--g-warn)"/>`).join("")}
    <line x1="${xs(t)}" x2="${xs(t)}" y1="${T}" y2="${floorY}" stroke="var(--g-warn)" stroke-width="1.8"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(a, t))}" r="5" fill="var(--g-panel)" stroke="var(--g-soft)" stroke-width="2.5"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(b, t))}" r="5.5" fill="var(--g-accent)"/>
  </svg>`;
}

// ---------- v12：影武者のクッション（謎1 なぜ？） ----------
/** 影武者のクッション（その説明が正しいとしたときのB）。色は説明ごと、点線の輪郭で「影」と分かるように描く */
export function ghostPuckSvg(color: string, smashed: boolean): string {
  if (smashed)
    return `<svg viewBox="0 0 120 54" class="ghost-puck smashed" aria-hidden="true">
      ${[
        [14, 30, -18],
        [38, 40, 12],
        [62, 26, -6],
        [84, 42, 22],
        [100, 30, -14],
      ]
        .map(([x, y, r]) => `<path class="shard" d="M${x} ${y} l12 -6 l6 10 l-14 4 z" fill="${color}" opacity="0.55" transform="rotate(${r} ${x} ${y})"/>`)
        .join("")}
    </svg>`;
  return `<svg viewBox="0 0 120 54" class="ghost-puck" aria-hidden="true">
    <path d="M14 18 V38 A46 10 0 0 0 106 38 V18 Z" fill="${color}" opacity="0.22" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>
    <ellipse cx="60" cy="18" rx="46" ry="10" fill="${color}" opacity="0.32" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>
    <circle cx="46" cy="16" r="2.6" fill="${color}"/><circle cx="74" cy="16" r="2.6" fill="${color}"/>
  </svg>`;
}

// ---------- v12：橋（回路のスライダー） ----------
/** 回路図：C∞ と「C1 と R の並列」を直列。C1 の極板の幅と R のぎざぎざの長さをスライダーの値に合わせる */
export function bridgeCircuitSvg(r: number, c1: number): string {
  const plate = Math.max(16, Math.min(64, 26 * c1));
  const zz = Math.max(30, Math.min(120, 26 * r));
  const n = 6;
  const zx0 = 250 - zz / 2;
  const zig = Array.from({ length: n }, (_, i) => `l${zz / n / 2} ${i % 2 ? 8 : -8} l${zz / n / 2} ${i % 2 ? -8 : 8}`).join(" ");
  return `<svg viewBox="0 0 400 150" class="graph-svg" role="img" aria-label="回路図：コンデンサC∞と、コンデンサC1と抵抗Rの並列を直列につないだ回路">
    <g stroke="var(--g-ink)" stroke-width="2.5" fill="none">
      <path d="M20 75 H70"/><path d="M70 55 V95"/><path d="M82 55 V95"/><path d="M82 75 H150"/>
      <path d="M150 40 V110"/><path d="M150 40 H${250 - plate / 2 - 4}"/><path d="M${250 + plate / 2 + 4} 40 H350"/>
      <path d="M${250 - 6} ${40 - plate / 2} V${40 + plate / 2}" stroke="var(--relax)" stroke-width="4"/><path d="M${250 + 6} ${40 - plate / 2} V${40 + plate / 2}" stroke="var(--relax)" stroke-width="4"/>
      <path d="M150 110 H${zx0}"/><path d="M${zx0} 110 ${zig}" stroke="var(--g-warn)" stroke-width="3"/><path d="M${zx0 + zz} 110 H350"/>
      <path d="M350 40 V110"/><path d="M350 75 H385"/>
    </g>
    <text x="76" y="118" text-anchor="middle" font-size="12" fill="var(--g-soft)">C∞（固定）</text>
    <text x="250" y="${40 - plate / 2 - 6}" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--relax)">C1 ${c1.toFixed(2)}</text>
    <text x="250" y="138" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--g-warn)">R ${r.toFixed(2)}</text>
  </svg>`;
}

/** 橋のグラフ：Bの押し返す力（線）と、あなたの回路の電圧（丸）を同じ目盛りで重ねる（割らずに描く） */
export function bridgeGraphSvg(pts: readonly { t: number; force: number; volt: number }[], pushSeconds: number, overlap: boolean): string {
  const W = 760;
  const H = 280;
  const L = 48;
  const R = 12;
  const T = 14;
  const B = 34;
  const tMax = pts[pts.length - 1]!.t;
  const yMax = Math.max(2.2, ...pts.map((p) => Math.max(p.force, p.volt) + 0.15));
  // 押している間を横に広げる（全体の 1/5）
  const xPush = L + (W - L - R) * 0.2;
  const xs = (t: number) => (t <= pushSeconds ? L + ((xPush - L) * t) / pushSeconds : xPush + ((W - R - xPush) * (t - pushSeconds)) / (tMax - pushSeconds));
  const ys = (v: number) => T + (H - T - B) * (1 - v / yMax);
  const poly = (k: "force" | "volt") => pts.map((p) => `${xs(p.t).toFixed(1)},${ys(p[k]).toFixed(1)}`).join(" ");
  const dots = pts.filter((_, i) => i % 6 === 0).map((p) => `<circle cx="${xs(p.t).toFixed(1)}" cy="${ys(p.volt).toFixed(1)}" r="3.6" fill="var(--g-warn)"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="graph-svg" role="img" aria-label="Bの押し返す力と、回路の電圧">
    <rect x="${L}" y="${T}" width="${xPush - L}" height="${H - T - B}" fill="var(--g-band)"/>
    <text x="${L + 4}" y="${T + 16}" font-size="13" fill="var(--g-soft)">押す／電流を流す（${pushSeconds}秒・横に拡大）</text>
    ${[0, 0.5, 1, 1.5, 2, 2.5, 3].filter((v) => v <= yMax).map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--g-line)"/><text x="${L - 6}" y="${ys(v) + 4}" font-size="13" text-anchor="end" fill="var(--g-soft)">${v}</text>`).join("")}
    ${[0, 5, 10, 15, 20].map((h) => `<text x="${xs(pushSeconds + h)}" y="${H - 16}" font-size="13" text-anchor="middle" fill="var(--g-soft)">${h}</text>`).join("")}
    <text x="${W - R}" y="${H - 1}" font-size="13" text-anchor="end" fill="var(--g-soft)">押し終わり（電流を止めて）からの秒 →</text>
    <polyline points="${poly("force")}" fill="none" stroke="var(--g-accent)" stroke-width="${overlap ? 5 : 3}" opacity="${overlap ? 0.55 : 1}"/>
    <polyline points="${poly("volt")}" fill="none" stroke="var(--g-warn)" stroke-width="1.6" stroke-dasharray="3 4"/>
    ${dots}
  </svg>`;
}
