// 新しい画面の絵（舞台の SVG）。どの絵も、渡された計算値・記録から描く（隠れた答えは受け取らない）。
import { BASE_MEM, deltaMv, PULSE_MS, RECORD_MS, REST_MV, type Membrane } from "../../server/model/membraneGame.js";
import { BEAT_S, steadyBeat, type Vessel } from "../../server/model/vessel.js";

export type Mood = "calm" | "smug" | "sweat" | "shock" | "scan" | "down";

/** 検査ロボ KENSA-07（定型ルールで動く。AIではない） */
export function robotArt(mood: Mood, x: number, y: number, s = 1): string {
  const eyes =
    mood === "shock"
      ? `<circle cx="10" cy="124" r="22" fill="var(--bot)"/><circle cx="90" cy="124" r="22" fill="var(--bot)"/><circle cx="10" cy="124" r="8" fill="var(--screen)"/><circle cx="90" cy="124" r="8" fill="var(--screen)"/>`
      : mood === "smug"
        ? `<path d="M-8 128 q18 -20 36 0" stroke="var(--bot)" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M72 128 q18 -20 36 0" stroke="var(--bot)" stroke-width="9" fill="none" stroke-linecap="round"/>`
        : mood === "scan"
          ? `<rect x="-14" y="116" width="128" height="16" rx="8" fill="var(--you)"/>`
          : mood === "down"
            ? `<path d="M-6 120 l32 10 M74 130 l32 -10" stroke="var(--bot)" stroke-width="9" stroke-linecap="round"/>`
            : `<rect x="0" y="104" width="20" height="40" rx="10" fill="var(--bot)"/><rect x="80" y="104" width="20" height="40" rx="10" fill="var(--bot)"/>`;
  const sweat = mood === "sweat" || mood === "shock" || mood === "down" ? `<path d="M152 70 q16 14 4 32 q-14 -8 -4 -32z" fill="#8fd3ff"/>` : "";
  const mouth = mood === "smug" ? `<path d="M30 160 q20 12 40 0" stroke="var(--bot)" stroke-width="6" fill="none" stroke-linecap="round"/>` : mood === "down" || mood === "shock" ? `<rect x="36" y="154" width="28" height="14" rx="7" fill="var(--bot)"/>` : "";
  return `<g class="robot ${mood}" transform="translate(${x},${y}) scale(${s})">
    <rect x="40" y="0" width="12" height="40" fill="var(--bot)"/><circle class="ant" cx="46" cy="0" r="10" fill="var(--bot)"/>
    <rect x="-60" y="40" width="220" height="190" rx="36" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="5"/>
    <rect x="-36" y="66" width="172" height="120" rx="22" fill="var(--screen)"/>
    ${eyes}${mouth}${sweat}
    <rect x="-30" y="236" width="160" height="150" rx="24" fill="var(--metal-2)" stroke="var(--metal-edge)" stroke-width="5"/>
    <rect x="0" y="262" width="100" height="40" rx="8" fill="var(--screen)"/><text x="50" y="290" fill="var(--bot)" font-size="20" font-weight="900" text-anchor="middle">07</text>
  </g>`;
}

/** 検査規則のカード（Papers, Please の規則書・Baba Is You の見える規則） */
export function ruleCard(x: number, y: number, title: string, lines: string[], hot: number | null, revised: boolean): string {
  const h = 52 + lines.length * 30;
  return `<g transform="translate(${x},${y}) rotate(-2)">
    <rect width="300" height="${h}" rx="10" fill="var(--paper)"/>
    <text x="16" y="30" fill="var(--paper-soft)" font-size="14" font-weight="900">${title}</text>
    ${lines.map((l, i) => `<text x="16" y="${62 + i * 30}" fill="${i === hot ? "var(--stamp)" : "var(--paper-ink)"}" font-size="16.5" font-weight="900">${l}</text>`).join("")}
    ${revised ? `<g class="pop" transform="translate(196,${h - 46}) rotate(-12)"><rect width="92" height="34" rx="5" fill="none" stroke="var(--stamp)" stroke-width="3"/><text x="46" y="24" fill="var(--stamp)" font-size="16" font-weight="900" text-anchor="middle">改訂</text></g>` : ""}
  </g>`;
}

