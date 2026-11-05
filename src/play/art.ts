// 新しい画面の絵（舞台の SVG）。どの絵も、渡された計算値・記録から描く（隠れた答えは受け取らない）。
import { BASE_MEM, deltaMv, PULSE_MS, RECORD_MS, REST_MV, type Membrane } from "../../server/model/membraneGame.js";
import { BASE_VESSEL, BEAT_S, pumpFlow, steadyBeat, type Vessel } from "../../server/model/vessel.js";
import { dentWithinStep, DUTY, MOVIE_RUN, MOVIE_WALK, stepDents } from "../../server/model/steps.js";
import { BASE } from "../../server/model/public.js";

export type Mood = "calm" | "smug" | "sweat" | "shock" | "scan" | "down";

/** 検査ロボ TEJUN（定型ルールで動く。AIではない） */
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
    <rect x="0" y="262" width="100" height="40" rx="8" fill="var(--screen)"/><text x="50" y="290" fill="var(--bot)" font-size="17" font-weight="900" text-anchor="middle">TEJUN</text>
  </g>`;
}

/** 検査規則のカード（Papers, Please の規則書・Baba Is You の見える規則） */
export function ruleCard(x: number, y: number, title: string, lines: string[], hot: number | null, revised: boolean): string {
  const h = 52 + lines.length * 30;
  return `<g transform="translate(${x},${y}) rotate(-2)">
    <rect width="300" height="${h}" rx="10" fill="var(--paper)"/>
    <text x="16" y="30" fill="var(--paper-soft)" font-size="14" font-weight="900">${title}</text>
    ${lines.map((l, i) => `<text x="16" y="${62 + i * 30}" fill="${i === hot ? "var(--stamp)" : "var(--paper-ink)"}" font-size="16.5" font-weight="900">${l}</text>`).join("")}
    ${revised ? `<g class="pop" transform="translate(150,${h - 46}) rotate(-8)"><rect width="140" height="34" rx="5" fill="none" stroke="var(--stamp)" stroke-width="3"/><text x="70" y="24" fill="var(--stamp)" font-size="15" font-weight="900" text-anchor="middle">見る場所を変えた</text></g>` : ""}
  </g>`;
}

/** ロボの証言の吹き出し */
export function bubble(x: number, y: number, label: string, l1: string, l2 = "", w = 400, l3 = ""): string {
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${l3 ? 152 : l2 ? 120 : 92}" rx="18" fill="var(--paper)"/><path d="M${w} 46 l30 10 l-30 14z" fill="var(--paper)"/>
    <text x="22" y="32" fill="var(--paper-soft)" font-size="14" font-weight="900">${label}</text>
    <text x="22" y="70" fill="var(--paper-ink)" font-size="23" font-weight="900">${l1}</text>
    ${l2 ? `<text x="22" y="102" fill="var(--paper-ink)" font-size="23" font-weight="900">${l2}</text>` : ""}
    ${l3 ? `<text x="22" y="134" fill="var(--paper-ink)" font-size="23" font-weight="900">${l3}</text>` : ""}
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
      
      <text x="${cx - 26}" y="140" fill="var(--soft)" font-size="12" text-anchor="end">試験機の押し棒</text>
      <rect x="${cx - 16}" y="118" width="32" height="${Math.max(10, femurBottom - 150 - 118)}" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
      ${o.contact ? `<path d="M${cx + 34} 128 v40 m-12 -12 l12 12 l12 -12" stroke="var(--bot)" stroke-width="5" fill="none" stroke-linecap="round"/><text x="${cx + 52}" y="152" fill="var(--bot)" font-size="13" font-weight="900">体重にあたる力</text>` : ""}
      
      <path d="M${cx - 22} ${femurBottom - 150} V${femurBottom - 46} C ${cx - 22} ${femurBottom - 30}, ${cx - 78} ${femurBottom - 34}, ${cx - 78} ${femurBottom - 12} C ${cx - 78} ${femurBottom + 2}, ${cx - 40} ${femurBottom + 2}, ${cx} ${femurBottom - 4} C ${cx + 40} ${femurBottom + 2}, ${cx + 78} ${femurBottom + 2}, ${cx + 78} ${femurBottom - 12} C ${cx + 78} ${femurBottom - 34}, ${cx + 22} ${femurBottom - 30}, ${cx + 22} ${femurBottom - 46} V${femurBottom - 150} Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="3"/>
      <text x="${cx - 100}" y="${femurBottom - 80}" fill="var(--soft)" font-size="13" text-anchor="end">太ももの骨</text>
      
      <path d="M${cx - 70 - bulge / 2} ${top + 6} Q ${cx - 70 - bulge} ${(top + plateau) / 2} ${cx - 70 - bulge / 2} ${plateau - 4} L ${cx + 70 + bulge / 2} ${plateau - 4} Q ${cx + 70 + bulge} ${(top + plateau) / 2} ${cx + 70 + bulge / 2} ${top + 6} Z" fill="${col}" stroke="${edge}" stroke-width="3"/>
      <path d="M${cx - 70 - bulge / 2} ${top + 6} Q ${cx - 70 - bulge} ${(top + plateau) / 2} ${cx - 70 - bulge / 2} ${plateau - 4} L ${cx + 70 + bulge / 2} ${plateau - 4} Q ${cx + 70 + bulge} ${(top + plateau) / 2} ${cx + 70 + bulge / 2} ${top + 6} Z" fill="url(#hex-${kind})" opacity=".55"/>
      <text x="${cx + 100}" y="${(top + plateau) / 2 + 5}" fill="var(--soft)" font-size="13">人工軟骨</text>
      ${o.impact ? `<g class="impact" stroke="var(--gold)" stroke-width="5" stroke-linecap="round"><path d="M${cx - 96 - bulge} ${(top + plateau) / 2} l-20 0"/><path d="M${cx - 92 - bulge} ${top} l-16 -10"/></g>` : ""}
      
      <path d="M${cx - 84} ${plateau} H${cx + 84} C ${cx + 84} ${plateau + 22}, ${cx + 26} ${plateau + 26}, ${cx + 24} ${plateau + 44} V${plateau + 76} H${cx - 24} V${plateau + 44} C ${cx - 26} ${plateau + 26}, ${cx - 84} ${plateau + 22}, ${cx - 84} ${plateau} Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="3"/>
      <rect x="${cx - 60}" y="${plateau + 76}" width="120" height="14" rx="4" fill="var(--metal-edge)"/>
      <text x="${cx - 100}" y="${plateau + 56}" fill="var(--soft)" font-size="13" text-anchor="end">すねの骨（固定）</text>
      <text x="${cx + 150}" y="${plateau + 40}" fill="var(--ink)" font-size="24" font-weight="900" font-variant-numeric="tabular-nums">${dent.toFixed(2)}</text>
      <text x="${cx + 150}" y="${plateau + 58}" fill="var(--soft)" font-size="12">へこみ</text>
    </g>`;
  };
  const pat = (id: string, c: string) => `<pattern id="${id}" width="18" height="15.6" patternUnits="userSpaceOnUse"><path d="M4.5 0 h9 l4.5 7.8 l-4.5 7.8 h-9 l-4.5 -7.8z" fill="none" stroke="${c}" stroke-width="1.2"/></pattern>`;
  return `<g transform="translate(${x0},${y0}) scale(${o.scale ?? 1})">
    <defs>${pat("hex-A", "var(--pad-a-edge)")}${pat("hex-B", "var(--pad-b-edge)")}</defs>
    <rect x="150" y="104" width="760" height="16" rx="6" fill="var(--metal)"/>
    
    ${lane(330, o.labelA, o.dentA, "A")}${lane(760, o.labelB, o.dentB, "B")}
    ${o.diff !== null ? `<g transform="translate(470,44)"><rect width="140" height="40" rx="20" fill="${o.hot ? "var(--stamp)" : "var(--chip)"}"/><text x="70" y="27" fill="${o.hot ? "#fff" : "var(--ink)"}" font-size="18" font-weight="900" text-anchor="middle" font-variant-numeric="tabular-nums">差 ${o.diff >= 0 ? "+" : "−"}${Math.abs(o.diff).toFixed(3)}</text></g>` : ""}
  </g>`;
}

// ---------- 謎1：イメージムービー（検査の前の導入の物語。謎解きの手がかりは見せない。人物は描かない） ----------
// 三つの場面：①新しい試作品Bができる ②膝の軟骨は一歩ごとに押される（見本の値で計算） ③ロボの検査「区別できません」
// 各場面は 400×300 の枠に描く。再生中は一つを大きく、終わりは三つを並べる（動きを減らす設定でも同じ終わりの絵）。
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** ① 3Dプリンタで試作品Bを印刷する。s は場面の中の秒 */
function scenePrinter(s: number): string {
  const p = clamp01(s / 3.6);
  const h = 6 + 38 * p; // 印刷した高さ
  const nx = 270 + 70 * Math.sin(s * 5.2) * (p < 1 ? 1 : 0);
  const ny = 236 - h - 14;
  const layers = Math.floor(h / 6);
  return `<g>
    <rect x="0" y="0" width="400" height="300" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    <rect x="22" y="196" width="110" height="10" rx="3" fill="var(--metal-edge)"/>
    <rect x="34" y="166" width="86" height="30" rx="14" fill="var(--pad-a)" stroke="var(--pad-a-edge)" stroke-width="3"/>
    <text x="77" y="232" fill="var(--ink)" font-size="15" font-weight="900" text-anchor="middle">見本 A</text>
    
    <rect x="168" y="26" width="214" height="236" rx="10" fill="none" stroke="var(--metal-edge)" stroke-width="5"/>
    <rect x="168" y="48" width="214" height="10" fill="var(--metal)"/>
    <line x1="${nx}" y1="58" x2="${nx}" y2="${ny}" stroke="var(--metal-edge)" stroke-width="6"/>
    <path d="M${nx - 12} ${ny} h24 l-12 12z" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
    <rect x="190" y="236" width="170" height="10" rx="3" fill="var(--metal-edge)"/>
    <rect x="227" y="${236 - h}" width="96" height="${h}" rx="${Math.min(14, h / 2)}" fill="var(--pad-b)" stroke="var(--pad-b-edge)" stroke-width="3"/>
    ${Array.from({ length: layers }, (_, i) => `<line x1="231" x2="319" y1="${236 - 6 * (i + 1)}" y2="${236 - 6 * (i + 1)}" stroke="var(--pad-b-edge)" stroke-width="1" opacity=".5"/>`).join("")}
    <text x="275" y="20" fill="var(--soft)" font-size="15" font-weight="800" text-anchor="middle">3Dプリンタ</text>
    <text x="275" y="${p < 1 ? 280 : 280}" fill="var(--ink)" font-size="15" font-weight="900" text-anchor="middle">${p < 1 ? "印刷中…" : "試作品 B"}</text>
  </g>`;
}

/** ② 試験用の脚の模型が歩き、走る。膝の中の軟骨（見本の値で計算）が一歩ごとにへこむ */
const WALK_REAL = 3.5; // 場面の中で、歩く秒数（このあと走る）
function legMotion(s: number): { P: number; tm: number; label: string } {
  // 模型の時間：歩くは実時間1秒で模型2秒（一歩3秒→実時間1.5秒）、走るも同じ倍率（一歩0.75秒→実時間0.375秒）
  if (s < WALK_REAL) return { P: MOVIE_WALK, tm: s * 2, label: "歩く" };
  return { P: MOVIE_RUN, tm: (s - WALK_REAL) * 2, label: "走る" };
}
function baseDent(P: number, tm: number): { dent: number; stance: boolean; u: number } {
  const n = Math.ceil(tm / P) + 2;
  const steps = stepDents(BASE, P, n);
  const k = Math.min(n - 1, Math.floor(tm / P));
  const u = clamp01((tm - k * P) / P);
  return { dent: dentWithinStep(BASE, P, steps, k, u), stance: u < DUTY, u };
}
function sceneLeg(s: number): string {
  const { P, tm, label } = legMotion(s);
  const { dent, stance, u } = baseDent(P, tm);
  const deg = Math.PI / 180;
  const L = 66;
  const hx = 92;
  const hy = 96;
  const th = stance ? (20 - 40 * (u / DUTY)) * deg : (-20 + 40 * (0.5 - 0.5 * Math.cos(Math.PI * ((u - DUTY) / (1 - DUTY))))) * deg;
  const flex = (stance ? 5 : 5 + (P < 1 ? 80 : 45) * Math.sin(Math.PI * ((u - DUTY) / (1 - DUTY)))) * deg;
  const kx = hx + L * Math.sin(th);
  const ky = hy + L * Math.cos(th);
  const ax = kx + L * Math.sin(th - flex);
  const ay = ky + L * Math.cos(th - flex);
  const belt = hy + 2 * L * Math.cos(20 * deg) + 8;
  // 膝の中（拡大）
  const cx = 290;
  const cy = 150;
  const thick = Math.max(6, 44 - 34 * dent);
  const plate = cy + 30;
  const top = plate - thick;
  return `<g>
    <rect x="0" y="0" width="400" height="300" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    <text x="20" y="30" fill="var(--gold)" font-size="20" font-weight="900">${label}</text>
    
    <line x1="22" x2="170" y1="${belt}" y2="${belt}" stroke="var(--line)" stroke-width="4"/>
    ${Array.from({ length: 6 }, (_, j) => { const off = ((j * 26 - (tm / P) * 52) % 156 + 156) % 156; return `<line x1="${22 + off}" x2="${22 + Math.min(148, off + 12)}" y1="${belt + 8}" y2="${belt + 8}" stroke="var(--metal-edge)" stroke-width="3"/>`; }).join("")}
    <rect x="${hx - 28}" y="${hy - 20}" width="56" height="22" rx="7" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
    <path d="M${hx} ${hy} L${kx.toFixed(1)} ${ky.toFixed(1)}" stroke="var(--metal-edge)" stroke-width="20" fill="none" stroke-linecap="round"/>
    <path d="M${kx.toFixed(1)} ${ky.toFixed(1)} L${ax.toFixed(1)} ${ay.toFixed(1)}" stroke="var(--metal-edge)" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M${ax.toFixed(1)} ${ay.toFixed(1)} l26 4" stroke="var(--metal-edge)" stroke-width="11" stroke-linecap="round"/>
    <circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="11" fill="var(--panel)" stroke="var(--you)" stroke-width="4"/>
    
    <path d="M${(kx + 11).toFixed(1)} ${ky.toFixed(1)} L${cx - 84} ${cy}" stroke="var(--you)" stroke-width="1.5" stroke-dasharray="4 5"/>
    <defs><clipPath id="mv-zoom"><circle cx="${cx}" cy="${cy}" r="84"/></clipPath></defs>
    <circle cx="${cx}" cy="${cy}" r="84" fill="var(--panel)" stroke="var(--you)" stroke-width="3"/>
    <g clip-path="url(#mv-zoom)">
      <path d="M${cx - 64} ${top} C ${cx - 64} ${top - 28}, ${cx - 18} ${top - 24}, ${cx - 16} ${top - 56} V${cy - 110} H${cx + 16} V${top - 56} C ${cx + 18} ${top - 24}, ${cx + 64} ${top - 28}, ${cx + 64} ${top} Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="3"/>
      <rect x="${cx - 60}" y="${top}" width="120" height="${thick}" rx="8" fill="var(--pad-a)" stroke="var(--pad-a-edge)" stroke-width="3"/>
      <path d="M${cx - 70} ${plate} H${cx + 70} V${cy + 110} H${cx - 70} Z" fill="var(--bone)" stroke="var(--bone-edge)" stroke-width="3"/>
    </g>
    ${stance ? `<path d="M${cx} ${cy - 120} v22 m-8 -9 l8 9 l8 -9" stroke="var(--bot)" stroke-width="4" fill="none" stroke-linecap="round"/><text x="${cx + 14}" y="${cy - 104}" fill="var(--bot)" font-size="15" font-weight="800">体重</text>` : ""}
    
  </g>`;
}

/** ③ 検査ロボが試作品Bを押し、20秒待って「区別できません」 */
function sceneRobot(s: number): string {
  const press = clamp01(s / 0.6);
  const wait = clamp01((s - 0.6) / 2.6);
  const done = s >= 3.3;
  const sec = Math.round(wait * 20);
  const plateY = 150 + 30 * press;
  const ang = wait * 360;
  return `<g>
    <rect x="0" y="0" width="400" height="300" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    ${robotArt(done ? "smug" : "scan", 52, 58, 0.48)}
    <rect x="196" y="60" width="12" height="${plateY - 60}" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
    <rect x="232" y="60" width="12" height="${plateY - 60}" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
    <rect x="186" y="${plateY}" width="190" height="14" rx="4" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
    <rect x="232" y="${plateY + 14}" width="100" height="${238 - (plateY + 14)}" rx="10" fill="var(--pad-b)" stroke="var(--pad-b-edge)" stroke-width="3"/>
    <rect x="186" y="238" width="190" height="12" rx="4" fill="var(--metal-edge)"/>
    
    <g transform="translate(330,46)"><circle r="26" fill="var(--paper)" stroke="var(--metal-edge)" stroke-width="3"/>
      <line x1="0" y1="0" x2="${(18 * Math.sin(ang * (Math.PI / 180))).toFixed(1)}" y2="${(-18 * Math.cos(ang * (Math.PI / 180))).toFixed(1)}" stroke="var(--paper-ink)" stroke-width="3" stroke-linecap="round"/>
      <text x="0" y="46" fill="var(--ink)" font-size="15" font-weight="900" text-anchor="middle" font-variant-numeric="tabular-nums">${sec} 秒</text></g>
    ${done ? `<g transform="translate(170,172) rotate(-8)"><rect width="200" height="48" rx="6" fill="var(--paper)" stroke="var(--stamp)" stroke-width="4"/><text x="100" y="32" fill="var(--stamp)" font-size="22" font-weight="900" text-anchor="middle">区別できません</text></g>` : ""}
  </g>`;
}

// ---------- 謎2〜4の導入ムービー（同じ形。見本の値だけで描く） ----------
function frame(inner: string): string {
  return `<g><rect x="0" y="0" width="400" height="300" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>${inner}</g>`;
}
function stampMark(x: number, y: number, text: string, w = 200): string {
  return `<g transform="translate(${x},${y}) rotate(-8)"><rect width="${w}" height="48" rx="6" fill="var(--paper)" stroke="var(--stamp)" stroke-width="4"/><text x="${w / 2}" y="32" fill="var(--stamp)" font-size="22" font-weight="900" text-anchor="middle">${text}</text></g>`;
}

/** 謎2 ① ロボの検査のきまりに「見落とし」 */
function sceneMiss(s: number): string {
  return frame(`
    ${robotArt(s > 1.4 ? "sweat" : "calm", 52, 70, 0.42)}
    <g transform="translate(150,52) scale(0.8)">${ruleCard(0, 0, "ロボの検査のきまり", ["押して20秒待つ", "力を読む", "見本と比べる"], s > 1.4 ? 0 : null, false)}</g>
    ${s > 1.4 ? stampMark(170, 190, "見落とし", 170) : ""}
    `);
}
/** 謎2 ② わざと検査をすり抜ける試験用の軟骨をつくる（つまみ二つの3Dプリンタ） */
function sceneDesign(s: number): string {
  const p = clamp01(s / 4);
  const h = 6 + 34 * p;
  const nx = 270 + 60 * Math.sin(s * 5.2) * (p < 1 ? 1 : 0);
  const ny = 236 - h - 14;
  const knob = (cx: number, a: number, label: string) => `<g transform="translate(${cx},96)"><circle r="24" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="3"/><line x1="0" y1="0" x2="${(18 * Math.sin(a)).toFixed(1)}" y2="${(-18 * Math.cos(a)).toFixed(1)}" stroke="var(--you)" stroke-width="5" stroke-linecap="round"/></g>`;
  return frame(`
    ${knob(56, Math.sin(s * 1.7) * 1.4, "つまみ 1")}${knob(126, Math.cos(s * 1.3) * 1.4, "つまみ 2")}
    <text x="91" y="40" fill="var(--you)" font-size="14" font-weight="900" text-anchor="middle">設計はあなた</text>
    <path d="M150 100 h22" stroke="var(--you)" stroke-width="3" stroke-dasharray="4 4"/>
    <rect x="178" y="26" width="204" height="236" rx="10" fill="none" stroke="var(--metal-edge)" stroke-width="5"/>
    <rect x="178" y="48" width="204" height="10" fill="var(--metal)"/>
    <line x1="${nx}" y1="58" x2="${nx}" y2="${ny}" stroke="var(--metal-edge)" stroke-width="6"/>
    <path d="M${nx - 12} ${ny} h24 l-12 12z" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="2"/>
    <rect x="196" y="236" width="170" height="10" rx="3" fill="var(--metal-edge)"/>
    <rect x="233" y="${236 - h}" width="96" height="${h}" rx="${Math.min(14, h / 2)}" fill="var(--you)" opacity=".35" stroke="var(--you)" stroke-width="3"/>
    <text x="280" y="20" fill="var(--soft)" font-size="15" font-weight="800" text-anchor="middle">3Dプリンタ</text>
    <text x="280" y="280" fill="var(--ink)" font-size="14" font-weight="900" text-anchor="middle">あなたの試作品</text>
    
    
    `);
}
/** 謎2 ③ ロボは一度すり抜けられると、規則を改訂して見る場所を変える */
function sceneRuleChange(s: number): string {
  const rev = s > 2.6;
  return frame(`
    ${robotArt(rev ? "smug" : "scan", 52, 70, 0.42)}
    <g transform="translate(150,60) scale(0.8)">${ruleCard(0, 0, "ロボの走行検査", ["ゆっくり歩かせる", "12歩目の一点を見る", rev ? "見る点を変える" : "（見落としたら…）"], rev ? 2 : null, rev)}</g>
    `);
}

/** 謎3 ① 心臓は脈ごとに血液を送り、血管はふくらんで受け止める（見本の血管の値） */
const VA_BEAT = steadyBeat(BASE_VESSEL);
const VA_MIN = Math.min(...VA_BEAT);
const VA_MAX = Math.max(...VA_BEAT);
function vaAt(u: number): number {
  const v = ((u % BEAT_S) + BEAT_S) % BEAT_S;
  return VA_BEAT[Math.round((v / BEAT_S) * (VA_BEAT.length - 1))]!;
}
function vesselTube(x0: number, x1: number, y: number, p: number, edge: string, fill: string): string {
  const bulge = 12 + 26 * ((p - VA_MIN) / (VA_MAX - VA_MIN));
  return `<path d="M${x0} ${y - 12} C ${x0 + (x1 - x0) * 0.3} ${y - bulge}, ${x0 + (x1 - x0) * 0.7} ${y - bulge}, ${x1} ${y - 12} L${x1} ${y + 12} C ${x0 + (x1 - x0) * 0.7} ${y + bulge}, ${x0 + (x1 - x0) * 0.3} ${y + bulge}, ${x0} ${y + 12} Z" fill="${fill}" stroke="${edge}" stroke-width="3"/>`;
}
function heartArt(x: number, y: number, k: number): string {
  return `<g transform="translate(${x},${y}) scale(${k.toFixed(3)})"><path d="M0 -40 C -40 -74, -80 -26, -40 14 L0 54 L40 14 C 80 -26, 40 -74, 0 -40Z" fill="var(--heart)" stroke="var(--heart-edge)" stroke-width="4"/></g>`;
}
const BEAT_SLOW = 2; // 1回の脈を実時間で2倍にのばして見せる
function sceneHeart(s: number): string {
  const u = (s / BEAT_SLOW) % BEAT_S;
  const q = pumpFlow(u);
  const k = 0.62 * (1 - Math.min(0.16, q / 2400));
  const p = vaAt(u);
  const out = (p - VA_MIN) / (VA_MAX - VA_MIN);
  return frame(`
    ${heartArt(80, 140, k)}
    <text x="80" y="226" fill="var(--ink)" font-size="14" font-weight="900" text-anchor="middle">心臓</text>
    ${q > 1 ? `<path d="M118 132 h40 m-10 -8 l10 8 l-10 8" stroke="var(--heart-edge)" stroke-width="4" fill="none" stroke-linecap="round"/><text x="138" y="116" fill="var(--heart-edge)" font-size="15" font-weight="800" text-anchor="middle">ドクン</text>` : ""}
    ${vesselTube(160, 340, 140, p, "var(--pad-a-edge)", "var(--pad-a)")}
    <path d="M340 140 h30" stroke="var(--pad-a-edge)" stroke-width="6"/>
    <path d="M356 ${140 - 8 - 6 * out} l10 ${8 + 6 * out} l-10 ${8 + 6 * out}" stroke="var(--pad-a-edge)" stroke-width="${(2 + 3 * out).toFixed(1)}" fill="none" stroke-linecap="round"/>
    <text x="250" y="206" fill="var(--ink)" font-size="14" font-weight="900" text-anchor="middle">血管（ふくらんで受け止める）</text>
    
    `);
}
/** 謎3 ② 心臓と血管のまねをした試験装置（ポンプ・人工血管・圧力計） */
function gaugeArt(x: number, y: number, p: number, label: string): string {
  const ang = (v: number) => ((-210 + (v / 150) * 240) * Math.PI) / 180;
  return `<g transform="translate(${x},${y})"><circle r="40" fill="var(--paper)" stroke="var(--metal-edge)" stroke-width="3"/>
    ${[0, 50, 100, 150].map((v) => `<line x1="${(30 * Math.cos(ang(v))).toFixed(1)}" y1="${(30 * Math.sin(ang(v))).toFixed(1)}" x2="${(38 * Math.cos(ang(v))).toFixed(1)}" y2="${(38 * Math.sin(ang(v))).toFixed(1)}" stroke="var(--paper-soft)" stroke-width="2"/>`).join("")}
    <line x1="0" y1="0" x2="${(30 * Math.cos(ang(p))).toFixed(1)}" y2="${(30 * Math.sin(ang(p))).toFixed(1)}" stroke="var(--stamp)" stroke-width="4" stroke-linecap="round"/><circle r="4" fill="var(--paper-ink)"/>
    <text y="58" fill="var(--ink)" font-size="15" font-weight="800" text-anchor="middle">${label}</text></g>`;
}
function sceneRig(s: number): string {
  const u = (s / BEAT_SLOW) % BEAT_S;
  const q = pumpFlow(u);
  const p = vaAt(u);
  return frame(`
    <rect x="20" y="96" width="76" height="80" rx="12" fill="var(--metal)" stroke="var(--metal-edge)" stroke-width="3"/>
    ${heartArt(58, 130, 0.36 * (1 - Math.min(0.16, q / 2400)))}
    <text x="58" y="88" fill="var(--soft)" font-size="15" font-weight="800" text-anchor="middle">心臓ポンプ</text>
    <path d="M96 136 h24" stroke="var(--metal-edge)" stroke-width="8"/>
    ${vesselTube(120, 290, 136, p, "var(--vessel-edge)", "var(--vessel)")}
    <text x="205" y="196" fill="var(--ink)" font-size="14" font-weight="900" text-anchor="middle">人工血管</text>
    <path d="M290 136 h30 v90 h-260 v-50" stroke="var(--metal-edge)" stroke-width="5" fill="none"/>
    
    ${gaugeArt(340, 60, p, "圧力計（mmHg）")}
    <path d="M300 82 L270 120" stroke="var(--metal-edge)" stroke-width="3"/>
    `);
}
/** 謎3 ③ ロボは1回の脈の平均の圧を読む */
function sceneRobotMean(s: number): string {
  const u = (s / BEAT_SLOW) % BEAT_S;
  const p = vaAt(u);
  const done = s > 3.2;
  const fill = clamp01(s / 3.2);
  return frame(`
    ${robotArt(done ? "smug" : "scan", 52, 58, 0.48)}
    ${gaugeArt(250, 90, p, "圧力計")}
    <rect x="190" y="180" width="160" height="22" rx="11" fill="var(--chip)"/>
    <rect x="190" y="180" width="${(160 * fill).toFixed(1)}" height="22" rx="11" fill="var(--gold)"/>
    
    ${done ? stampMark(176, 200, "区別できません") : ""}
    `);
}

/** 謎4 ① 膝が押された感じは、神経を通って脳へ。はじまりは神経の端の膜 */
function sceneNerve(s: number): string {
  const pressed = s % 2 < 1.2;
  return frame(`
    <g transform="translate(14,10) scale(0.62)">${nerveWhole(0, 0, pressed)}</g>
    <g font-weight="900" text-anchor="middle">
      <text x="296" y="70" fill="var(--gold)" font-size="15">膝が押される</text>
      <text x="296" y="98" fill="var(--soft)" font-size="16">↓</text>
      <text x="296" y="126" fill="var(--you)" font-size="15">神経の端の膜で</text>
      <text x="296" y="146" fill="var(--you)" font-size="15">電圧が変わる</text>
      <text x="296" y="174" fill="var(--soft)" font-size="16">↓</text>
      <text x="296" y="202" fill="var(--ink)" font-size="15">脳へ伝わる</text>
    </g>
    `);
}
/** 謎4 ② 入口が開いて電流が入り、膜の電圧が −70 mV から上がり、止まると戻る（見本の膜の値） */
const MEM_LOOP_S = 4; // 0〜200 ミリ秒を実時間4秒で見せる
function sceneMembrane(s: number): string {
  const t = ((s % MEM_LOOP_S) / MEM_LOOP_S) * RECORD_MS;
  const gx0 = 40;
  const gx1 = 380;
  const gy0 = 196;
  const gy1 = 278;
  const xs = (ms: number) => gx0 + ((gx1 - gx0) * ms) / RECORD_MS;
  const ys = (dv: number) => gy1 - ((gy1 - gy0) * dv) / 11;
  const pts: string[] = [];
  for (let m = 0; m <= t + 1e-9; m += 2) pts.push(`${xs(m).toFixed(1)},${ys(deltaMv(BASE_MEM, m)).toFixed(1)}`);
  return frame(`
    ${membranePatch(8, 8, 0.78, BASE_MEM, "見本の膜", "A", true, t)}
    <rect x="${gx0}" y="${gy0}" width="${gx1 - gx0}" height="${gy1 - gy0}" fill="none" stroke="var(--line)"/>
    <rect x="${gx0}" y="${gy0}" width="${xs(PULSE_MS) - gx0}" height="${gy1 - gy0}" fill="var(--gold)" opacity=".08"/>
    
    <text x="${gx0 - 4}" y="${gy1 + 4}" fill="var(--soft)" font-size="15" font-weight="800" text-anchor="end">−70</text>
    <text x="${gx0 - 4}" y="${ys(10) + 4}" fill="var(--soft)" font-size="15" font-weight="800" text-anchor="end">−60</text>
    <polyline points="${pts.join(" ")}" fill="none" stroke="var(--soft)" stroke-width="2.5"/>
    <text x="${gx1}" y="${gy1 + 16}" fill="var(--soft)" font-size="15" font-weight="800" text-anchor="end">${RECORD_MS} ms</text>`);
}
/** 謎4 ③ ロボは電流を止める直前の膜の電圧だけを読む */
function sceneRobotMem(s: number): string {
  const t = Math.min(PULSE_MS, (s / 2.6) * PULSE_MS);
  const done = s > 3;
  const mv = REST_MV + deltaMv(BASE_MEM, t);
  return frame(`
    ${robotArt(done ? "smug" : "scan", 52, 58, 0.48)}
    <g transform="translate(200,60)"><rect width="170" height="84" rx="12" fill="var(--paper)" stroke="var(--metal-edge)" stroke-width="3"/>
      <text x="85" y="26" fill="var(--paper-soft)" font-size="15" font-weight="800" text-anchor="middle">膜の電圧計</text>
      <text x="85" y="62" fill="var(--paper-ink)" font-size="26" font-weight="900" text-anchor="middle" font-variant-numeric="tabular-nums">${mv.toFixed(1).replace("-", "−")} mV</text></g>
    <rect x="200" y="160" width="170" height="16" rx="8" fill="var(--chip)"/>
    <rect x="200" y="160" width="${((170 * t) / PULSE_MS).toFixed(1)}" height="16" rx="8" fill="var(--gold)"/>
    
    ${done ? stampMark(176, 200, "区別できません") : ""}
    `);
}

interface MovieScene {
  dur: number;
  tag: string;
  short: string;
  draw: (s: number) => string;
}
interface Movie {
  scenes: readonly MovieScene[];
  end: readonly [string, string];
}
/** 導入ムービーの番号（内部の番号。章は 1c-2 で四つ：1＝謎1、2＝謎2、4＝謎3（血管）、5＝謎4（膜）） */
export type MovieId = 1 | 2 | 4 | 5;
const MOVIES: Record<MovieId, Movie> = {
  1: {
    scenes: [
      { dur: 5, tag: "① 新しい試作品", short: "再生医療のラボで試作品Bができた", draw: scenePrinter },
      { dur: 7, tag: "② 膝の軟骨のしごと", short: "膝の軟骨は一歩ごとに押されてへこむ", draw: sceneLeg },
      { dur: 5, tag: "③ 検査ロボの検査", short: "ロボ「20秒後の力は区別できません」", draw: sceneRobot },
    ],
    end: ["でも、走るときの押され方まで、本当に見本と同じ？", "確かめるのは、あなた。測り方を自分で考えよう。"],
  },
  2: {
    scenes: [
      { dur: 5, tag: "① 検査の見落とし", short: "謎1でロボの見落としが見つかった", draw: sceneMiss },
      { dur: 6, tag: "② わざと見落とさせる", short: "見本と違うのにロボが見分けられない軟骨をつくる", draw: sceneDesign },
      { dur: 6, tag: "③ ロボも負けていない", short: "見落とすとロボは見る場所を変える", draw: sceneRuleChange },
    ],
    end: ["ロボには「区別できません」と言わせて、ほかのところには違いを残せ。", "二回戦では、ロボの見る場所が変わる。"],
  },
  4: {
    scenes: [
      { dur: 6, tag: "① 軟骨から血管へ", short: "軟骨に血管はない。血液は血管が運ぶ", draw: sceneHeart },
      { dur: 6, tag: "② 試験装置で調べる", short: "試験装置で人工血管の試作品Bを調べる", draw: sceneHeart },
      { dur: 5, tag: "③ 検査ロボの検査", short: "ロボ「平均の圧は区別できません」", draw: sceneRobotMean },
    ],
    end: ["でも、1回の脈の中の圧の動きまで、本当に見本と同じ？", "確かめるのは、あなた。"],
  },
  5: {
    scenes: [
      { dur: 6, tag: "① 膝から脳へ", short: "膝が押された感じは神経で脳へ伝わる", draw: sceneNerve },
      { dur: 7, tag: "② 膜の電圧", short: "電流が入ると膜の電圧が上がって戻る", draw: sceneMembrane },
      { dur: 5, tag: "③ 検査ロボの検査", short: "ロボ「止める直前は区別できません」", draw: sceneRobotMem },
    ],
    end: ["でも、電流を入れている途中や止めたあとまで、本当に見本と同じ？", "確かめるのは、あなた。"],
  },
};
/** 実時間（秒）。これ以後は結び（三つの場面を並べる） */
export function movieLength(id: MovieId): number {
  return MOVIES[id].scenes.reduce((a, sc) => a + sc.dur, 0);
}
export function movieOutline(id: MovieId): { scenes: number; length: number; end: string } {
  return { scenes: MOVIES[id].scenes.length, length: movieLength(id), end: MOVIES[id].end.join("") };
}
/** 各場面は一行だけを大きく出す（長い字幕は読まれないため。2026-11-05 夜、作者の指摘）。結びでも同じ一行を並べる */
export function introMovie(id: MovieId, t: number): string {
  const mv = MOVIES[id];
  if (t >= movieLength(id)) {
    return `<g>
      ${mv.scenes.map((sc, i) => `<g transform="translate(${30 + i * 416},24)">${sc.draw(sc.dur)}
        <text x="200" y="326" fill="var(--ink)" font-size="17" font-weight="900" text-anchor="middle">${sc.tag.slice(0, 2)}${sc.short}</text></g>`).join("")}
      <g transform="translate(190,370)"><rect width="900" height="96" rx="14" fill="var(--paper)"/>
        <text x="450" y="40" fill="var(--paper-ink)" font-size="23" font-weight="900" text-anchor="middle">${mv.end[0]}</text>
        <text x="450" y="76" fill="var(--paper-soft)" font-size="17" font-weight="900" text-anchor="middle">${mv.end[1]}</text></g>
    </g>`;
  }
  let from = 0;
  let i = 0;
  while (i < mv.scenes.length - 1 && t >= from + mv.scenes[i]!.dur) from += mv.scenes[i++]!.dur;
  const sc = mv.scenes[i]!;
  const s = t - from;
  const fade = clamp01(s / 0.35);
  return `<g>
    <text x="640" y="32" fill="var(--gold)" font-size="18" font-weight="900" text-anchor="middle">${sc.tag}</text>
    <g opacity="${fade.toFixed(2)}" transform="translate(410,46) scale(1.15)">${sc.draw(s)}</g>
    <text x="640" y="440" fill="var(--ink)" font-size="26" font-weight="900" text-anchor="middle">${sc.short}</text>
  </g>`;
}

/** 拍の列。各拍の丸は、その一歩で差がいちばん大きい点の差を色で示す */
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

/**
 * 謎1 走行テストの時間のバー（CLAUDE.md 1c・第3章）：最初の数歩のへこみ。
 * A＝計算の線（点線）、B＝測った点とそれを結んだ線（誤差のない B の線は描かない）。差が幅を超えた点は赤。
 */
export function runTimeline(o: {
  x: number; y: number; w: number; h: number; period: number; steps: number;
  aLine: readonly { t: number; v: number }[];
  bPts: readonly { t: number; v: number; shown: boolean; hot: boolean; sel: boolean; shot: boolean }[];
  now: number | null; tol: number;
}): string {
  const L = 66, R = 26, T = 40, B = 70;
  const tMax = o.period * o.steps;
  const vals = [...o.aLine.map((p) => p.v), ...o.bPts.filter((p) => p.shown).map((p) => p.v)];
  const vMin = Math.min(-0.05, ...vals) - 0.03;
  const vMax = Math.max(1.0, ...vals) + 0.05;
  const xs = (t: number) => L + ((o.w - L - R) * t) / tMax;
  const ys = (v: number) => T + (o.h - T - B) * ((vMax - v) / (vMax - vMin));
  const bands = Array.from({ length: o.steps }, (_, k) => {
    const x0 = xs(k * o.period), x1 = xs(k * o.period + o.period / 2), x2 = xs((k + 1) * o.period);
    return `<rect x="${x0}" y="${T}" width="${x1 - x0}" height="${o.h - T - B}" fill="color-mix(in srgb, var(--bot) 10%, transparent)"/>
      <text x="${(x0 + x2) / 2}" y="${T - 12}" fill="var(--ink)" font-size="16" font-weight="900" text-anchor="middle">${k + 1}歩目</text>`;
  }).join("");
  const ticks = Array.from({ length: Math.floor(tMax) + 1 }, (_, i) => `<text x="${xs(i)}" y="${o.h - B + 22}" fill="var(--soft)" font-size="14" font-weight="800" text-anchor="middle">${i}${i === Math.floor(tMax) ? " 秒" : ""}</text>`).join("");
  const yt = [0, 0.5, 1].map((v) => `<line x1="${L}" x2="${o.w - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${ys(v) + 5}" fill="var(--soft)" font-size="14" font-weight="800" text-anchor="end">${v}</text>`).join("");
  const aPath = o.aLine.map((p, i) => `${i ? "L" : "M"}${xs(p.t).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ");
  const shown = o.bPts.filter((p) => p.shown);
  const bPath = shown.map((p, i) => `${i ? "L" : "M"}${xs(p.t).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ");
  const dots = o.bPts
    .map((p, i) =>
      !p.shown
        ? ""
        : `<g class="note hit" data-act="note" data-val="${i}" role="button" aria-label="${Math.floor(i / 4) + 1}歩目の点">
        <circle cx="${xs(p.t)}" cy="${ys(p.v)}" r="16" fill="transparent"/>
        ${p.sel ? `<circle cx="${xs(p.t)}" cy="${ys(p.v)}" r="15" fill="none" stroke="var(--gold)" stroke-width="4"/>` : ""}
        <circle cx="${xs(p.t)}" cy="${ys(p.v)}" r="${p.hot ? 9 : 6}" fill="${p.hot ? "var(--stamp)" : "var(--pad-b-edge)"}" stroke="var(--panel)" stroke-width="2"/>
        ${p.shot ? `<text x="${xs(p.t)}" y="${ys(p.v) - 18}" fill="var(--gold)" font-size="14" font-weight="900" text-anchor="middle">証拠</text>` : ""}
      </g>`,
    )
    .join("");
  return `<g transform="translate(${o.x},${o.y})">
    <rect width="${o.w}" height="${o.h}" rx="16" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    ${bands}${yt}
    <text x="14" y="${T - 12}" fill="var(--ink)" font-size="15" font-weight="900">へこみ</text>
    ${ticks}
    <path d="${aPath}" fill="none" stroke="var(--pad-a-edge)" stroke-width="3" stroke-dasharray="7 6"/>
    ${bPath ? `<path d="${bPath}" fill="none" stroke="var(--pad-b-edge)" stroke-width="2" opacity=".7"/>` : ""}
    ${dots}
    ${o.now !== null ? `<line x1="${xs(o.now)}" x2="${xs(o.now)}" y1="${T}" y2="${o.h - B}" stroke="var(--gold)" stroke-width="3"/>` : ""}
    <g font-size="14" font-weight="900" fill="var(--ink)" transform="translate(${L},${o.h - 22})">
      <line x1="0" x2="28" y1="-5" y2="-5" stroke="var(--pad-a-edge)" stroke-width="3" stroke-dasharray="7 6"/><text x="36" y="0">見本 A</text>
      <circle cx="120" cy="-5" r="6" fill="var(--pad-b-edge)"/><text x="132" y="0">試作品 B（測った点）</text>
      <circle cx="306" cy="-5" r="8" fill="var(--stamp)"/><text x="320" y="0">ちがいが ${o.tol} より大きい</text>
    </g>
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

/**
 * 人工軟骨を見立てた「ばね二つとダンパ一つ」の模型（標準線形固体）。座標は 200×110。
 * 左のばね＝待ったあとも残るかたさ、右のばね＝押した直後だけ増えるかたさ、ダンパ＝増えたかたさが消えていくまでの時間を決めるねばり。
 * hl で光らせる部品を選ぶ（影武者の仮説の部品・検算後の正体だけ。推理の前に答えを描かない）。
 */
export type ModelPart = "overall" | "instant" | "relax";
export function slsModel(o: { hl: ModelPart | null; color?: string; mark?: string; dim?: boolean; base?: string }): string {
  const base = o.base ?? (o.dim ? "var(--line)" : "var(--soft)");
  const hc = o.color ?? "var(--gold)";
  const st = (p: ModelPart) => (o.hl === p ? `stroke="${hc}" stroke-width="5"` : `stroke="${base}" stroke-width="3"`);
  const zig = (x: number, y0: number, y1: number) => {
    const n = 6;
    const h = (y1 - y0 - 12) / n;
    let d = `M${x} ${y0} v6`;
    for (let k = 0; k < n; k++) d += ` l${k % 2 ? -9 : 9} ${h / 2} l${k % 2 ? 9 : -9} ${h / 2}`;
    return `${d} v6`;
  };
  const mark = (p: ModelPart, x: number, y: number) => (o.hl === p && o.mark ? `<text x="${x}" y="${y}" fill="${hc}" font-size="20" font-weight="900" text-anchor="middle">${o.mark}</text>` : "");
  return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="22" y="6" width="156" height="8" rx="3" fill="${base}" stroke="none"/>
    <rect x="22" y="98" width="156" height="8" rx="3" fill="${base}" stroke="none"/>
    <path d="${zig(60, 14, 98)}" ${st("overall")}/>
    <path d="${zig(140, 14, 54)}" ${st("instant")}/>
    <path d="M140 54 V72 M128 72 H152" ${st("relax")}/>
    <path d="M124 64 V92 H156 V64" ${st("relax")}/>
    <path d="M140 92 V98" ${st("relax")}/>
    ${mark("overall", 86, 62)}${mark("instant", 172, 40)}${mark("relax", 176, 86)}
  </g>`;
}

/** 正体の画面・まとめで使う、部品の名前つきの模型（幅 460） */
export function slsModelLabeled(x: number, y: number, hl: ModelPart | null, caption: string): string {
  const name = (part: ModelPart, tx: number, ty: number, t1: string, t2: string) => `<text x="${tx}" y="${ty}" fill="${hl === part ? "var(--stamp)" : "var(--paper-ink)"}" font-size="14" font-weight="900">${t1}</text><text x="${tx}" y="${ty + 18}" fill="var(--paper-soft)" font-size="12">${t2}</text>`;
  return `<g transform="translate(${x},${y})">
    <g transform="translate(0,6) scale(1.1)">${slsModel({ hl, mark: hl ? "！" : undefined, base: "var(--paper-soft)", color: "var(--stamp)" })}</g>
    ${name("overall", 236, 22, "左のばね", "待ったあとも残るかたさ")}
    ${name("instant", 236, 66, "右のばね", "押した直後だけ増えるかたさ")}
    ${name("relax", 236, 110, "ダンパ（ねばり）", "増えたかたさが消えていく時間を決める")}
    <text x="0" y="150" fill="var(--paper-ink)" font-size="15" font-weight="900">${caption}</text>
    <text x="0" y="172" fill="var(--paper-soft)" font-size="14" font-weight="800">ダンパ＝速く動かすほど強く押し返す部品（ゆっくり閉まるドアの部品）</text>
  </g>`;
}


// ---------- 橋の回路（1b のゲーム版で使う。新しい画面では使わない：1c-2） ----------
/** 回路図（計算と同じ節点構成）：決まった量の電流を送りこむもの → C∞ → 「C1 と R の並列」。幅 520×高さ 220 を s 倍 */
export function seriesCircuit(x: number, y: number, s: number, rv: number, c1v: number, label: { cInf: string; c1: string; r: string; src: string }, hl = ""): string {
  const plate = Math.max(18, Math.min(64, 28 * c1v));
  const zz = Math.max(36, Math.min(130, 30 * rv));
  const n = 6;
  const zx0 = 360 - zz / 2;
  const zig = Array.from({ length: n }, (_, i) => `l${zz / n / 2} ${i % 2 ? 9 : -9} l${zz / n / 2} ${i % 2 ? -9 : 9}`).join(" ");
  const ink = "var(--ink)";
  const cC = hl === "c1" ? "var(--gold)" : "var(--leak)";
  const rC = hl === "r" ? "var(--gold)" : "var(--stamp)";
  const iC = hl === "cInf" ? "var(--gold)" : "var(--soft)";
  return `<g transform="translate(${x},${y}) scale(${s})">
    <g fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round">
      <path d="M40 150 V60 H120"/><path d="M134 60 H240"/>
      <path d="M120 38 V82" stroke="${iC}" stroke-width="5"/><path d="M134 38 V82" stroke="${iC}" stroke-width="5"/>
      <path d="M240 30 V110"/><path d="M240 30 H${360 - 6}"/><path d="M${360 + 6} 30 H480"/>
      <path d="M${354} ${30 - plate / 2} V${30 + plate / 2}" stroke="${cC}" stroke-width="5"/><path d="M${366} ${30 - plate / 2} V${30 + plate / 2}" stroke="${cC}" stroke-width="5"/>
      <path d="M240 110 H${zx0}"/><path d="M${zx0} 110 ${zig}" stroke="${rC}" stroke-width="4"/><path d="M${zx0 + zz} 110 H480"/>
      <path d="M480 30 V150 H40"/>
    </g>
    <circle cx="40" cy="150" r="20" fill="var(--panel)" stroke="var(--gold)" stroke-width="3"/><path d="M40 162 V138 m-8 8 l8 -8 l8 8" stroke="var(--gold)" stroke-width="3" fill="none"/>
    <text x="40" y="196" fill="var(--soft)" font-size="13" text-anchor="middle">${label.src}</text>
    <text x="127" y="104" fill="${iC}" font-size="13" font-weight="900" text-anchor="middle">${label.cInf}</text>
    <text x="360" y="${30 - plate / 2 - 8}" fill="${cC}" font-size="14" font-weight="900" text-anchor="middle">${label.c1}</text>
    <text x="360" y="140" fill="${rC}" font-size="14" font-weight="900" text-anchor="middle">${label.r}</text>
  </g>`;
}

/** Bの押し返す力（線）と回路の電圧（点）を同じ目盛りで重ねる。押している間は横に拡大 */
export function overlayChart(x: number, y: number, w: number, h: number, pts: readonly { t: number; f: number; v?: number }[], push: number, o: { overlap: boolean; lineLabel: string; dotLabel: string; until?: number }): string {
  const tMax = pts[pts.length - 1]!.t;
  const yMax = Math.max(2.2, ...pts.map((p) => Math.max(p.f, p.v ?? 0) + 0.15));
  const xPush = w * 0.2;
  const xs = (t: number) => (t <= push ? (xPush * t) / push : xPush + ((w - xPush) * (t - push)) / (tMax - push));
  const ys = (v: number) => h * (1 - v / yMax);
  const shown = pts.filter((p) => o.until === undefined || p.t <= o.until + 1e-9);
  const line = shown.map((p) => `${xs(p.t).toFixed(1)},${ys(p.f).toFixed(1)}`).join(" ");
  const dots = shown.filter((p, i) => p.v !== undefined && i % 6 === 0).map((p) => `<circle cx="${xs(p.t).toFixed(1)}" cy="${ys(p.v!).toFixed(1)}" r="4.2" fill="var(--gold)"/>`).join("");
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" fill="var(--panel)" stroke="var(--line)"/>
    <rect width="${xPush}" height="${h}" fill="var(--gold)" opacity=".07"/>
    <text x="6" y="${h - 8}" fill="var(--soft)" font-size="12">押す（電流を流す）${push}秒・横に拡大</text>
    ${[0, 1, 2].filter((v) => v <= yMax).map((v) => `<line x1="0" x2="${w}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)"/><text x="-6" y="${ys(v) + 4}" fill="var(--soft)" font-size="12" text-anchor="end">${v}</text>`).join("")}
    ${[0, 5, 10, 15, 20].map((s) => `<text x="${xs(push + s)}" y="${h + 16}" fill="var(--soft)" font-size="12" text-anchor="middle">${s}</text>`).join("")}
    <text x="${w}" y="${h + 32}" fill="var(--soft)" font-size="12" text-anchor="end">押し終わり（電流を止めて）からの秒 →</text>
    <polyline points="${line}" fill="none" stroke="var(--you)" stroke-width="${o.overlap ? 6 : 3}" opacity="${o.overlap ? 0.6 : 1}"/>
    ${dots}
    <g transform="translate(${w - 300},12)"><line x1="0" x2="26" y1="0" y2="0" stroke="var(--you)" stroke-width="3"/><text x="32" y="5" fill="var(--ink)" font-size="13">${o.lineLabel}</text>
      <circle cx="13" cy="22" r="4.2" fill="var(--gold)"/><text x="32" y="27" fill="var(--ink)" font-size="13">${o.dotLabel}</text></g>
  </g>`;
}

// ---------- 謎3：模擬循環回路 ----------
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
      <text x="800" y="${y + 70}" fill="var(--soft)" font-size="13">出口（流れにくさ）</text>
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
    <text x="150" y="400" fill="var(--soft)" font-size="13" text-anchor="middle">1回の脈 ${BEAT_S} 秒（${(beatPhase * 100).toFixed(0)}%）</text>
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
    <text x="0" y="${h + 16}" fill="var(--soft)" font-size="12">1回の脈の圧（mmHg）　点線＝A、線＝B</text>
  </g>`;
}

/** 心臓＝電流源、血管のやわらかさ＝コンデンサ、末梢＝抵抗（膜の等価回路と同じ形） */
export function heartCircuit(x: number, y: number, r: number, c: number, labels: { src: string; cap: string; res: string; bat?: string } = { src: "心臓ポンプ＝電流を送りこむもの", cap: "血管のふくらみやすさ＝コンデンサ C（電気をためる部品）", res: "出口の流れにくさ＝抵抗 R" }): string {
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
    <text x="400" y="${(labels.src.length + labels.res.length) * 14 > 390 ? 282 : 236}" fill="var(--bot)" font-size="14" font-weight="900" text-anchor="end">${labels.res}</text>
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
    <text x="${w - 6}" y="${h + 18}" fill="var(--soft)" font-size="12" text-anchor="end">脈2回ぶん　線＝血管Bの圧（mmHg）　丸＝あなたの装置の圧（同じ目盛りで描く）</text>
  </g>`;
}

// ---------- 謎4：膜の水槽 ----------
export function tankStage(a: Membrane, b: Membrane, t: number, labels: { a: string; b: string }, top = 14, revealB = true): string {
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
    const hide = kind === "B" && !revealB;
    const w = Math.max(40, Math.min(200, 80 * (hide ? 1 : m.c)));
    const L = cx - w / 2;
    const R = cx + w / 2;
    const dv = deltaMv(m, t);
    const wy = ys(dv);
    const door = Math.max(6, Math.min(40, 16 * (hide ? 1 : m.g)));
    const out = Math.min(18, 1.4 * (hide ? 1 : m.g) * dv);
    const edge = kind === "A" ? "var(--soft)" : "var(--you)";
    return `<g>
      <text x="${cx}" y="${T - 34}" text-anchor="middle" fill="var(--ink)" font-size="18" font-weight="900">${label}</text>
      <rect x="${L}" y="${wy}" width="${w}" height="${floorY - wy}" fill="var(--water)"/>
      <line x1="${L}" x2="${R}" y1="${wy}" y2="${wy}" stroke="var(--water-edge)" stroke-width="3"/>
      <path d="M${L} ${T - 10} V${floorY} H${R} V${floorY - door}" fill="none" stroke="${edge}" stroke-width="4"/>
      <path d="M${R} ${floorY - door - 6} V${T - 10}" fill="none" stroke="${edge}" stroke-width="4"/>
      ${out > 0.5 ? `<path d="M${R + 4} ${floorY - door / 2} h${20 + out}" stroke="var(--water-edge)" stroke-width="${out.toFixed(1)}" stroke-linecap="round"/>` : ""}
      ${flowing ? `<path d="M${cx} ${T - 26} V${Math.max(T, wy - 2)}" stroke="var(--bot)" stroke-width="6" stroke-linecap="round"/>` : ""}
      <text x="${cx}" y="${floorY + 30}" text-anchor="middle" fill="var(--soft)" font-size="13">${hide ? "広さ（ためやすさ）×？　出口の広さ×？" : `広さ（ためやすさ）×${m.c.toFixed(2)}　出口の広さ×${m.g.toFixed(2)}`}</text>
      <path d="M${R + 6} ${wy} L${xs(t) - 8} ${ys(dv)}" stroke="${edge}" stroke-width="2" stroke-dasharray="5 5"/>
    </g>`;
  };
  return `<g>
    <rect x="40" y="${floorY}" width="520" height="10" rx="3" fill="var(--metal-edge)"/>
    <text x="40" y="${floorY + 54}" fill="var(--soft)" font-size="15" font-weight="800">水槽はたとえ：水位＝膜の電圧、広さ＝電気のためやすさ、出口＝イオンの通りやすさ</text>
    ${tank(180, a, labels.a, "A")}${tank(420, b, labels.b, "B")}
    <rect x="${xs(0)}" y="${T}" width="${xs(PULSE_MS) - xs(0)}" height="${floorY - T}" fill="var(--band)"/>
    ${[0, 5, 10].map((v) => `<line x1="${GL}" x2="${GR}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)"/><text x="${GR}" y="${ys(v) - 4}" fill="var(--soft)" font-size="12" text-anchor="end">−${Math.abs(REST_MV + v)} mV</text>`).join("")}
    ${[0, 100, 200].map((ms) => `<text x="${xs(ms)}" y="${floorY + 22}" fill="var(--soft)" font-size="12" text-anchor="middle">${ms} ms</text>`).join("")}
    <polyline points="${line(a)}" fill="none" stroke="var(--soft)" stroke-width="2.5" stroke-dasharray="6 4"/>
    <polyline points="${line(b)}" fill="none" stroke="var(--you)" stroke-width="3.5"/>
    <line x1="${xs(t)}" x2="${xs(t)}" y1="${T}" y2="${floorY}" stroke="var(--gold)" stroke-width="2.5"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(a, t))}" r="6" fill="var(--panel)" stroke="var(--soft)" stroke-width="3"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(b, t))}" r="7" fill="var(--you)"/>
  </g>`;
}

