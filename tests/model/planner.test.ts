// CLAUDE.md 第7章のテスト5（計画支援に従って一点ずつ観察すると決着する）
import { describe, expect, it } from "vitest";
import { HIDDEN_CAUSES } from "../../scenarios/material1.js";
import { compare, type Evidence } from "../../server/model/comparator.js";
import { createRng, ObservationGenerator } from "../../server/model/generator.js";
import { plan, recommend } from "../../server/model/planner.js";
import { BASE, ERROR, INTRO_OBSERVATION } from "../../server/model/public.js";
import { forceAfterPush } from "../../server/model/sls.js";
import { CORRECT_CANDIDATE, makeEvidence } from "./helpers.js";

type NoiseMode = "uniform" | "extreme" | "zero";

function runAdaptive(params: typeof BASE, mode: NoiseMode, rng: () => number, maxSteps: number) {
  const noise = () => (mode === "uniform" ? 2 * rng() - 1 : mode === "extreme" ? (rng() < 0.5 ? -1 : 1) : 0);
  const ev: Evidence[] = [];
  const add = (spec: typeof INTRO_OBSERVATION) =>
    ev.push({ id: `ev${ev.length}`, ...spec, force: forceAfterPush(params, spec.pushSeconds, spec.recordAt) + noise() * ERROR });
  add(INTRO_OBSERVATION);
  let steps = 0;
  let r = compare(ev);
  while (r.overall !== "narrowed" && steps < maxSteps) {
    add(recommend(ev));
    steps++;
    r = compare(ev);
  }
  return { r, steps };
}

describe("テスト5：計画支援に従って一点ずつ観察すると、導入の後3回以内に正しく一つに絞れる", () => {
  for (const mode of ["uniform", "extreme", "zero"] as NoiseMode[]) {
    it(`誤差：${mode}（各隠れ原因で100回以上）`, () => {
      const rng = createRng(20261103);
      for (const c of HIDDEN_CAUSES)
        for (let i = 0; i < 100; i++) {
          const v = c.range[0] + (c.range[1] - c.range[0]) * rng();
          const { r, steps } = runAdaptive({ ...BASE, [c.param]: v }, mode, rng, 3);
          expect(r.overall, `${c.id} v=${v} steps=${steps}`).toBe("narrowed");
          expect(r.narrowedTo).toBe(CORRECT_CANDIDATE[c.id]);
          expect(steps).toBeLessThanOrEqual(3);
        }
    });
  }
});

describe("計画支援の中身", () => {
  it("導入の直後は、どの観察も候補を確実には分けない（各候補の範囲がAの値を含むため）。結果の幅が最も広い観察を勧める", () => {
    const ev = makeEvidence({ ...BASE, e1: 1.5 }, [INTRO_OBSERVATION], [0]);
    const p = plan(ev);
    expect(p.anySeparating).toBe(false);
    expect(p.ranked).toHaveLength(15);
    const maxSpread = Math.max(...p.ranked.map((a) => a.spread));
    expect(p.ranked[0]!.spread).toBe(maxSpread);
  });
  it("違いは見えたが説明を分けきれないときは、分かれる観察がある", () => {
    const ev = makeEvidence({ ...BASE, tau: 3 }, [INTRO_OBSERVATION, { pushSeconds: 1, recordAt: 0 }], [0, 0]);
    expect(compare(ev).overall).toBe("unresolved");
    const p = plan(ev);
    expect(p.anySeparating).toBe(true);
    expect(p.ranked[0]!.decisivePairs.length + p.ranked[0]!.separatingPairs.length).toBeGreaterThan(0);
  });
  it("一つに絞れた後は、分かれる組がない", () => {
    const g = new ObservationGenerator({ seed: 3, cause: "instantUp", value: 1.8 });
    const ev: Evidence[] = [INTRO_OBSERVATION, { pushSeconds: 0.2, recordAt: 0 } as const, { pushSeconds: 1, recordAt: 2 } as const].map((s, i) => ({
      id: `ev${i}`,
      ...g.observe("B", s),
    }));
    const r = compare(ev);
    if (r.overall === "narrowed") expect(plan(ev, r).anySeparating).toBe(false);
  });
});