/** ロボの証言の吹き出し */
export function bubble(x: number, y: number, label: string, l1: string, l2 = "", w = 400): string {
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${l2 ? 120 : 92}" rx="18" fill="var(--paper)"/><path d="M${w} 46 l30 10 l-30 14z" fill="var(--paper)"/>
    <text x="22" y="32" fill="var(--paper-soft)" font-size="14" font-weight="900">${label}</text>
    <text x="22" y="70" fill="var(--paper-ink)" font-size="23" font-weight="900">${l1}</text>
    ${l2 ? `<text x="22" y="102" fill="var(--paper-ink)" font-size="23" font-weight="900">${l2}</text>` : ""}
  </g>`;
}

function bone(x1: number, y1: number, x2: number, y2: number, w: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--bone-edge)" stroke-width="${w + 6}" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--bone)" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** 試験脚とクッション（走行テスト）。dent は沈み込み（深さ1に対する割合） */
export function legsStage(o: { dentA: number; dentB: number; contact: boolean; impact: boolean; labelA: string; labelB: string; diff: number | null; hot: boolean; x0?: number; y0?: number; scale?: number }): string {
  // 膝の試験機：太ももの骨（上・試験機が体重にあたる力をかける）とすねの骨（下・固定）の間に、人工の膝クッションをはさむ。
  // 沈み込み（試験台で押す深さを1とした割合）だけ、クッションが薄くなり、太ももの骨が下がる。地面や床を踏む絵ではない。
  const y0 = o.y0 ?? 0;
  const x0 = o.x0 ?? 0;
  const lane = (cx: number, label: string, dent: number, kind: "A" | "B") => {
    const d = Math.max(-0.05, Math.min(1.3, dent));
    const plateau = 360; // すねの骨の上の面
    const thick = 64 - 38 * d; // クッションの厚み
    const top = plateau - thick;
    const bulge = 10 + 26 * Math.max(0, d);
    const col = kind === "A" ? "var(--pad-a)" : "var(--pad-b)";
    const edge = kind === "A" ? "var(--pad-a-edge)" : "var(--pad-b-edge)";
    const femurBottom = top - 2;
    return `<g>
      <text x="${cx - 150}" y="108" fill="var(--ink)" font-size="19" font-weight="900">${label}</text>
      <!-- 試験機の押し棒（体重にあたる力） -->
      <text x="${cx - 26}" y="140" fill="var(--soft)" font-size="12" text-anchor="end">試験機の押し棒</text>
      <rect x="${cx - 16}" y="118" width="32" height="${Math.max(10, femurBottom - 150 - 118)}" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
      ${o.contact ? `<path d="M${cx + 34} 128 v40 m-12 -12 l12 12 l12 -12" stroke="var(--bot)" stroke-width="5" fill="none" stroke-linecap="round"/><text x="${cx + 52}" y="152" fill="var(--bot)" font-size="13" font-weight="900">体重にあたる力</text>` : ""}
      <!-- 太ももの骨 -->
      <path d="M${cx - 22} ${femurBottom - 150} V${femurBottom - 46} C ${cx - 22} ${femurBottom - 30}, ${cx - 78} ${femurBottom - 34}, ${cx - 78} ${femurBottom - 12} C ${cx - 78} ${femurBottom + 2}, ${cx - 40} ${femurBottom + 2}, ${cx} ${femurBottom - 4} C ${cx + 40} ${femurBottom + 2}, ${cx + 78} ${femurBottom + 2}, ${cx + 78} ${femurBottom - 12} C ${cx + 78} ${femurBottom - 34}, ${cx + 22} ${femurBottom - 30}, ${cx + 22} ${femurBottom - 46} V${femurBottom - 150} Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="3"/>
      <text x="${cx - 100}" y="${femurBottom - 80}" fill="var(--soft)" font-size="13" text-anchor="end">太ももの骨</text>
      <!-- 人工の膝クッション -->
      <path d="M${cx - 70 - bulge / 2} ${top + 6} Q ${cx - 70 - bulge} ${(top + plateau) / 2} ${cx - 70 - bulge / 2} ${plateau - 4} L ${cx + 70 + bulge / 2} ${plateau - 4} Q ${cx + 70 + bulge} ${(top + plateau) / 2} ${cx + 70 + bulge / 2} ${top + 6} Z" fill="${col}" stroke="${edge}" stroke-width="3"/>
      <path d="M${cx - 70 - bulge / 2} ${top + 6} Q ${cx - 70 - bulge} ${(top + plateau) / 2} ${cx - 70 - bulge / 2} ${plateau - 4} L ${cx + 70 + bulge / 2} ${plateau - 4} Q ${cx + 70 + bulge} ${(top + plateau) / 2} ${cx + 70 + bulge / 2} ${top + 6} Z" fill="url(#hex-${kind})" opacity=".55"/>
      <text x="${cx + 100}" y="${(top + plateau) / 2 + 5}" fill="var(--soft)" font-size="13">人工の膝クッション</text>
      ${o.impact ? `<g class="impact" stroke="var(--gold)" stroke-width="5" stroke-linecap="round"><path d="M${cx - 96 - bulge} ${(top + plateau) / 2} l-20 0"/><path d="M${cx - 92 - bulge} ${top} l-16 -10"/></g>` : ""}
      <!-- すねの骨（下で固定） -->
      <path d="M${cx - 84} ${plateau} H${cx + 84} C ${cx + 84} ${plateau + 22}, ${cx + 26} ${plateau + 26}, ${cx + 24} ${plateau + 44} V${plateau + 76} H${cx - 24} V${plateau + 44} C ${cx - 26} ${plateau + 26}, ${cx - 84} ${plateau + 22}, ${cx - 84} ${plateau} Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="3"/>
      <rect x="${cx - 60}" y="${plateau + 76}" width="120" height="14" rx="4" fill="var(--metal-edge)"/>
      <text x="${cx - 100}" y="${plateau + 56}" fill="var(--soft)" font-size="13" text-anchor="end">すねの骨（固定）</text>
      <text x="${cx + 150}" y="${plateau + 40}" fill="var(--ink)" font-size="24" font-weight="900" font-variant-numeric="tabular-nums">${dent.toFixed(2)}</text>
      <text x="${cx + 150}" y="${plateau + 58}" fill="var(--soft)" font-size="12">沈み込み</text>
    </g>`;
  };
  const pat = (id: string, c: string) => `<pattern id="${id}" width="18" height="15.6" patternUnits="userSpaceOnUse"><path d="M4.5 0 h9 l4.5 7.8 l-4.5 7.8 h-9 l-4.5 -7.8z" fill="none" stroke="${c}" stroke-width="1.2"/></pattern>`;
  return `<g transform="translate(${x0},${y0}) scale(${o.scale ?? 1})">
    <defs>${pat("hex-A", "var(--pad-a-edge)")}${pat("hex-B", "var(--pad-b-edge)")}</defs>
    <rect x="150" y="104" width="760" height="16" rx="6" fill="var(--metal)"/>
    <text x="545" y="470" fill="var(--soft)" font-size="13" text-anchor="middle">膝の試験機（骨は模型）：歩く・走るときの体重を、一歩ごとにかける。地面ではなく、膝の中のクッションを調べる</text>
    ${lane(330, o.labelA, o.dentA, "A")}${lane(760, o.labelB, o.dentB, "B")}
    ${o.diff !== null ? `<g transform="translate(470,200)"><rect width="140" height="40" rx="20" fill="${o.hot ? "var(--stamp)" : "var(--chip)"}"/><text x="70" y="27" fill="${o.hot ? "#fff" : "var(--ink)"}" font-size="18" font-weight="900" text-anchor="middle" font-variant-numeric="tabular-nums">差 ${o.diff >= 0 ? "+" : "−"}${Math.abs(o.diff).toFixed(3)}</text></g>` : ""}
  </g>`;
}

/** 拍の列（リズム天国型）。各拍の丸は、その一歩で差がいちばん大きい点の差を色で示す */
export function beatLane(x: number, y: number, notes: { shown: boolean; hot: boolean; sel: boolean; shot: boolean }[], now: number | null): string {
  const w = 980;
  const gap = w / notes.length;
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="70" rx="35" fill="var(--panel)" stroke="var(--line)" stroke-width="3"/>
    ${notes
      .map((n, i) => {
        const cx = gap / 2 + i * gap;
        const fill = !n.shown ? "var(--line)" : n.hot ? "var(--stamp)" : "var(--you)";
        return `<g class="note ${n.shown ? "hit" : ""}" data-act="note" data-val="${i}" role="button" aria-label="${i + 1}歩目">
          <circle cx="${cx}" cy="35" r="${n.shown ? 19 : 12}" fill="${fill}"/>
          ${n.shown ? `<text x="${cx}" y="41" fill="var(--on-you)" font-size="14" font-weight="900" text-anchor="middle">${i + 1}</text>` : ""}
          ${n.sel ? `<rect x="${cx - 32}" y="-6" width="64" height="82" rx="14" fill="none" stroke="var(--gold)" stroke-width="4"/>` : ""}
          ${n.shot ? `<text x="${cx}" y="98" fill="var(--gold)" font-size="13" font-weight="900" text-anchor="middle">証拠</text>` : ""}
        </g>`;
      })
      .join("")}
    ${now !== null ? `<rect x="${gap / 2 + now * gap - 4}" y="-10" width="8" height="90" rx="4" fill="var(--gold)" opacity=".85"/>` : ""}
  </g>`;
}

