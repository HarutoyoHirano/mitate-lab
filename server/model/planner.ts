// 実験計画の支援（二段）：残っている候補の組が、どの観察で分かれるかを計算する。
// 使うのは比較器の結果（公開モデルと証拠から計算したもの）だけ。隠れた原因は使わない。
import { ALLOWED_OBSERVATIONS, ERROR, WIDEN, type CandidateId, type ObservationSpec } from "./public.js";
import { compare, predict, type ComparisonResult, type Evidence } from "./comparator.js";

export type SeparationLevel = "decisive" | "separating";

export interface PairSeparation {
  readonly pair: readonly [CandidateId, CandidateId];
  readonly level: SeparationLevel;
}

export interface ObservationAdvice {
  readonly spec: ObservationSpec;
  /** 決め手になる組（誤差を広げた帯どうしが離れる） */
  readonly decisivePairs: readonly (readonly [CandidateId, CandidateId])[];
  /** 分かれ始める組（通常の誤差の帯どうしが離れる。決め手の組は含めない） */
  readonly separatingPairs: readonly (readonly [CandidateId, CandidateId])[];
  /** すでに同じ観察をした回数 */
  readonly repeats: number;
  readonly score: number;
  /** 残っている候補の予測の帯（誤差を広げたもの）を合わせた幅。どの組も確実には分けないときの目安 */
  readonly spread: number;
}

export interface PlanAdvice {
  /** 勧める順に並べた全15通り */
  readonly ranked: readonly ObservationAdvice[];
  /** 分かれる観察がひとつでもあるか */
  readonly anySeparating: boolean;
}

type Band = readonly [number, number];

function band(
  id: CandidateId,
  interval: readonly [number, number] | null,
  spec: ObservationSpec,
  errorWidth: number,
): Band | null {
  if (id === "same") {
    const v = predict("same", null, spec);
    return [v - errorWidth, v + errorWidth];
  }
  if (!interval) return null;
  const p1 = predict(id, interval[0], spec);
  const p2 = predict(id, interval[1], spec);
  return [Math.min(p1, p2) - errorWidth, Math.max(p1, p2) + errorWidth];
}

function apart(x: Band | null, y: Band | null): boolean {
  return !!x && !!y && (x[1] < y[0] || y[1] < x[0]);
}

function sameSpec(a: ObservationSpec, b: ObservationSpec): boolean {
  return a.pushSeconds === b.pushSeconds && a.recordAt === b.recordAt;
}

/** 証拠（または計算済みの比較結果）から、各観察の分かれ方を計算し、勧める順に並べる */
export function plan(evidence: readonly Evidence[], comparison: ComparisonResult = compare(evidence)): PlanAdvice {
  const alive = comparison.widenedSet;
  const pairs: [CandidateId, CandidateId][] = [];
  for (let i = 0; i < alive.length; i++)
    for (let j = i + 1; j < alive.length; j++) pairs.push([alive[i]!, alive[j]!]);

  const advices = ALLOWED_OBSERVATIONS.map((spec, order) => {
    const decisivePairs: (readonly [CandidateId, CandidateId])[] = [];
    const separatingPairs: (readonly [CandidateId, CandidateId])[] = [];
    for (const [x, y] of pairs) {
      const cx = comparison.candidates[x];
      const cy = comparison.candidates[y];
      if (apart(band(x, cx.widenedInterval, spec, ERROR * WIDEN), band(y, cy.widenedInterval, spec, ERROR * WIDEN))) {
        decisivePairs.push([x, y]);
      } else if (apart(band(x, cx.interval, spec, ERROR), band(y, cy.interval, spec, ERROR))) {
        separatingPairs.push([x, y]);
      }
    }
    const repeats = evidence.filter((ev) => sameSpec(ev, spec)).length;
    const score = 2 * decisivePairs.length + separatingPairs.length - 0.1 * repeats;
    const bands = alive
      .map((id) => band(id, comparison.candidates[id].widenedInterval, spec, ERROR * WIDEN))
      .filter((b): b is Band => b !== null);
    const spread = bands.length ? Math.max(...bands.map((b) => b[1])) - Math.min(...bands.map((b) => b[0])) : 0;
    return { advice: { spec, decisivePairs, separatingPairs, repeats, score, spread }, order };
  });
  // 1. 分ける組の多さ（決め手は2点、分かれ始めは1点、繰り返しは少し減点）
  // 2. 同点なら、結果の幅が広い観察（候補によって結果が大きく変わりうる）
  // 3. それも同じなら、押す時間の短い順・記録時刻の早い順
  advices.sort(
    (a, b) => b.advice.score - a.advice.score || b.advice.spread - a.advice.spread || a.order - b.order,
  );
  const ranked = advices.map((a) => a.advice);
  return {
    ranked,
    anySeparating: ranked.some((a) => a.decisivePairs.length + a.separatingPairs.length > 0),
  };
}

/** いちばん勧める観察 */
export function recommend(evidence: readonly Evidence[]): ObservationSpec {
  const top = plan(evidence).ranked[0];
  if (!top) throw new Error("許可された観察がない");
  return top.spec;
}
