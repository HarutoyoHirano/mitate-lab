// 標準線形固体（ばね E∞ と、ばね E1・ダンパの直列を並べたもの）の解析解。
// 変形を指定する：深さ D まで T 秒かけて一定の速さで押し、その深さで保持する。
// 毎回、力がやわらぎきった状態（上乗せ分 0）から始める。
import { DEPTH, type MaterialParams } from "./public.js";

/** 押している間（0 ≤ t ≤ T）の力 */
export function forceDuringPush(p: MaterialParams, pushSeconds: number, t: number, depth = DEPTH): number {
  const r = depth / pushSeconds;
  const tt = Math.min(Math.max(t, 0), pushSeconds);
  return p.eInf * r * tt + p.e1 * r * p.tau * (1 - Math.exp(-tt / p.tau));
}

/** 押し終わってから recordAt 秒後の力 */
export function forceAfterPush(p: MaterialParams, pushSeconds: number, recordAt: number, depth = DEPTH): number {
  const r = depth / pushSeconds;
  const overshoot = p.e1 * r * p.tau * (1 - Math.exp(-pushSeconds / p.tau));
  return p.eInf * depth + overshoot * Math.exp(-recordAt / p.tau);
}