/** 小さな曲線（影武者の札・力の記録）：Bの記録の点と、説明の線。押している間は横に広げる */
export function miniGraph(o: { b: readonly { t: number; force: number }[]; line?: readonly { t: number; force: number }[]; lineColor?: string; a?: readonly { t: number; force: number }[]; push: number; yMax: number; w: number; h: number; until?: number }): string {
  const L = 8;
  const R = 6;
  const T = 8;
  const B = 8;
  const tMax = o.push + 20;
  const xPush = L + (o.w - L - R) * 0.18;
  const xs = (t: number) => (t <= o.push ? L + ((xPush - L) * t) / o.push : xPush + ((o.w - R - xPush) * (t - o.push)) / (tMax - o.push));
  const ys = (v: number) => T + (o.h - T - B) * (1 - v / o.yMax);
  const until = o.until ?? 99;
  const poly = (pts: readonly { t: number; force: number }[]) =>
    [{ t: 0, force: 0 }, ...pts]
      .filter((p) => p.t <= until + 1e-9)
      .map((p) => `${xs(p.t).toFixed(1)},${ys(p.force).toFixed(1)}`)
      .join(" ");
  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="mini" aria-hidden="true">
    <rect x="${L}" y="${T}" width="${xPush - L}" height="${o.h - T - B}" fill="var(--band)"/>
    ${o.a ? `<polyline points="${poly(o.a)}" fill="none" stroke="var(--soft)" stroke-width="2" stroke-dasharray="5 4"/>` : ""}
    ${o.line ? `<polyline points="${poly(o.line)}" fill="none" stroke="${o.lineColor ?? "var(--gold)"}" stroke-width="3.5" stroke-dasharray="9 5"/>` : ""}
    ${o.b
      .filter((p) => p.t <= until + 1e-9)
      .map((p, i) => (i % 2 === 0 ? `<circle cx="${xs(p.t).toFixed(1)}" cy="${ys(p.force).toFixed(1)}" r="3.6" fill="var(--you)"/>` : ""))
      .join("")}
  </svg>`;
}

/** 影武者の姿（点線の輪郭のクッション） */
export function ghostPuck(color: string, broken: boolean): string {
  if (broken)
    return `<svg viewBox="0 0 200 80" class="puck broken" aria-hidden="true">${[
      [30, 40, -18],
      [70, 52, 12],
      [104, 30, -6],
      [140, 56, 22],
      [170, 36, -14],
    ]
      .map(([x, y, r]) => `<path class="shard" d="M${x} ${y} l22 -8 l9 16 l-24 7z" fill="${color}" opacity=".7" transform="rotate(${r} ${x} ${y})"/>`)
      .join("")}</svg>`;
  return `<svg viewBox="0 0 200 80" class="puck" aria-hidden="true">
    <path d="M20 26 V54 A80 16 0 0 0 180 54 V26 Z" fill="${color}" opacity=".22" stroke="${color}" stroke-width="3" stroke-dasharray="8 6"/>
    <ellipse cx="100" cy="26" rx="80" ry="16" fill="${color}" opacity=".35" stroke="${color}" stroke-width="3" stroke-dasharray="8 6"/>
    <circle cx="80" cy="24" r="5" fill="${color}"/><circle cx="120" cy="24" r="5" fill="${color}"/>
  </svg>`;
}

// ---------- 事件3：模擬循環回路 ----------
/** 心臓ポンプと二本の人工血管。血管の太さは、ふくらんで受け止めている血の量（C × 圧の上がり分）から描く */
export function loopStage(o: { u: number; a: Vessel; b: Vessel; pa: number; pb: number; minA: number; minB: number; flow: number }): string {
  const beatPhase = o.u / BEAT_S;
  const squeeze = o.flow > 1 ? 1 - Math.min(0.18, o.flow / 2000) : 1;
  const tube = (y: number, m: Vessel, p: number, pMin: number, label: string, kind: "A" | "B") => {
    const vol = m.c * (p - pMin); // mL
    const bulge = 10 + vol * 0.55;
    const col = kind === "A" ? "var(--pad-a)" : "var(--vessel)";
    const edge = kind === "A" ? "var(--pad-a-edge)" : "var(--vessel-edge)";
    return `<g>
      <text x="300" y="${y - bulge - 14}" fill="var(--ink)" font-size="18" font-weight="900">${label}</text>
      <path d="M260 ${y - 12} C 380 ${y - bulge}, 560 ${y - bulge}, 690 ${y - 12} L690 ${y + 12} C 560 ${y + bulge}, 380 ${y + bulge}, 260 ${y + 12} Z" fill="${col}" stroke="${edge}" stroke-width="4"/>
      <path d="M690 ${y - 6} h70 q20 0 20 20 v40" stroke="${edge}" stroke-width="6" fill="none"/>
      ${[0, 1, 2, 3].map((k) => `<path d="M780 ${y + 60 + k * 10} h${-10 + (k % 2) * 20}" stroke="${edge}" stroke-width="3"/>`).join("")}
      <text x="800" y="${y + 70}" fill="var(--soft)" font-size="13">末梢（流れにくさ）</text>
      <g transform="translate(900,${y})">
        <circle r="46" fill="var(--panel)" stroke="var(--line)" stroke-width="4"/>
        ${[0, 50, 100, 150].map((v) => { const a = (-210 + (v / 150) * 240) * (Math.PI / 180); return `<line x1="${36 * Math.cos(a)}" y1="${36 * Math.sin(a)}" x2="${44 * Math.cos(a)}" y2="${44 * Math.sin(a)}" stroke="var(--soft)" stroke-width="2"/>`; }).join("")}
        <line x1="0" y1="0" x2="${36 * Math.cos(((-210 + (p / 150) * 240) * Math.PI) / 180)}" y2="${36 * Math.sin(((-210 + (p / 150) * 240) * Math.PI) / 180)}" stroke="var(--stamp)" stroke-width="4" stroke-linecap="round"/>
        <circle r="5" fill="var(--ink)"/>
        <text x="60" y="8" fill="var(--ink)" font-size="22" font-weight="900" font-variant-numeric="tabular-nums">${p.toFixed(0)}</text>
        <text x="60" y="26" fill="var(--soft)" font-size="12">mmHg</text>
      </g>
    </g>`;
  };
  return `<g>
    <g transform="translate(150,280) scale(${squeeze})">
      <path d="M0 -60 C -60 -110, -120 -40, -60 20 L0 80 L60 20 C 120 -40, 60 -110, 0 -60Z" fill="var(--heart)" stroke="var(--heart-edge)" stroke-width="5"/>
      <text y="10" fill="#fff" font-size="16" font-weight="900" text-anchor="middle">ポンプ</text>
    </g>
    <path d="M200 250 C 230 200, 240 190, 262 190 M200 310 C 230 360, 240 370, 262 370" stroke="var(--heart-edge)" stroke-width="10" fill="none"/>
    ${tube(190, o.a, o.pa, o.minA, "見本の血管 A", "A")}${tube(370, o.b, o.pb, o.minB, "新しい血管 B", "B")}
    <text x="150" y="400" fill="var(--soft)" font-size="13" text-anchor="middle">一拍 ${BEAT_S} 秒（${(beatPhase * 100).toFixed(0)}%）</text>
  </g>`;
}

/** 一拍の圧の波形（A点線・B線）と、今の時刻 */
export function beatChart(x: number, y: number, w: number, h: number, a: Vessel, b: Vessel, u: number, marks: number[]): string {
  const pa = steadyBeat(a, 200);
  const pb = steadyBeat(b, 200);
  const lo = 50;
  const hi = 130;
  const xs = (i: number) => (w * i) / (pa.length - 1);
  const ys = (p: number) => h * (1 - (p - lo) / (hi - lo));
  const poly = (ps: number[]) => ps.map((p, i) => `${xs(i).toFixed(1)},${ys(p).toFixed(1)}`).join(" ");
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" rx="8" fill="var(--panel)" stroke="var(--line)"/>
    ${[60, 80, 100, 120].map((p) => `<line x1="0" x2="${w}" y1="${ys(p)}" y2="${ys(p)}" stroke="var(--line)"/><text x="${w - 4}" y="${ys(p) - 3}" fill="var(--soft)" font-size="11" text-anchor="end">${p}</text>`).join("")}
    <polyline points="${poly(pa)}" fill="none" stroke="var(--soft)" stroke-width="2.5" stroke-dasharray="6 4"/>
    <polyline points="${poly(pb)}" fill="none" stroke="var(--vessel-edge)" stroke-width="3.5"/>
    ${marks.map((m) => `<path d="M${(w * m) / BEAT_S - 6} -2 h12 l-6 8z" fill="var(--gold)"/>`).join("")}
    <line x1="${(w * u) / BEAT_S}" x2="${(w * u) / BEAT_S}" y1="0" y2="${h}" stroke="var(--gold)" stroke-width="2.5"/>
    <text x="0" y="${h + 16}" fill="var(--soft)" font-size="12">一拍の圧（mmHg）　点線＝A、線＝B</text>
  </g>`;
}

