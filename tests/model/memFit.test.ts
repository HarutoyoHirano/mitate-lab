// 謎3「なぜ？」のつまみ（1c-4、2026-11-07 深夜）。テスト45
import { describe, expect, it } from "vitest";
import { BASE_MEM, CASE3_B, MEM_FIT_TOL, MEM_SLIDERS, memFit, ROBOT_STEADY_TOL } from "../../server/model/membraneGame.js";

const grid = (k: "g" | "c") => {
  const s = MEM_SLIDERS[k];
  const out: number[] = [];
  for (let v = s.min; v <= s.max + 1e-9; v += s.step) out.push(Math.round(v * 100) / 100);
  return out;
};

describe("謎3 なぜ？のつまみ", () => {
  it("帯の幅はロボの手順の幅と同じ", () => {
    expect(MEM_FIT_TOL).toBe(ROBOT_STEADY_TOL);
  });
  it("見本の膜そのままでは重ならない", () => {
    expect(memFit(BASE_MEM).fits).toBe(false);
  });
  it("通りやすさだけのつまみは、どの目盛りでも重ならない（高さを合わせると時間がずれる）", () => {
    for (const g of grid("g")) expect(memFit({ g, c: 1 }).fits, `g=${g}`).toBe(false);
  });
  it("ためやすさだけのつまみには重なる目盛りがあり、Bの値を含む", () => {
    const hits = grid("c").filter((c) => memFit({ g: 1, c }).fits);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits).toContain(CASE3_B.c);
  });
  it("両方のつまみでも、Bの値で重なる", () => {
    expect(memFit({ g: CASE3_B.g, c: CASE3_B.c }).fits).toBe(true);
    expect(memFit({ g: CASE3_B.g, c: CASE3_B.c }).maxDiff).toBeLessThan(1e-9);
  });
});
