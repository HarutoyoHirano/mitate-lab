import { HIDDEN_CAUSES, type HiddenCauseId } from "../../scenarios/material1.js";
import type { Evidence } from "../../server/model/comparator.js";
import { BASE, ERROR, type CandidateId, type MaterialParams, type ObservationSpec } from "../../server/model/public.js";
import { forceAfterPush } from "../../server/model/sls.js";

/** 隠れた原因ごとに、どの候補が正しいか */
export const CORRECT_CANDIDATE: Readonly<Record<HiddenCauseId, CandidateId>> = {
  instantUp: "instant",
  instantDown: "instant",
  relaxSlow: "relax",
  relaxFast: "relax",
};

export interface Truth {
  readonly cause: HiddenCauseId;
  readonly params: MaterialParams;
  readonly correct: CandidateId;
}

/** 隠れた範囲の端点と内部の値（格子に乗らない値を含む） */
export function representativeTruths(): Truth[] {
  const fractions = [0, 0.137, 0.5, 0.861, 1];
  return HIDDEN_CAUSES.flatMap((c) =>
    fractions.map((f) => {
      const v = c.range[0] + (c.range[1] - c.range[0]) * f;
      return { cause: c.id, params: { ...BASE, [c.param]: v }, correct: CORRECT_CANDIDATE[c.id] };
    }),
  );
}

/** 誤差を符号（−1〜1）で指定して証拠を作る */
export function makeEvidence(params: MaterialParams, specs: readonly ObservationSpec[], signs: readonly number[]): Evidence[] {
  return specs.map((spec, i) => ({
    id: `ev${i}`,
    pushSeconds: spec.pushSeconds,
    recordAt: spec.recordAt,
    force: forceAfterPush(params, spec.pushSeconds, spec.recordAt) + (signs[i] ?? 0) * ERROR,
  }));
}

/** 各記録点の誤差を −100%・0・+100% に置いた全組み合わせ */
export function* allSignCombos(n: number): Generator<number[]> {
  const total = 3 ** n;
  for (let k = 0; k < total; k++) {
    const signs: number[] = [];
    let x = k;
    for (let i = 0; i < n; i++) {
      signs.push((x % 3) - 1);
      x = Math.floor(x / 3);
    }
    yield signs;
  }
}
