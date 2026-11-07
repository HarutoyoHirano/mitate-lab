// 判定の幅の境目（別のAIによる模擬評価76：幅の直前・同値・直後を確かめる。表示上同じでも内部だけ不合格にしない）
import { describe, expect, it } from "vitest";
import { fmtVs } from "../../src/play/fmt.js";
import { DUEL_ROUNDS, DUEL_SLIDERS, duelMaterial, HIDDEN_NEED, judgeDuel, ROBOT_PASS } from "../../server/model/duel.js";
import { HALF_TIME_TOL, HIDDEN1_NEED, HIDDEN2_NEED, judgeMemDuel, MEM_SLIDERS, ROBOT_STEADY_TOL } from "../../server/model/membraneGame.js";
import { CASE_VESSEL_B, judgeSync, VESSEL_ROBOT_TOL, VESSEL_SLIDERS } from "../../server/model/vessel.js";
import { TEST_TOLERANCE } from "../../server/model/public.js";

const grid = (s: { min: number; max: number; step: number }) => {
  const out: number[] = [];
  for (let v = s.min; v <= s.max + 1e-9; v += s.step) out.push(+v.toFixed(4));
  return out;
};

describe("判定の幅の境目", () => {
  it("幅とくらべて言う数字は、丸めても判定と食い違わない（直前・同値・直後）", () => {
    for (const [tol, digits] of [[0.03, 3], [2, 1], [0.5, 2], [0.7, 2]] as const) {
      for (const off of [-1e-3, -1e-4, -1e-6, 0, 1e-6, 1e-4, 1e-3, 0.02]) {
        const d = tol + off;
        const over = d > tol;
        const shown = +fmtVs(d, tol, digits, over);
        if (over) expect(shown).toBeGreaterThan(tol);
        else expect(shown).toBeLessThanOrEqual(tol);
      }
    }
    expect(fmtVs(0.0304, 0.03, 3, true)).toBe("0.0304");
    expect(fmtVs(0.0412, 0.03, 3, true)).toBe("0.041");
  });

  it("つまみで選べるどの試作品でも、差がちょうど幅の上には来ない（「以下」と「より小さい」の言い方の違いで判定が変わらない）", () => {
    const near = (x: number, tol: number) => Math.abs(Math.abs(x) - tol) < 1e-7;
    for (const e1 of grid(DUEL_SLIDERS.e1))
      for (const tau of grid(DUEL_SLIDERS.tau))
        for (const round of DUEL_ROUNDS) {
          const r = judgeDuel(round, duelMaterial(e1, tau));
          expect(near(r.final.diff, TEST_TOLERANCE) || near(r.robot.diff, ROBOT_PASS) || near(r.hidden.diff, HIDDEN_NEED)).toBe(false);
        }
    for (const g of grid(MEM_SLIDERS.g))
      for (const c of grid(MEM_SLIDERS.c)) {
        const r1 = judgeMemDuel(1, { g, c });
        const r2 = judgeMemDuel(2, { g, c });
        expect(near(r1.robot.diff, ROBOT_STEADY_TOL) || near(r1.hidden.diff, HIDDEN1_NEED)).toBe(false);
        expect(near(r2.robot.diff, HALF_TIME_TOL) || near(r2.hidden.diff, HIDDEN2_NEED)).toBe(false);
      }
    for (const r of grid(VESSEL_SLIDERS.r))
      for (const c of grid(VESSEL_SLIDERS.c)) {
        const j = judgeSync(CASE_VESSEL_B, { r, c });
        expect(near(j.mine.mean - j.target.mean, VESSEL_ROBOT_TOL) || near(j.mine.pulse - j.target.pulse, VESSEL_ROBOT_TOL)).toBe(false);
      }
  });
});
