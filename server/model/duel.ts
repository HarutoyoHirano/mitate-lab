// ゲーム版 謎2「仕掛けろ」：走行テストで対決する。プレイヤーがつくった試験用のクッションが、
// 検査ロボの走行検査（謎1と同じ「走る」の1歩目の一点）をすり抜け、別の点には違いを残すか。
// 隠れた答えは持たない。公開の式だけで、誤差なしに判定する（画面とテストで同じ関数を使う）。
import { BASE, TEST_TOLERANCE, type MaterialParams } from "./public.js";
import { forceAfterPush } from "./sls.js";
import { PHASE_LABEL, PLAY_RUN_PERIOD, stepDents, type StepPhase } from "./steps.js";

/** ロボの走行検査のテンポ（謎1と同じ「走る」。2026-11-06、作者の指摘「ゆっくりした歩きは誰にも伝わらない」「12歩目の意味は？」により、ゆっくり歩く12歩目から変えた） */
export const DUEL_PERIOD = PLAY_RUN_PERIOD;
/** ロボが見る一歩（1歩目） */
export const DUEL_STEP = 0;

export interface StepCheck {
  readonly phase: StepPhase;
  /** 画面の呼び方 */
  readonly label: string;
}

const pointLabel = (phase: StepPhase) => `走って1歩目の${PHASE_LABEL[phase]}のへこみ`;
export const LAND_CHECK: StepCheck = { phase: "land", label: pointLabel("land") };
export const LIFT_CHECK: StepCheck = { phase: "lift", label: pointLabel("lift") };

/** 最後の検査（謎1のいつもの検査）：試験台でふつう（1秒）押して20秒後の力 */
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
  { id: 1, robot: LAND_CHECK, hidden: LIFT_CHECK, robotLine: `いつもの検査（押して20秒後の力）に、走行検査を足しました。見破れと同じように走らせて、1歩目の「着地した直後」のへこみを見ます。あなたへの課題：その二つでは見本とのちがいを ${ROBOT_PASS} より小さくして、私に「区別できません」と言わせてください。そのうえで「足を上げた直後」には、${HIDDEN_NEED} より大きいちがいを残すこと。` },
  { id: 2, robot: LIFT_CHECK, hidden: LAND_CHECK, robotLine: `見る場所を変えます。今度は1歩目の「足を上げた直後」を見ます（押して20秒後の力も見ます）。課題：そこでは見本とのちがいを ${ROBOT_PASS} より小さく。そのうえで「着地した直後」には、${HIDDEN_NEED} より大きいちがいを残すこと。前の試作品のままでは、この課題は満たせません。` },
];

export const DUEL_SLIDERS = {
  // 画面の呼び方（2026-11-05 夜、作者の指摘で、効き方の言葉に）。e1 は「着地の瞬間のかたさ」＝待ったあとも残るかたさ（1）＋e1 として見せる（offset）
  e1: { min: 0.2, max: 2.2, step: 0.05, label: "着地の瞬間のかたさ", offset: BASE.eInf },
  tau: { min: 0.4, max: 4, step: 0.05, label: "かたさが消えるまでの時間", offset: 0 },
} as const;

export function duelMaterial(e1: number, tau: number): MaterialParams {
  return { eInf: BASE.eInf, e1, tau };
}

/** ロボの走行検査と同じ走り方で、一歩ごとのへこみ（走行テストと同じ式） */
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
