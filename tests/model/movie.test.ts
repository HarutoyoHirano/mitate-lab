// テスト39：事件1のイメージムービーの「例：戻りにくい軟骨」
import { describe, expect, it } from "vitest";
import { BASE, INTRO_OBSERVATION } from "../../server/model/public.js";
import { forceAfterPush } from "../../server/model/sls.js";
import { dentWithinStep, DUTY, MOVIE_EXAMPLE, MOVIE_RUN, MOVIE_WALK, stepDents } from "../../server/model/steps.js";
import { HIDDEN_CAUSES } from "../../scenarios/material1.js";

describe("テスト39：イメージムービーの例の軟骨", () => {
  it("例は隠れた範囲の外にある（Bの答えにならない）", () => {
    for (const c of HIDDEN_CAUSES) {
      const v = MOVIE_EXAMPLE[c.param];
      const base = BASE[c.param];
      // 例が一つの値だけ見本と違い、その値は隠れた範囲の外
      if (v !== base) expect(v < c.range[0] || v > c.range[1]).toBe(true);
    }
  });
  it("ロボの検査（ふつう1秒で押して20秒後）では、見本との差が 0.03 以内", () => {
    const a = forceAfterPush(BASE, INTRO_OBSERVATION.pushSeconds, INTRO_OBSERVATION.recordAt);
    const b = forceAfterPush(MOVIE_EXAMPLE, INTRO_OBSERVATION.pushSeconds, INTRO_OBSERVATION.recordAt);
    expect(Math.abs(b - a)).toBeLessThanOrEqual(0.03);
  });
  it("走ると、一歩ごとのへこみの差が 0.03 を超える", () => {
    const a = stepDents(BASE, MOVIE_RUN, 8);
    const b = stepDents(MOVIE_EXAMPLE, MOVIE_RUN, 8);
    const max = Math.max(...a.map((d, k) => Math.max(...(["land", "peak", "lift", "pre"] as const).map((ph) => Math.abs(b[k]![ph] - d[ph])))));
    expect(max).toBeGreaterThan(0.03);
  });
  it("表示用のへこみは、一歩の4点で stepDents と一致する", () => {
    for (const p of [BASE, MOVIE_EXAMPLE]) {
      for (const P of [MOVIE_WALK, MOVIE_RUN]) {
        const s = stepDents(p, P, 6);
        for (let k = 0; k < s.length; k++) {
          expect(dentWithinStep(p, P, s, k, 0)).toBeCloseTo(s[k]!.land, 9);
          expect(dentWithinStep(p, P, s, k, DUTY - 1e-12)).toBeCloseTo(s[k]!.peak, 6);
          expect(dentWithinStep(p, P, s, k, DUTY + 1e-12)).toBeCloseTo(s[k]!.lift, 6);
          expect(dentWithinStep(p, P, s, k, 1)).toBeCloseTo(s[k]!.pre, 9);
        }
      }
    }
  });
});
