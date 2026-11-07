// 謎1「なぜ？」のつまみ（2026-11-07 深夜、作者の提案「ほかの謎と同じように理論値がパラメータによって変わる形の方がよくないか」）。
// 違うと思う部品を一つ選び、その部品のつまみを動かすと、予想の線（公開の式で計算した理論の線）が変わる。
// 「重なった」は、記録のすべての点が、線から 測るたびのぶれ×2（比較器の広げた幅 WIDEN）の内側にあるとき。
// これは比較器の「誤差を2倍にした区間」に、つまみの値が入っていることと同じ（演出は判定と同じ結果から）。
// 通常のぶれ（×1）にすると、ぶれ方によっては合う値が一点しかなく、つまみでは合わせられないため（計算で確かめた）。
import { predict, type Evidence } from "./comparator.js";
import { BASE, ERROR, WIDEN, type CandidateId } from "./public.js";

export type KnobId = Exclude<CandidateId, "same">;

export interface KnobSpec {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** つまみの刻みの数（0..n） */
  readonly n: number;
  /** 対数の目盛り（増えたかたさが消えていくまでの時間） */
  readonly log: boolean;
  readonly unit: string;
}

/** つまみの範囲は公開範囲の内側。どれも見本の値 1 が目盛りの上にある */
export const KNOBS: Readonly<Record<KnobId, KnobSpec>> = Object.freeze({
  overall: { label: "待ったあとも残るかたさ", min: 0.5, max: 2, n: 150, log: false, unit: "" },
  instant: { label: "押した直後だけ増えるかたさ", min: 0, max: 3, n: 300, log: false, unit: "" },
  relax: { label: "増えたかたさが消えていくまでの時間", min: 0.1, max: 10, n: 200, log: true, unit: "秒" },
});

/** 線の帯の幅（線から上下にこの幅まで。測るたびのぶれ 0.02 の2倍） */
export const FIT_BAND = ERROR * WIDEN;
const EPS = 1e-9;

export function knobValue(id: KnobId, pos: number): number {
  const k = KNOBS[id];
  const p = Math.max(0, Math.min(k.n, Math.round(pos)));
  return k.log ? k.min * Math.pow(k.max / k.min, p / k.n) : k.min + ((k.max - k.min) * p) / k.n;
}

export function knobPos(id: KnobId, value: number): number {
  const k = KNOBS[id];
  const r = k.log ? Math.log(value / k.min) / Math.log(k.max / k.min) : (value - k.min) / (k.max - k.min);
  return Math.max(0, Math.min(k.n, Math.round(r * k.n)));
}

/** 見本 A の値の位置（つまみのはじめ） */
export function basePos(id: KnobId): number {
  return knobPos(id, id === "overall" ? BASE.eInf : id === "instant" ? BASE.e1 : BASE.tau);
}

type Rec = Pick<Evidence, "pushSeconds" | "recordAt" | "force">;

/** 一つの記録の点と、その部品をこの値にしたときの線との差 */
export function knobDiff(id: CandidateId, value: number | null, r: Rec): number {
  return r.force - predict(id, id === "same" ? null : value, r);
}

/** 記録の点が、線の帯の内側にあるか（点ごと） */
export function knobInBand(id: CandidateId, value: number | null, r: Rec): boolean {
  return Math.abs(knobDiff(id, value, r)) <= FIT_BAND + EPS;
}

/** 記録のすべての点が帯の内側＝重なった */
export function knobFits(id: CandidateId, value: number | null, records: readonly Rec[]): boolean {
  return records.length > 0 && records.every((r) => knobInBand(id, value, r));
}

/** つまみの目盛りのどこかで重なるか（テストと、答え合わせの文のため） */
export function knobAnyFit(id: CandidateId, records: readonly Rec[]): number | null {
  if (id === "same") return knobFits("same", null, records) ? 0 : null;
  for (let p = 0; p <= KNOBS[id].n; p++) if (knobFits(id, knobValue(id, p), records)) return p;
  return null;
}
