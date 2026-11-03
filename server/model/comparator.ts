// 仮説比較器：公開モデル・基準カード・候補の範囲・取得済みの証拠だけを使う。
// 隠れた原因や真の値は受け取らない（引数の型にも存在しない）。
import { BASE, CANDIDATES, CANDIDATE_IDS, ERROR, WIDEN, type CandidateId, type ObservationSpec } from "./public.js";
import { forceAfterPush } from "./sls.js";

/** 証拠として使う観測（Bの一点） */
export interface Evidence extends ObservationSpec {
  readonly id: string;
  readonly force: number;
}

export type CandidateStatus = "consistent" | "undetermined" | "inconsistent";
export type OverallState = "narrowed" | "unresolved" | "onlyWidened" | "noneFits";

export interface CandidateResult {
  readonly status: CandidateStatus;
  /** 通常の誤差で合う未知数の区間（same と、合わない場合は null） */
  readonly interval: readonly [number, number] | null;
  /** 誤差を広げたときに合う未知数の区間 */
  readonly widenedInterval: readonly [number, number] | null;
}

export interface ComparisonResult {
  readonly candidates: Readonly<Record<CandidateId, CandidateResult>>;
  readonly overall: OverallState;
  /** overall が narrowed のときだけ、その候補 */
  readonly narrowedTo: CandidateId | null;
  /** 通常の誤差で残る候補（N） */
  readonly normalSet: readonly CandidateId[];
  /** 誤差を広げて残る候補（W） */
  readonly widenedSet: readonly CandidateId[];
}

const EPS = 1e-9;
const BISECTION_STEPS = 100;

/** 候補の未知数を v にしたときの予測（Aと一つだけ違う素材） */
export function predict(id: CandidateId, value: number | null, spec: ObservationSpec): number {
  const info = CANDIDATES[id];
  if (!info.param || value === null) return forceAfterPush(BASE, spec.pushSeconds, spec.recordAt);
  return forceAfterPush({ ...BASE, [info.param]: value }, spec.pushSeconds, spec.recordAt);
}

/**
 * 非減少関数 f について、[lo, hi] の中で y−e ≤ f(v) ≤ y+e となる v の閉区間を返す。
 * 平坦な部分を正しく扱うため、下端は「f(v) ≥ y−e の最小」、上端は「f(v) ≤ y+e の最大」で求める。
 */
export function invertNonDecreasing(
  f: (v: number) => number,
  lo: number,
  hi: number,
  y: number,
  e: number,
): [number, number] | null {
  const a = y - e - EPS;
  const b = y + e + EPS;
  if (f(hi) < a || f(lo) > b) return null;
  let lower: number;
  if (f(lo) >= a) lower = lo;
  else {
    let x = lo;
    let z = hi;
    for (let i = 0; i < BISECTION_STEPS; i++) {
      const m = (x + z) / 2;
      if (f(m) >= a) z = m;
      else x = m;
    }
    lower = x;
  }
  let upper: number;
  if (f(hi) <= b) upper = hi;
  else {
    let x = lo;
    let z = hi;
    for (let i = 0; i < BISECTION_STEPS; i++) {
      const m = (x + z) / 2;
      if (f(m) <= b) x = m;
      else z = m;
    }
    upper = z;
  }
  return lower <= upper ? [lower, upper] : null;
}

/** 一つの候補について、証拠と合う未知数の区間（共通部分）を求める */
export function candidateInterval(
  id: CandidateId,
  evidence: readonly Evidence[],
  errorWidth: number,
): [number, number] | null {
  const info = CANDIDATES[id];
  if (!info.param || !info.range) throw new Error(`候補 ${id} は未知数を持たない`);
  let [lo, hi] = info.range;
  for (const ev of evidence) {
    const iv = invertNonDecreasing((v) => predict(id, v, ev), info.range[0], info.range[1], ev.force, errorWidth);
    if (!iv) return null;
    lo = Math.max(lo, iv[0]);
    hi = Math.min(hi, iv[1]);
    if (lo > hi + EPS) return null;
  }
  return [lo, Math.max(lo, hi)];
}

function sameFits(evidence: readonly Evidence[], errorWidth: number): boolean {
  return evidence.every((ev) => Math.abs(predict("same", null, ev) - ev.force) <= errorWidth + EPS);
}

function judgeCandidate(id: CandidateId, evidence: readonly Evidence[]): CandidateResult {
  if (id === "same") {
    const normal = sameFits(evidence, ERROR);
    const widened = normal || sameFits(evidence, ERROR * WIDEN);
    return {
      status: normal ? "consistent" : widened ? "undetermined" : "inconsistent",
      interval: null,
      widenedInterval: null,
    };
  }
  const interval = candidateInterval(id, evidence, ERROR);
  const widenedInterval = candidateInterval(id, evidence, ERROR * WIDEN);
  return {
    status: interval ? "consistent" : widenedInterval ? "undetermined" : "inconsistent",
    interval,
    widenedInterval,
  };
}

/** 証拠から、候補ごとの判定と、探究全体の状態（4状態）を求める */
export function compare(evidence: readonly Evidence[]): ComparisonResult {
  const entries = CANDIDATE_IDS.map((id) => [id, judgeCandidate(id, evidence)] as const);
  const candidates = Object.fromEntries(entries) as Record<CandidateId, CandidateResult>;
  const normalSet = CANDIDATE_IDS.filter((id) => candidates[id].status === "consistent");
  const widenedSet = CANDIDATE_IDS.filter((id) => candidates[id].status !== "inconsistent");
  let overall: OverallState;
  if (normalSet.length === 1 && widenedSet.length === 1) overall = "narrowed";
  else if (widenedSet.length === 0) overall = "noneFits";
  else if (normalSet.length === 0) overall = "onlyWidened";
  else overall = "unresolved";
  return {
    candidates,
    overall,
    narrowedTo: overall === "narrowed" ? (normalSet[0] ?? null) : null,
    normalSet,
    widenedSet,
  };
}

/** 画面に出す全体の状態の言葉（比較器と画面・Claudeで共通に使う） */
export const OVERALL_LABELS: Readonly<Record<OverallState, string>> = Object.freeze({
  narrowed: "この候補の中では一つに絞れた",
  unresolved: "まだ説明を分けきれない",
  onlyWidened: "通常の誤差では合わないが、誤差を広げると説明が残る",
  noneFits: "今の候補では説明できない",
});

export const STATUS_LABELS: Readonly<Record<CandidateStatus, string>> = Object.freeze({
  consistent: "整合",
  undetermined: "まだ判断できない",
  inconsistent: "整合しにくい",
});
