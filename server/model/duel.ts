// ゲーム版 事件2「仕掛けろ」：走行テストで対決する。プレイヤーがつくった試験用のクッションが、
// 検査ロボの走行検査（12歩目の一点）をすり抜け、別の点には違いを残すか。
// 隠れた答えは持たない。公開の式だけで、誤差なしに判定する（画面とテストで同じ関数を使う）。
import { BASE, TEST_TOLERANCE, type MaterialParams } from "./public.js";
import { forceAfterPush } from "./sls.js";
import { PHASE_LABEL, STEP_COUNT, stepDents, type StepPhase } from "./steps.js";

/** ロボの走行検査のテンポ（ゆっくり歩く：一歩6秒） */
export const DUEL_PERIOD = 6;
/** ロボが見る一歩（12歩目） */
export const DUEL_STEP = STEP_COUNT - 1;

export interface StepCheck {
  readonly phase: StepPhase;
  /** 画面の呼び方 */
  readonly label: string;
}

const pointLabel = (phase: StepPhase) => `ゆっくり歩いて12歩目の${PHASE_LABEL[phase]}の沈み込み`;
export const LAND_CHECK: StepCheck = { phase: "land", label: pointLabel("land") };
export const PEAK_CHECK: StepCheck = { phase: "peak", label: pointLabel("peak") };

/** 最後の検査（事件1のいつもの検査）：試験台でふつう（1秒）押して20秒後の力 */
export const FINAL_CHECK = { pushSeconds: 1 as const, recordAt: 20, label: "試験台でふつう（1秒）に押して20秒後の力" };

/** ロボの検査を通る差の大きさ／隠す違いとして必要な差の大きさ（沈み込み。深さ1に対する割合） */
export const ROBOT_PASS = 0.03;
export const HIDDEN_NEED = 0.08;

export interface DuelRound {
  readonly id: 1 | 2;
  readonly robot: StepCheck;
  readonly hidden: StepCheck;
  readonly robotLine: string;
}

export const DUEL_ROUNDS: readonly DuelRound[] = [
  { id: 1, robot: LAND_CHECK, hidden: PEAK_CHECK, robotLine: "走行検査を追加しました。ゆっくり歩かせて、12歩目の「着地直後」の沈み込みを見ます。すり抜けられますか？" },
  { id: 2, robot: PEAK_CHECK, hidden: LAND_CHECK, robotLine: "測り方を変えます。今度は12歩目の「足を上げる直前」。同じ攻略で通るかな？" },
];

export const DUEL_SLIDERS = {
  e1: { min: 0.2, max: 2.2, step: 0.05, label: "押した直後だけ上乗せされるかたさ" },
  tau: { min: 0.4, max: 4, step: 0.05, label: "上乗せ分がやわらぐ時間" },
} as const;

export function duelMaterial(e1: number, tau: number): MaterialParams {
  return { eInf: BASE.eInf, e1, tau };
}

/** ロボの走行検査と同じ歩き方で、12歩ぶんの沈み込み（走行テストと同じ式） */
export function duelSteps(p: MaterialParams) {
  return stepDents(p, DUEL_PERIOD);
}

export function stepCheckDiff(p: MaterialParams, c: StepCheck): { a: number; b: number; diff: number } {
  const a = duelSteps(BASE)[DUEL_STEP]![c.phase];
  const b = duelSteps(p)[DUEL_STEP]![c.phase];
  return { a, b, diff: b - a };
}

export function finalCheckDiff(p: MaterialParams): { a: number; b: number; diff: number } {
  const a = forceAfterPush(BASE, FINAL_CHECK.pushSeconds, FINAL_CHECK.recordAt);
  const b = forceAfterPush(p, FINAL_CHECK.pushSeconds, FINAL_CHECK.recordAt);
  return { a, b, diff: b - a };
}

export interface DuelResult {
  readonly final: { a: number; b: number; diff: number; ok: boolean };
  readonly robot: { a: number; b: number; diff: number; ok: boolean };
  readonly hidden: { a: number; b: number; diff: number; ok: boolean };
  readonly cleared: boolean;
}

export function judgeDuel(round: DuelRound, p: MaterialParams): DuelResult {
  const f = finalCheckDiff(p);
  const r = stepCheckDiff(p, round.robot);
  const h = stepCheckDiff(p, round.hidden);
  const final = { ...f, ok: Math.abs(f.diff) <= TEST_TOLERANCE + 1e-12 };
  const robot = { ...r, ok: Math.abs(r.diff) <= ROBOT_PASS + 1e-12 };
  const hidden = { ...h, ok: Math.abs(h.diff) >= HIDDEN_NEED - 1e-12 };
  return { final, robot, hidden, cleared: final.ok && robot.ok && hidden.ok };
}
