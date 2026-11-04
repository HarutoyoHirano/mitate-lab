// テスト39：事件1のイメージムービー（導入の物語。謎解きの手がかりを見せない）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE } from "../../server/model/public.js";
import { dentWithinStep, DUTY, MOVIE_RUN, MOVIE_WALK, stepDents } from "../../server/model/steps.js";

describe("テスト39：イメージムービー", () => {
  it("表示用のへこみ（見本の値）は、一歩の4点で stepDents と一致する", () => {
    for (const P of [MOVIE_WALK, MOVIE_RUN]) {
      const s = stepDents(BASE, P, 6);
      for (let k = 0; k < s.length; k++) {
        expect(dentWithinStep(BASE, P, s, k, 0)).toBeCloseTo(s[k]!.land, 9);
        expect(dentWithinStep(BASE, P, s, k, DUTY - 1e-12)).toBeCloseTo(s[k]!.peak, 6);
        expect(dentWithinStep(BASE, P, s, k, DUTY + 1e-12)).toBeCloseTo(s[k]!.lift, 6);
        expect(dentWithinStep(BASE, P, s, k, 1)).toBeCloseTo(s[k]!.pre, 9);
      }
    }
  });
  it("ムービーは見本の値だけで描き、別の素材（比べる例）を持たない", () => {
    const src = readFileSync(new URL("../../src/play/art.ts", import.meta.url), "utf-8");
    const movie = src.slice(src.indexOf("// ---------- 事件1：イメージムービー"), src.indexOf("/** 拍の列"));
    expect(movie.length).toBeGreaterThan(100);
    // 数値で素材をつくらない（eInf・e1・tau を書かない）。使う素材は BASE だけ
    expect(movie).not.toMatch(/eInf|e1\s*:|tau\s*:/);
    expect(movie).not.toMatch(/MOVIE_EXAMPLE/);
  });
});
