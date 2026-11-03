// 素材をつくる挑戦：隠れた答えは持たない。公開の式だけで、二つの検査の合否を計算する（画面とテストで同じ関数を使う）
import { BASE, TEST_TOLERANCE, type MaterialParams } from "./public.js";
import { forceAfterPush } from "./sls.js";

export const SLIDERS = {
  eInf: { min: 0.5, max: 2, step: 0.01, label: "待ったあとも残るかたさ" },
  e1: { min: 0, max: 3, step: 0.01, label: "押した直後だけ上乗せされるかたさ" },
  tau: { min: 0.1, max: 5, step: 0.05, label: "上乗せ分がやわらぐ時間" },
} as const;

/** いつもの検査：ふつう（1秒）に押して20秒後 */
export const USUAL_TEST = { pushSeconds: 1, recordAt: 20 } as const;
/** すばやい検査：すばやく（0.2秒）押した直後 */
export const QUICK_TEST = { pushSeconds: 0.2, recordAt: 0 } as const;

export type MissionId = "hideFromUsual" | "hideFromQuick";

export interface Mission {
  readonly id: MissionId;
  readonly title: string;
  readonly goal: string;
}

export const MISSIONS: readonly Mission[] = [
  {
    id: "hideFromUsual",
    title: "ミッション1：いつもの検査をすり抜けろ",
    goal: "いつもの検査では「見本と区別できない」と判定される（差0.03以下）のに、すばやく押すと違いがバレる（差0.15以上）素材をつくろう",
  },
  {
    id: "hideFromQuick",
    title: "ミッション2：逆もできる？",
    goal: "すばやく押すと見本と区別できない（差0.03以下）のに、いつもの検査では「見本と違う」と判定される（差0.1以上）素材をつくろう",
  },
];

export interface TestDiff {
  readonly usual: number;
  readonly quick: number;
}

export function testDiffs(p: MaterialParams): TestDiff {
  const at = (q: MaterialParams, s: { pushSeconds: number; recordAt: number }) => forceAfterPush(q, s.pushSeconds, s.recordAt);
  return { usual: at(p, USUAL_TEST) - at(BASE, USUAL_TEST), quick: at(p, QUICK_TEST) - at(BASE, QUICK_TEST) };
}

export function missionResult(id: MissionId, p: MaterialParams): { passed: boolean; usualOk: boolean; quickOk: boolean; diffs: TestDiff } {
  const d = testDiffs(p);
  if (id === "hideFromUsual") {
    const usualOk = Math.abs(d.usual) <= TEST_TOLERANCE;
    const quickOk = Math.abs(d.quick) >= 0.15;
    return { passed: usualOk && quickOk, usualOk, quickOk, diffs: d };
  }
  const quickOk = Math.abs(d.quick) <= TEST_TOLERANCE;
  const usualOk = Math.abs(d.usual) >= 0.1;
  return { passed: usualOk && quickOk, usualOk, quickOk, diffs: d };
}
