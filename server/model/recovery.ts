// 離した後の形の戻り（標準線形固体）。押し終わってから HOLD 秒保持した後、外力を瞬時にゼロにする（慣性は無視）。
// 離した瞬間にへこみは F−/(E∞+E1) だけ戻り、残り x0 は時定数 τrec＝τ(E∞+E1)/E∞ で戻る（テスト23）。
// 形の記録は比較器の証拠に使わない（発見と証拠写真のため）。
import { DEPTH, type MaterialParams } from "./public.js";
import { forceAfterPush } from "./sls.js";

/** 押し終わってから離すまでの保持時間（いつもの検査の時刻と同じ） */
export const HOLD_BEFORE_RELEASE = 20;
/** 形の記録：離してから 0〜40 秒、0.5 秒ごと */
export const RECOVERY_MAX = 40;
export const RECOVERY_STEP = 0.5;
export const RECOVERY_TIMES: readonly number[] = Array.from({ length: RECOVERY_MAX / RECOVERY_STEP + 1 }, (_, i) => i * RECOVERY_STEP);
/** 形の測定誤差（深さ1に対する割合） */
export const SHAPE_ERROR = 0.01;
/** 形の判定幅（力の許容差とは別に定めた値） */
export const SHAPE_TOLERANCE = 0.03;

export interface RecoveryParams {
  /** 離した直後に残るへこみ */
  readonly x0: number;
  /** 戻りの時定数 */
  readonly tauRec: number;
  /** 離す直前の力 */
  readonly forceBefore: number;
}

export function recoveryParams(p: MaterialParams, pushSeconds: number, hold = HOLD_BEFORE_RELEASE, depth = DEPTH): RecoveryParams {
  const forceBefore = forceAfterPush(p, pushSeconds, hold, depth);
  const x0 = depth - forceBefore / (p.eInf + p.e1);
  return { x0, tauRec: (p.tau * (p.eInf + p.e1)) / p.eInf, forceBefore };
}

/** 離してから h 秒後のへこみ */
export function dentAfterRelease(p: MaterialParams, pushSeconds: number, h: number, hold = HOLD_BEFORE_RELEASE): number {
  const r = recoveryParams(p, pushSeconds, hold);
  return r.x0 * Math.exp(-Math.max(0, h) / r.tauRec);
}

/** 写真の判定：同じ時刻のAとBのへこみの差が判定幅を超えたら「区別できる」 */
export function judgePhoto(dentB: number, dentA: number): { diff: number; distinguishable: boolean } {
  const diff = dentB - dentA;
  return { diff, distinguishable: Math.abs(diff) > SHAPE_TOLERANCE + 1e-12 };
}

export interface RecoveryPoint {
  /** 離してからの秒数 */
  readonly h: number;
  /** へこみ（深さ1に対する割合） */
  readonly dent: number;
}