/** 心臓＝電流源、血管のやわらかさ＝コンデンサ、末梢＝抵抗（膜の等価回路と同じ形） */
export function heartCircuit(x: number, y: number, r: number, c: number, labels: { src: string; cap: string; res: string; bat?: string } = { src: "心臓ポンプ＝電流源", cap: "血管のやわらかさ＝コンデンサ C", res: "末梢の流れにくさ＝抵抗 R" }): string {
  const plate = Math.max(18, Math.min(80, 28 * c));
  const zz = Math.max(40, Math.min(120, 60 * r));
  const zig = Array.from({ length: 6 }, (_, i) => `l${zz / 12} ${i % 2 ? 9 : -9} l${zz / 12} ${i % 2 ? -9 : 9}`).join(" ");
  return `<g transform="translate(${x},${y})" stroke-linecap="round">
    <g stroke="var(--ink)" stroke-width="3" fill="none">
      <path d="M40 20 H360 M40 200 H360 M40 20 V80 M40 140 V200 M200 20 V${110 - 10} M200 ${110 + 10} V200 M360 20 V${110 - zz / 2} M360 ${110 + zz / 2} V${labels.bat ? 166 : 200}${labels.bat ? " M360 182 V200" : ""}"/>
    </g>
    ${labels.bat ? `<path d="M340 166 H380 M350 182 H370" stroke="var(--gold)" stroke-width="5"/><text x="390" y="170" fill="var(--gold)" font-size="13" font-weight="900">${labels.bat}</text>` : ""}
    <circle cx="40" cy="110" r="30" fill="${labels.bat ? "var(--membrane-edge)" : "var(--heart)"}" stroke="${labels.bat ? "var(--membrane)" : "var(--heart-edge)"}" stroke-width="3"/><path d="M40 128 V92 m-8 8 l8 -8 l8 8" stroke="#fff" stroke-width="3" fill="none"/>
    <path d="M${200 - plate / 2} 100 H${200 + plate / 2} M${200 - plate / 2} 120 H${200 + plate / 2}" stroke="var(--you)" stroke-width="6"/>
    <path d="M360 ${110 - zz / 2} ${zig.replace(/l([\d.]+) (-?[\d.]+)/g, (_m, a, b) => `l${b} ${a}`)}" stroke="var(--bot)" stroke-width="3.5" fill="none"/>
    <text x="0" y="236" fill="${labels.bat ? "var(--membrane-edge)" : "var(--heart-edge)"}" font-size="14" font-weight="900">${labels.src}</text>
    <text x="200" y="260" fill="var(--you)" font-size="14" font-weight="900" text-anchor="middle">${labels.cap}</text>
    <text x="400" y="236" fill="var(--bot)" font-size="14" font-weight="900" text-anchor="end">${labels.res}</text>
  </g>`;
}

