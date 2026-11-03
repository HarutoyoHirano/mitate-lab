// 「この説明で重ねてみる」：候補の未知数を、押し終わりの測定値に合わせて決め、その候補の予測線を作る。
// 公開モデル・公開範囲・取得済みの証拠だけを使う（真の値は使わない。テスト21）。
import { BASE, CANDIDATES, type CandidateId, type MaterialParams, type PushSeconds } from "./public.js";
import { forceAfterPush, forceDuringPush } from "./sls.js";

export interface FitResult {
  readonly candidate: CandidateId;
  /** 合わせた未知数の値（same は null） */
  readonly value: number | null;
  /** 公開範囲の中で、押し終わりの高さに合わせられたか */
  readonly matched: boolean;
  /** 予測線を描く素材の値 */
  readonly params: MaterialParams;
}

const STEPS = 80;

/** 押し終わり（h=0）の測定値 y に、候補の未知数を合わせる。範囲内で届かなければ近い端を使い matched=false */
export function fitToEnd(candidate: CandidateId, pushSeconds: PushSeconds, y: number): FitResult {
  const info = CANDIDATES[candidate];
  if (!info.param || !info.range) return { candidate, value: null, matched: Math.abs(forceAfterPush(BASE, pushSeconds, 0) - y) <= 1e-9, params: BASE };
  const key = info.param;
  const [lo, hi] = info.range;
  const f = (v: number) => forceAfterPush({ ...BASE, [key]: v }, pushSeconds, 0);
  let value: number;
  let matched = true;
  if (f(lo) > y) {
    value = lo;
    matched = false;
  } else if (f(hi) < y) {
    value = hi;
    matched = false;
  } else {
    let a = lo;
    let b = hi;
    for (let i = 0; i < STEPS; i++) {
      const m = (a + b) / 2;
      if (f(m) < y) a = m;
      else b = m;
    }
    value = (a + b) / 2;
  }
  return { candidate, value, matched, params: { ...BASE, [key]: value } };
}

/** 予測線（押している間と、押し終わってから20秒まで） */
export function predictedCurve(params: MaterialParams, pushSeconds: number): { t: number; force: number }[] {
  const pts: { t: number; force: number }[] = [{ t: 0, force: 0 }];
  for (let k = 1; k <= 20; k++) pts.push({ t: (pushSeconds * k) / 20, force: forceDuringPush(params, pushSeconds, (pushSeconds * k) / 20) });
  for (let k = 1; k <= 80; k++) {
    const h = (20 * k) / 80;
    pts.push({ t: pushSeconds + h, force: forceAfterPush(params, pushSeconds, h) });
  }
  return pts;
}

/**
 * 候補の線を決める：押し終わりの高さに合わせた値を、取得済みの証拠全体と矛盾しない区間（比較器の区間）に収める。
 * 区間が空（その候補は記録と合わない）なら、押し終わりに合わせた線のまま（途中で外れることが見える）。
 * 押し終わりの力が未知数にほとんど依存しない押し方（すばやく押してやわらぐ時間を変える等）でも、正しい説明の線が暴れない。
 */
export function fitCandidate(candidate: CandidateId, pushSeconds: PushSeconds, yEnd: number, interval: readonly [number, number] | null): FitResult {
  const fit = fitToEnd(candidate, pushSeconds, yEnd);
  const info = CANDIDATES[candidate];
  if (!interval || fit.value === null || !info.param) return fit;
  const value = Math.min(interval[1], Math.max(interval[0], fit.value));
  return { ...fit, value, params: { ...BASE, [info.param]: value } };
}
