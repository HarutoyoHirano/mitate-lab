// ゲーム版 事件2「仕掛けろ」：プレイヤーがつくった素材が、検査ロボの測り方をすり抜け、別の測り方には違いを残すか。
// 隠れた答えは持たない。公開の式だけで、誤差なしに判定する（画面とテストで同じ関数を使う）。
import { BASE, TEST_TOLERANCE, type MaterialParams } from "./public.js";
import { forceAfterPush } from "./sls.js";

export interface Check {
  readonly pushSeconds: 0.2 | 1 | 5;
  readonly recordAt: number;
  /** 画面の呼び方 */
  readonly label: string;
}

export const FINAL_CHECK: Check = { pushSeconds: 1, recordAt: 20, label: "ふつう（1秒）に押して20秒後" };
export const QUICK_END: Check = { pushSeconds: 0.2, recordAt: 0, label: "すばやく（0.2秒）押した直後" };
export const TWO_SECONDS: Check = { pushSeconds: 1, recordAt: 2, label: "ふつう（1秒）に押して2秒後" };

/** ロボの検査を通る差の大きさ／隠す違いとして必要な差の大きさ */
export const ROBOT_PASS = 0.08;
export const HIDDEN_NEED = 0.12;

export interface DuelRound {
  readonly id: 1 | 2;
  readonly robot: Check;
  readonly hidden: Check;
  readonly robotLine: string;
}

export const DUEL_ROUNDS: readonly DuelRound[] = [
  { id: 1, robot: QUICK_END, hidden: TWO_SECONDS, robotLine: "私は「すばやく押した直後」を見ます。この瞬間を、すり抜けられますか？" },
  { id: 2, robot: TWO_SECONDS, hidden: QUICK_END, robotLine: "測り方を変えます。今度は「ふつうに押して2秒後」。同じ攻略で通るかな？" },
];

export const DUEL_SLIDERS = {
  e1: { min: 0.2, max: 2.2, step: 0.05, label: "押した直後だけ上乗せされるかたさ" },
  tau: { min: 0.4, max: 4, step: 0.05, label: "上乗せ分がやわらぐ時間" },
} as const;

export function duelMaterial(e1: number, tau: number): MaterialParams {
  return { eInf: BASE.eInf, e1, tau };
}

export function checkDiff(p: MaterialParams, c: Check): { a: number; b: number; diff: number } {
  const a = forceAfterPush(BASE, c.pushSeconds, c.recordAt);
  const b = forceAfterPush(p, c.pushSeconds, c.recordAt);
  return { a, b, diff: b - a };
}

export interface DuelResult {
  readonly final: { a: number; b: number; diff: number; ok: boolean };
  readonly robot: { a: number; b: number; diff: number; ok: boolean };
  readonly hidden: { a: number; b: number; diff: number; ok: boolean };
  readonly cleared: boolean;
}

export function judgeDuel(round: DuelRound, p: MaterialParams): DuelResult {
  const f = checkDiff(p, FINAL_CHECK);
  const r = checkDiff(p, round.robot);
  const h = checkDiff(p, round.hidden);
  const final = { ...f, ok: Math.abs(f.diff) <= TEST_TOLERANCE + 1e-12 };
  const robot = { ...r, ok: Math.abs(r.diff) <= ROBOT_PASS + 1e-12 };
  const hidden = { ...h, ok: Math.abs(h.diff) >= HIDDEN_NEED - 1e-12 };
  return { final, robot, hidden, cleared: final.ok && robot.ok && hidden.ok };
}
