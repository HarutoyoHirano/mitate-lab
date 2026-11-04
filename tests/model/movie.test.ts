// テスト39：謎1〜4の導入ムービー（導入の物語。謎解きの手がかりを見せない）
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
    const movie = src.slice(src.indexOf("// ---------- 謎1：イメージムービー"), src.indexOf("/** 拍の列"));
    expect(movie.length).toBeGreaterThan(100);
    // 数値で素材をつくらない（eInf・e1・tau を書かない）。使う素材は BASE だけ
    expect(movie).not.toMatch(/eInf|e1\s*:|tau\s*:/);
    expect(movie).not.toMatch(/MOVIE_EXAMPLE/);
    // 血管・膜も見本だけ（Bの固定例を使わない）
    expect(movie).not.toMatch(/CASE_VESSEL_B|CASE3_B/);
    expect(movie).not.toMatch(/\{\s*r\s*:|\{\s*g\s*:/);
  });
  it("四つとも三つの場面と結びがあり、長さが正（1c-2：内部の番号は 1・2・4・5）", async () => {
    const { movieOutline, introMovie } = await import("../../src/play/art.js");
    for (const id of [1, 2, 4, 5] as const) {
      const o = movieOutline(id);
      expect(o.scenes).toBe(3);
      expect(o.length).toBeGreaterThan(10);
      expect(o.end.length).toBeGreaterThan(10);
      // 途中と結びの絵が描ける（NaN を含まない）
      for (const t of [0, o.length / 2, o.length - 0.01, o.length]) expect(introMovie(id, t)).not.toMatch(/NaN|undefined/);
    }
  });
  it("血管のムービーと血管の謎の画面には、電気の言葉を出さない（回路は膜で初めて出す：1c-2）", () => {
    const art = readFileSync(new URL("../../src/play/art.ts", import.meta.url), "utf-8");
    const m4 = art.slice(art.indexOf("  4: {\n    scenes: ["), art.indexOf("  5: {\n    scenes: ["));
    expect(m4.length).toBeGreaterThan(100);
    expect(m4).not.toMatch(/回路|コンデンサ|電流|電気|抵抗/);
    const main = readFileSync(new URL("../../src/play/main.ts", import.meta.url), "utf-8");
    const vessel = main.slice(main.indexOf("// ---------- 謎3：脈の見落とし"), main.indexOf("// ---------- 謎4：膜の見落とし"));
    expect(vessel.length).toBeGreaterThan(1000);
    expect(vessel).not.toMatch(/回路|コンデンサ|電流源|抵抗R|抵抗 R/);
    // 回路を外した章が残っていない
    expect(main).not.toMatch(/回路に見立てろ/);
  });
});