/** 謎4：神経の全体（膝の感覚の神経の端→脳）。拡大する場所を枠で示す */
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
    <text x="${L + 26 + 18 * label.length}" y="${y0 + 24}" fill="var(--soft)" font-size="13">${reveal ? `ためやすさ ×${m.c.toFixed(2)}　通りやすさ ×${m.g.toFixed(2)}` : "ためやすさ ×？　通りやすさ ×？"}</text>
    <text x="${R - 14}" y="${y0 + 26}" fill="${edge}" font-size="24" font-weight="900" text-anchor="end" font-variant-numeric="tabular-nums">${mv.toFixed(1).replace("-", "−")} mV</text>
    <text x="${R - 14}" y="${y0 + 52}" fill="var(--soft)" font-size="12" text-anchor="end">細胞の外</text>
    <text x="${L + 14}" y="${y0 + 190}" fill="var(--soft)" font-size="12">細胞の中</text>
    <rect x="${L + 10}" y="${memTop}" width="${R - L - 20}" height="${memBot - memTop}" fill="var(--membrane)"/>
    <g fill="var(--membrane-edge)" stroke="var(--membrane-edge)" stroke-width="1.5">${heads.join("")}</g>
    <g fill="var(--plus)">${restX.map((xx) => `<text x="${xx}" y="${memTop - 8}" font-size="14" font-weight="900" text-anchor="middle">＋</text>`).join("")}</g>
    <g fill="var(--minus)">${restX.map((xx) => `<text x="${xx}" y="${memBot + 16}" font-size="16" font-weight="900" text-anchor="middle">−</text>`).join("")}</g>
    <g fill="var(--gold)">${plusMarks}</g>
    
    <rect x="${entX - 18}" y="${memTop - 4}" width="12" height="${memBot - memTop + 8}" rx="5" fill="var(--bot)"/>
    <rect x="${entX + 6}" y="${memTop - 4}" width="12" height="${memBot - memTop + 8}" rx="5" fill="var(--bot)"/>
    ${flowing ? `<path d="M${entX} ${memTop - 30} V${memBot + 22}" stroke="var(--gold)" stroke-width="7" stroke-linecap="round"/><path d="M${entX - 10} ${memBot + 12} l10 12 l10 -12" stroke="var(--gold)" stroke-width="5" fill="none" stroke-linecap="round"/>` : `<rect x="${entX - 8}" y="${memTop + 12}" width="16" height="${memBot - memTop - 24}" fill="var(--bot)"/>`}
    <text x="${L + 14}" y="${y0 + 46}" fill="var(--bot)" font-size="12" font-weight="900">入口（膝が押されると開く）</text>
    
    ${leakX.map((lx) => `<rect x="${lx - 9}" y="${memTop - 3}" width="6" height="${memBot - memTop + 6}" rx="3" fill="var(--leak)"/><rect x="${lx + 3}" y="${memTop - 3}" width="6" height="${memBot - memTop + 6}" rx="3" fill="var(--leak)"/>${out > 0.6 ? `<path d="M${lx} ${memBot + 14} V${memTop - 18}" stroke="var(--leak)" stroke-width="${Math.max(2, out / Math.sqrt(leaks)).toFixed(1)}" stroke-linecap="round"/><path d="M${lx - 7} ${memTop - 10} l7 -9 l7 9" stroke="var(--leak)" stroke-width="3" fill="none"/>` : ""}`).join("")}
    <text x="${leakX[leakX.length - 1]! + 22}" y="${y0 + 46}" fill="var(--leak)" font-size="12" font-weight="900" text-anchor="end">いつも開いている通り道</text>
      
    <text x="${R - 14}" y="${y0 + 190}" fill="var(--gold)" font-size="14" font-weight="800" text-anchor="end">${plus > 0 ? "金の＋＝入ってきた＋のイオン" : ""}</text>
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
    <text x="${GL - 30}" y="${GT - 30}" fill="var(--ink)" font-size="13" font-weight="900">膜の電圧（mV）</text>
    
    
    ${Math.max(deltaMv(a, PULSE_MS), deltaMv(b, PULSE_MS)) > top ? `<text x="${xs(PULSE_MS / 2)}" y="${GT + 38}" fill="var(--gold)" font-size="13" font-weight="900" text-anchor="middle">↑ 線が枠の外へ出ている（上がった高さ ${Math.max(deltaMv(a, PULSE_MS), deltaMv(b, PULSE_MS)).toFixed(1)} mV）</text>` : ""}
    <polyline points="${line(a)}" fill="none" stroke="var(--soft)" stroke-width="2.5" stroke-dasharray="6 4"/>
    <polyline points="${line(b)}" fill="none" stroke="var(--you)" stroke-width="3.5"/>
    <line x1="${xs(t)}" x2="${xs(t)}" y1="${GT}" y2="${GB}" stroke="var(--gold)" stroke-width="2.5"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(a, t))}" r="6" fill="var(--panel)" stroke="var(--soft)" stroke-width="3"/>
    <circle cx="${xs(t)}" cy="${ys(deltaMv(b, t))}" r="7" fill="var(--you)"/>
    ${o.notes === false ? `<text x="${GL - 30}" y="${GB + 40}" fill="var(--soft)" font-size="12">点線＝${o.a}　実線＝${o.b}</text>` : `<text x="${GL - 30}" y="${GB + 42}" fill="var(--soft)" font-size="12">点線＝${o.a}　実線＝${o.b}　ms＝ミリ秒（1000分の1秒）</text>
    
    <text x="${GL - 30}" y="${GB + 76}" fill="var(--soft)" font-size="14" font-weight="800">この模型は、入口で電圧が上がって戻るところだけ（脳へ送るしくみは扱わない）</text>`}
  </g>`;
}

/**
 * 謎4の主の絵：膝の感覚の神経の端の膜を拡大し、膜の両側の電荷・入口（押されると開く）・いつも開いている通り道と、
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

/** 答えの地図：格子の各点が、どのラウンドで通るか（計算で塗る） */
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

/** すり抜けの地図（1c-3）：つまみの格子のます。赤＝書きなおした規則をすり抜ける試作品。判定は retrain.ts の結果そのまま */
export function retrainMap(x: number, y: number, w: number, h: number, cells: readonly { x: number; y: number; first: boolean; slips: boolean }[] , marks: { x: number; y: number; label: string }[], axes: { x: string; y: string }): string {
  const xs = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b);
  // 最初の規則を通る行が少ない（血管・膜）ときは、その行だけを拡大して見せる
  const firstYs = [...new Set(cells.filter((c) => c.first).map((c) => c.y))].sort((a, b) => a - b);
  const zoom = firstYs.length > 0 && firstYs.length <= 6;
  const ys = zoom ? firstYs : [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);
  if (zoom) cells = cells.filter((c) => firstYs.includes(c.y));
  const cw = w / xs.length;
  const H = zoom ? Math.min(h, ys.length * 64) : h;
  const oy = (h - H) / 2;
  const ch = H / ys.length;
  const col = (v: number) => xs.reduce((best, q, i) => (Math.abs(q - v) < Math.abs(xs[best]! - v) ? i : best), 0);
  const row = (v: number) => ys.reduce((best, q, i) => (Math.abs(q - v) < Math.abs(ys[best]! - v) ? i : best), 0);
  const cy = (r: number) => oy + H - (r + 0.5) * ch;
  let rects = "";
  for (const c of cells) {
    const fill = c.slips ? "var(--stamp)" : c.first ? "color-mix(in srgb, var(--you) 45%, var(--panel))" : "var(--chip)";
    rects += `<rect x="${(col(c.x) * cw).toFixed(1)}" y="${(oy + H - (row(c.y) + 1) * ch).toFixed(1)}" width="${(cw + 0.4).toFixed(1)}" height="${(ch + 0.4).toFixed(1)}" fill="${fill}"/>`;
  }
  const shown = zoom ? marks.filter((m) => ys.some((q) => Math.abs(q - m.y) < 1e-6)) : marks;
  return `<g transform="translate(${x},${y})">
    <rect y="${oy}" width="${w}" height="${H}" fill="var(--panel)" stroke="var(--line)"/>${rects}
    ${shown.map((m, k) => `<circle cx="${(col(m.x) + 0.5) * cw}" cy="${cy(row(m.y))}" r="8" fill="none" stroke="var(--ink)" stroke-width="3"/><text x="${(col(m.x) + 0.5) * cw + 12}" y="${cy(row(m.y)) - 10 - (zoom ? k * 16 : 0)}" fill="var(--ink)" font-size="14" font-weight="900">${m.label}</text>`).join("")}
    <text x="${w / 2}" y="${oy + H + 22}" fill="var(--soft)" font-size="13" text-anchor="middle">${axes.x} →</text>
    ${zoom ? ys.map((v, i) => `<text x="-8" y="${(cy(i) + 5).toFixed(1)}" fill="var(--soft)" font-size="12" text-anchor="end">${v.toFixed(2)}</text>`).join("") + `<text x="0" y="${oy - 12}" fill="var(--soft)" font-size="13" font-weight="800">いままでの数字では見本と区別できない試作品だけを拡大（左の数字＝${axes.y}）</text>` : `<text x="-14" y="${h / 2}" fill="var(--soft)" font-size="13" text-anchor="middle" transform="rotate(-90 -14 ${h / 2})">${axes.y} →</text>`}
    <g transform="translate(0,${h + 36})" font-size="12" font-weight="800">
      <rect width="14" height="14" fill="var(--stamp)"/><text x="20" y="12" fill="var(--ink)">すり抜ける</text>
      <rect x="110" width="14" height="14" fill="color-mix(in srgb, var(--you) 45%, var(--panel))"/><text x="130" y="12" fill="var(--ink)">見分けられる</text>
      <rect x="232" width="14" height="14" fill="var(--chip)"/><text x="252" y="12" fill="var(--ink)">いままでの数字で見分けられる</text>
    </g>
  </g>`;
}
