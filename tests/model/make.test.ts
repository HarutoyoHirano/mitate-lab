// CLAUDE.md 第7章のテスト14（素材をつくる挑戦）
import { describe, expect, it } from "vitest";
import { MISSIONS, missionResult, SLIDERS } from "../../server/model/make.js";
import { BASE } from "../../server/model/public.js";

describe("テスト14：素材をつくる挑戦", () => {
  for (const m of MISSIONS) {
    it(`${m.title}：つまみの範囲内で合格できる組み合わせがあり、見本そのままでは合格しない`, () => {
      expect(missionResult(m.id, BASE).passed).toBe(false);
      let found = false;
      const steps = 40;
      for (let i = 0; i <= steps && !found; i++)
        for (let j = 0; j <= steps && !found; j++)
          for (let k = 0; k <= steps && !found; k++) {
            const p = {
              eInf: SLIDERS.eInf.min + ((SLIDERS.eInf.max - SLIDERS.eInf.min) * i) / steps,
              e1: SLIDERS.e1.min + ((SLIDERS.e1.max - SLIDERS.e1.min) * j) / steps,
              tau: SLIDERS.tau.min + ((SLIDERS.tau.max - SLIDERS.tau.min) * k) / steps,
            };
            if (missionResult(m.id, p).passed) found = true;
          }
      expect(found).toBe(true);
    });
  }
});