/** 同調のグラフ：血管Bの圧（線）と、あなたの回路の電圧（丸）を同じ目盛りで */
export function syncChart(x: number, y: number, w: number, h: number, target: Vessel, mine: Vessel, both: boolean): string {
  const pt = steadyBeat(target, 160);
  const pm = steadyBeat(mine, 160);
  const all = [...pt, ...pm];
  const lo = Math.min(40, ...all) - 4;
  const hi = Math.max(140, ...all) + 4;
  const xs = (i: number) => (w * i) / (pt.length - 1);
  const ys = (p: number) => h * (1 - (p - lo) / (hi - lo));
  const loop = (ps: number[]) => [...ps, ...ps.slice(1)].map((p, i) => `${((w / 2) * i / (ps.length - 1)).toFixed(1)},${ys(p).toFixed(1)}`).join(" ");
  void xs;
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" rx="10" fill="var(--panel)" stroke="var(--line)"/>
    ${[60, 80, 100, 120].map((p) => `<line x1="0" x2="${w}" y1="${ys(p)}" y2="${ys(p)}" stroke="var(--line)"/><text x="6" y="${ys(p) - 3}" fill="var(--soft)" font-size="11">${p}</text>`).join("")}
    <polyline points="${loop(pt)}" fill="none" stroke="var(--vessel-edge)" stroke-width="${both ? 7 : 4}" opacity="${both ? 0.6 : 1}"/>
    ${[...pm, ...pm.slice(1)].filter((_, i) => i % 8 === 0).map((p, k) => `<circle cx="${((w / 2) * (k * 8)) / (pm.length - 1)}" cy="${ys(p)}" r="4" fill="var(--bot)"/>`).join("")}
    <text x="${w - 6}" y="${h + 18}" fill="var(--soft)" font-size="12" text-anchor="end">二拍ぶん　線＝血管Bの圧（mmHg）　丸＝あなたの回路の電圧</text>
  </g>`;
}

// ---------- 事件4：膜の水槽 ----------
export function tankStage(a: Membrane, b: Membrane, t: number, labels: { a: string; b: string }, top = 14): string {
  const floorY = 420;
  const T = 120;
  const ys = (dv: number) => floorY - ((floorY - T) * Math.max(0, Math.min(top, dv))) / top;
  const GL = 600;
  const GR = 1180;
  const xs = (ms: number) => GL + ((GR - GL) * ms) / RECORD_MS;
  const line = (m: Membrane) => {
    const pts: string[] = [];
    for (let ms = 0; ms <= RECORD_MS; ms += 2) pts.push(`${xs(ms).toFixed(1)},${ys(deltaMv(m, ms)).toFixed(1)}`);
    return pts.join(" ");
  };
  const flowing = t <= PULSE_MS;
  const tank = (cx: number, m: Membrane, label: string, kind: "A" | "B") => {
    const w = Math.max(40, Math.min(200, 80 * m.c));
    const L = cx - w / 2;
    const R = cx + w / 2;
    const dv = deltaMv(m, t);
    const wy = ys(dv);
    const door = Math.max(6, Math.min(40, 16 * m.g));
    const out = Math.min(18, 1.4 * m.g * dv);
    const edge = kind === "A" ? "var(--soft)" : "var(--you)";
    return `<g>
      <text x="${cx}" y="${T - 34}" text-anchor="middle" fill="var(--ink)" font-size="18" font-weight="900">${label}</text>
      <rect x="${L}" y="${wy}" width="${w}" height="${floorY - wy}" fill="var(--water)"/>
      <line x1="${L}" x2="${R}" y1="${wy}" y2="${wy}" stroke="var(--water-edge)" stroke-width="3"/>
      <path d="M${L} ${T - 10} V${floorY} H${R} V${floorY - door}" fill="none" stroke="${edge}" stroke-width="4"/>
      <path d="M${R} ${floorY - door - 6} V${T - 10}" fill="none" stroke="${edge}" stroke-width="4"/>
      ${out > 0.5 ? `<path d="M${R + 4} ${floorY - door / 2} h${20 + out}" stroke="var(--water-edge)" stroke-width="${out.toFixed(1)}" stroke-linecap="round"/>` : ""}
      ${flowing ? `<path d="M${cx} ${T - 26} V${Math.max(T, wy - 2)}" stroke="var(--bot)" stroke-width="6" stroke-linecap="round"/>` : ""}
      <text x="${cx}" y="${floorY + 30}" text-anchor="middle" fill="var(--soft)" font-size="13">広さ（容量）×${m.c.toFixed(2)}　出口×${m.g.toFixed(2)}</text>
      <path d="M${R + 6} ${wy} L${xs(t) - 8} ${ys(dv)}" stroke="${edge}" stroke-width="2" stroke-dasharray="5 5"/>
    </g>`;
  };
  return `<g>
    <rect x="40" y="${floorY}" width="520" height="10" rx="3" fill="var(--metal-edge)"/>
    <text x="40" y="${floorY + 54}" fill="var(--soft)" font-size="13">水槽はたとえ：水位＝電位の上がり分、広さ＝容量、出口＝イオンの通りやすさ、床＝静止時 ${REST_MV} mV</text>
    ${tank(180, a, labels.a, "A")}${tank(420, b, labels.b, "B")}
    <rect x="${xs(0)}" y="${T}" width="${xs(PULSE_MS) - xs(0)}" height="${floorY - T}" fill="var(--band)"/>
    ${[0, 5, 10].map((v) => `<line x1="${GL}" x2="${GR}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)"/><text x="${GR}" y="${ys(v) - 4}" fill="var(--soft)" font-size="12" text-anchor="end">${REST_MV + v} mV</text>`).join("")}
    ${[0, 100, 200].map((ms) => `<text x="${xs(ms)}" y="${floorY + 22}" fill="var(--soft)" font-size="12" text-anchor="middle">${ms} ms</text>`).join("")}
    <polyline points="${line(a)}" fill="none" stroke="var(--soft)" stroke-width="2.5" stroke-dasharray="6 4"/>
    <polyline points="${line(b)}" fill="none" stroke="var(--you)" stroke-width="3.5"/>
    <line x1="${xs(t)}" x2="${xs(t)}" y1="${T}" y2="${floorY}" stroke="var(--gold)" stroke-width="2.5"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(a, t))}" r="6" fill="var(--panel)" stroke="var(--soft)" stroke-width="3"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(b, t))}" r="7" fill="var(--you)"/>
  </g>`;
}

/** 事件4：神経の全体（膝の感覚の神経の端→脳）。拡大する場所を枠で示す */
export function nerveWhole(x: number, y: number, pressed: boolean): string {
  return `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="270" height="448" rx="14" fill="var(--panel)" stroke="var(--line)"/>
    <text x="14" y="26" fill="var(--ink)" font-size="15" font-weight="900">全体：膝のまわりの神経（模式図）</text>
    <path d="M70 92 C 40 92, 38 56, 66 50 C 70 28, 110 22, 128 36 C 150 18, 196 26, 196 52 C 226 56, 224 94, 196 96 C 190 112, 150 116, 138 104 C 120 116, 84 112, 70 92 Z" fill="var(--pad-b)" stroke="var(--pad-b-edge)" stroke-width="3"/>
    <path d="M92 64 q16 -12 30 0 M134 56 q14 10 32 -2 M100 88 q20 -8 40 4" stroke="var(--pad-b-edge)" stroke-width="2" fill="none"/>
    <text x="232" y="80" fill="var(--soft)" font-size="13">脳</text>
    <path d="M178 340 C 214 270, 226 180, 162 124" stroke="var(--you)" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M150 112 l22 2 l-10 18 z" fill="var(--you)"/>
    <text x="222" y="222" fill="var(--soft)" font-size="12">神経</text>
    <text x="196" y="142" fill="var(--you)" font-size="12" font-weight="900">脳へ伝える</text>
    <rect x="98" y="210" width="34" height="96" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="2.5"/>
    <path d="M78 318 C 78 298, 152 298, 152 318 Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="2.5"/>
    <rect x="80" y="320" width="70" height="${pressed ? 10 : 14}" rx="6" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
    <path d="M76 ${pressed ? 334 : 338} H154 C 154 352, 132 356, 130 372 V420 H100 V372 C 98 356, 76 352, 76 ${pressed ? 334 : 338} Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="2.5"/>
    <text x="14" y="252" fill="var(--soft)" font-size="12">膝</text>
    ${pressed ? `<path d="M115 172 v30 m-10 -10 l10 10 l10 -10" stroke="var(--gold)" stroke-width="4" fill="none" stroke-linecap="round"/><text x="132" y="188" fill="var(--gold)" font-size="12" font-weight="900">押される</text>` : ""}
    <path d="M178 340 l-12 14 M178 340 l2 18 M178 340 l14 12" stroke="var(--you)" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g fill="var(--you)"><circle cx="166" cy="355" r="3.5"/><circle cx="180" cy="359" r="3.5"/><circle cx="192" cy="353" r="3.5"/></g>
    <rect x="156" y="318" width="44" height="44" rx="6" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-dasharray="5 4"/>
    <path d="M200 324 L270 20 M200 356 L270 440" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="4 5" opacity=".7"/>
    <text x="14" y="438" fill="var(--soft)" font-size="12">枠＝神経の端の膜（右に拡大）</text>
  </g>`;
}

/** 膜の拡大図一枚（左上が x, y。幅 490×高さ 200 を s 倍） */
export function membranePatch(x: number, y: number, s: number, m: Membrane, label: string, kind: "A" | "B", reveal: boolean, t: number): string {
  return `<g transform="translate(${x},${y}) scale(${s}) translate(-300,-18)">${patchAt(18, m, label, kind, reveal, t, t <= PULSE_MS)}</g>`;
}

function patchAt(y0: number, m: Membrane, label: string, kind: "A" | "B", reveal: boolean, t: number, flowing: boolean): string {
  const L = 300;
  const R = 790;
  const dv = deltaMv(m, t);
  const mv = REST_MV + dv;
  const cEff = reveal ? m.c : 1;
  const gEff = reveal ? m.g : 1;
  const memTop = y0 + 84;
  const memBot = y0 + 122;
  const entX = 372;
  const leaks = Math.max(1, Math.min(5, Math.round(2 * gEff)));
  const leakX = Array.from({ length: leaks }, (_, k) => 640 + k * 30 - (leaks - 1) * 15);
  const near = (xx: number) => Math.abs(xx - entX) < 22 || leakX.some((lx) => Math.abs(xx - lx) < 14);
  const heads: string[] = [];
  for (let xx = L + 22; xx <= R - 16; xx += 13) {
    if (near(xx)) continue;
    heads.push(`<circle cx="${xx}" cy="${memTop + 5}" r="5"/><circle cx="${xx}" cy="${memBot - 5}" r="5"/><path d="M${xx - 2} ${memTop + 10} v8 M${xx + 2} ${memTop + 10} v8 M${xx - 2} ${memBot - 18} v8 M${xx + 2} ${memBot - 18} v8"/>`);
  }
  const restX = Array.from({ length: 14 }, (_, k) => L + 40 + k * 32).filter((xx) => !near(xx));
  const plus = Math.max(0, Math.min(26, Math.round(0.8 * cEff * Math.max(0, dv))));
  const plusMarks = Array.from({ length: plus }, (_, k) => {
    const col = k % 13;
    const row = Math.floor(k / 13);
    return `<text x="${430 + col * 14}" y="${memBot + 30 + row * 16}" font-size="15" font-weight="900" text-anchor="middle">＋</text>`;
  }).join("");
  const out = Math.max(0, Math.min(14, 1.3 * gEff * dv));
  const edge = kind === "A" ? "var(--soft)" : "var(--you)";
  return `<g>
    <rect x="${L}" y="${y0}" width="${R - L}" height="200" rx="12" fill="var(--panel)" stroke="${edge}" stroke-width="${kind === "B" ? 2.5 : 1.5}"/>
    <text x="${L + 14}" y="${y0 + 24}" fill="var(--ink)" font-size="17" font-weight="900">${label}</text>
    <text x="${L + 26 + 18 * label.length}" y="${y0 + 24}" fill="var(--soft)" font-size="13">${reveal ? `容量 ×${m.c.toFixed(2)}　通りやすさ ×${m.g.toFixed(2)}` : "容量 ×？　通りやすさ ×？"}</text>
    <text x="${R - 14}" y="${y0 + 26}" fill="${edge}" font-size="24" font-weight="900" text-anchor="end" font-variant-numeric="tabular-nums">${mv.toFixed(1).replace("-", "−")} mV</text>
    <text x="${R - 14}" y="${y0 + 52}" fill="var(--soft)" font-size="12" text-anchor="end">細胞の外</text>
    <text x="${L + 14}" y="${y0 + 190}" fill="var(--soft)" font-size="12">細胞の中</text>
    <rect x="${L + 10}" y="${memTop}" width="${R - L - 20}" height="${memBot - memTop}" fill="var(--membrane)"/>
    <g fill="var(--membrane-edge)" stroke="var(--membrane-edge)" stroke-width="1.5">${heads.join("")}</g>
    <g fill="var(--plus)">${restX.map((xx) => `<text x="${xx}" y="${memTop - 8}" font-size="14" font-weight="900" text-anchor="middle">＋</text>`).join("")}</g>
    <g fill="var(--minus)">${restX.map((xx) => `<text x="${xx}" y="${memBot + 16}" font-size="16" font-weight="900" text-anchor="middle">−</text>`).join("")}</g>
    <g fill="var(--gold)">${plusMarks}</g>
    <!-- 入口（押されると開く） -->
    <rect x="${entX - 18}" y="${memTop - 4}" width="12" height="${memBot - memTop + 8}" rx="5" fill="var(--bot)"/>
    <rect x="${entX + 6}" y="${memTop - 4}" width="12" height="${memBot - memTop + 8}" rx="5" fill="var(--bot)"/>
    ${flowing ? `<path d="M${entX} ${memTop - 30} V${memBot + 22}" stroke="var(--gold)" stroke-width="7" stroke-linecap="round"/><path d="M${entX - 10} ${memBot + 12} l10 12 l10 -12" stroke="var(--gold)" stroke-width="5" fill="none" stroke-linecap="round"/>` : `<rect x="${entX - 8}" y="${memTop + 12}" width="16" height="${memBot - memTop - 24}" fill="var(--bot)"/>`}
    <text x="${L + 14}" y="${y0 + 46}" fill="var(--bot)" font-size="12" font-weight="900">入口（膝が押されると開く）</text>
    <!-- いつも開いている通り道 -->
    ${leakX.map((lx) => `<rect x="${lx - 9}" y="${memTop - 3}" width="6" height="${memBot - memTop + 6}" rx="3" fill="var(--leak)"/><rect x="${lx + 3}" y="${memTop - 3}" width="6" height="${memBot - memTop + 6}" rx="3" fill="var(--leak)"/>${out > 0.6 ? `<path d="M${lx} ${memBot + 14} V${memTop - 18}" stroke="var(--leak)" stroke-width="${Math.max(2, out / Math.sqrt(leaks)).toFixed(1)}" stroke-linecap="round"/><path d="M${lx - 7} ${memTop - 10} l7 -9 l7 9" stroke="var(--leak)" stroke-width="3" fill="none"/>` : ""}`).join("")}
    <text x="${leakX[leakX.length - 1]! + 22}" y="${y0 + 46}" fill="var(--leak)" font-size="12" font-weight="900" text-anchor="end">いつも開いている通り道</text>
      <text x="${leakX[leakX.length - 1]! + 22}" y="${y0 + 61}" fill="var(--leak)" font-size="11" text-anchor="end">（上がった分に比例して＋がもれる）</text>
    <text x="${R - 14}" y="${y0 + 190}" fill="var(--gold)" font-size="12" text-anchor="end">${plus > 0 ? "金の＋：入った＋のイオン（中の−を打ち消し、電位を上げる）" : ""}</text>
  </g>`;
}

/** 電位のグラフ（A＝点線、B＝実線、時刻の線）。notes で下の注を出す */
export function membraneGraph(box: { GL: number; GR: number; GT: number; GB: number }, a: Membrane, b: Membrane, t: number, o: { a: string; b: string; top?: number; notes?: boolean }): string {
  const { GL, GR, GT, GB } = box;
  const top = o.top ?? 14;
  const xs = (ms: number) => GL + ((GR - GL) * ms) / RECORD_MS;
  const ys = (d: number) => GB - ((GB - GT) * Math.max(0, Math.min(top, d))) / top;
  const line = (m: Membrane) => {
    const pts: string[] = [];
    for (let ms = 0; ms <= RECORD_MS; ms += 2) pts.push(`${xs(ms).toFixed(1)},${ys(deltaMv(m, ms)).toFixed(1)}`);
    return pts.join(" ");
  };
  return `<g>
    <rect x="${xs(0)}" y="${GT}" width="${xs(PULSE_MS) - xs(0)}" height="${GB - GT}" fill="var(--band)"/>
    <text x="${(xs(0) + xs(PULSE_MS)) / 2}" y="${GT + 18}" fill="var(--soft)" font-size="12" text-anchor="middle">押されている間（入口が開く）</text>
    ${[0, 5, 10].filter((v) => v <= top).map((v) => `<line x1="${GL}" x2="${GR}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)"/><text x="${GL - 6}" y="${ys(v) + 4}" fill="var(--soft)" font-size="12" text-anchor="end">−${Math.abs(REST_MV + v)}</text>`).join("")}
    ${[0, 100, 200].map((ms) => `<text x="${xs(ms)}" y="${GB + 20}" fill="var(--soft)" font-size="12" text-anchor="middle">${ms} ms</text>`).join("")}
    <text x="${GL - 30}" y="${GT - 30}" fill="var(--ink)" font-size="13" font-weight="900">電位（mV）</text>
    <text x="${GL + 48}" y="${GT - 30}" fill="var(--soft)" font-size="12">＝細胞の中が、外に比べて何 mV か</text>
    <text x="${GL - 30}" y="${GT - 12}" fill="var(--soft)" font-size="12">上へ＝0に近づく（−70→−60。中のマイナスが弱まる）</text>
    ${Math.max(deltaMv(a, PULSE_MS), deltaMv(b, PULSE_MS)) > top ? `<text x="${xs(PULSE_MS / 2)}" y="${GT + 38}" fill="var(--gold)" font-size="13" font-weight="900" text-anchor="middle">↑ 線が枠の外へ出ている（上がり幅 ${Math.max(deltaMv(a, PULSE_MS), deltaMv(b, PULSE_MS)).toFixed(1)} mV）</text>` : ""}
    <polyline points="${line(a)}" fill="none" stroke="var(--soft)" stroke-width="2.5" stroke-dasharray="6 4"/>
    <polyline points="${line(b)}" fill="none" stroke="var(--you)" stroke-width="3.5"/>
    <line x1="${xs(t)}" x2="${xs(t)}" y1="${GT}" y2="${GB}" stroke="var(--gold)" stroke-width="2.5"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(a, t))}" r="6" fill="var(--panel)" stroke="var(--soft)" stroke-width="3"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(b, t))}" r="7" fill="var(--you)"/>
    ${o.notes === false ? `<text x="${GL - 30}" y="${GB + 40}" fill="var(--soft)" font-size="12">点線＝${o.a}　実線＝${o.b}</text>` : `<text x="${GL - 30}" y="${GB + 44}" fill="var(--soft)" font-size="12">点線＝${o.a}　実線＝${o.b}。静止時は −70 mV（イオンの濃さの差がつくる）</text>
    <text x="${GL - 30}" y="${GB + 62}" fill="var(--soft)" font-size="12">この模型は、入口で電位が上がって戻るところだけ。</text>
    <text x="${GL - 30}" y="${GB + 78}" fill="var(--soft)" font-size="12">その先で信号が脳へ送られるしくみは扱わない。</text>`}
  </g>`;
}

/**
 * 事件4の主の絵：膝の感覚の神経の端の膜を拡大し、膜の両側の電荷・入口（押されると開く）・いつも開いている通り道と、
 * 電位のグラフを同じ時刻で動かす。reveal が false の膜は、容量と通りやすさを「？」にして、電荷・通り道を基準の数で描く。
 * この模型は、入口で電位が上がって戻る部分だけ（その先の信号のしくみは扱わない）。
 */
export function nerveStage(a: Membrane, b: Membrane, t: number, o: { a: string; b: string; revealB: boolean; whole?: boolean; top?: number }): string {
  const flowing = t <= PULSE_MS;
  const dx = o.whole === false ? -290 : 0;
  return `<g transform="translate(${dx},0)">
    ${o.whole === false ? "" : nerveWhole(16, 16, flowing)}
    ${patchAt(18, a, o.a, "A", true, t, flowing)}${patchAt(248, b, o.b, "B", o.revealB, t, flowing)}
    ${membraneGraph({ GL: 830, GR: 1250, GT: 78, GB: 390 }, a, b, t, o)}
  </g>`;
}

export { BASE_MEM };

/** 答えの地図（Opus Magnum 型）：格子の各点が、どのラウンドで通るか（計算で塗る） */
export function answerMap(x: number, y: number, w: number, h: number, cells: number[][], marks: { col: number; row: number; label: string }[], axes: { x: string; y: string }): string {
  const rows = cells.length;
  const cols = cells[0]!.length;
  const cw = w / cols;
  const ch = h / rows;
  let rects = "";
  for (let i = 0; i < rows; i++)
    for (let k = 0; k < cols; k++) {
      const v = cells[i]![k]!;
      if (!v) continue;
      rects += `<rect x="${(k * cw).toFixed(1)}" y="${(h - (i + 1) * ch).toFixed(1)}" width="${(cw + 0.4).toFixed(1)}" height="${(ch + 0.4).toFixed(1)}" fill="${v === 1 ? "var(--you)" : v === 2 ? "var(--bot)" : "var(--stamp)"}" opacity=".8"/>`;
    }
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" fill="var(--panel)" stroke="var(--line)"/>${rects}
    ${marks.map((m) => `<circle cx="${(m.col + 0.5) * cw}" cy="${h - (m.row + 0.5) * ch}" r="8" fill="none" stroke="var(--ink)" stroke-width="3"/><text x="${(m.col + 0.5) * cw + 12}" y="${h - (m.row + 0.5) * ch - 8}" fill="var(--ink)" font-size="14" font-weight="900">${m.label}</text>`).join("")}
    <text x="${w / 2}" y="${h + 24}" fill="var(--soft)" font-size="13" text-anchor="middle">${axes.x} →</text>
    <text x="-14" y="${h / 2}" fill="var(--soft)" font-size="13" text-anchor="middle" transform="rotate(-90 -14 ${h / 2})">${axes.y} →</text>
  </g>`;
}
