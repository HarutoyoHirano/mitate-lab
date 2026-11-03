// CLAUDE.md 第7章のテスト11（第2幕：回路と細胞の膜）
import { describe, expect, it } from "vitest";
import {
  BASE_MEMBRANE,
  circuitVoltageAfterStop,
  membraneDeltaAtStop,
  membraneHalfReturnTime,
  membraneNormalizedAfterStop,
  membranePotentialAfterStop,
  toCircuit,
  withPermeability,
} from "../../server/model/circuit.js";
import { ALLOWED_OBSERVATIONS, BASE } from "../../server/model/public.js";
import { forceAfterPush } from "../../server/model/sls.js";
import { representativeTruths } from "./helpers.js";

describe("テスト11：回路の電圧は、対応表で変換した力学の解析解と一致する", () => {
  it("基準素材と隠れた範囲の代表値、許可された全観察", () => {
    for (const p of [BASE, ...representativeTruths().map((t) => t.params)])
      for (const spec of ALLOWED_OBSERVATIONS) {
        const current = 1 / spec.pushSeconds; // 押す速さ ↔ 電流（深さ1）
        const v = circuitVoltageAfterStop(toCircuit(p), current, spec.pushSeconds, spec.recordAt);
        expect(v).toBeCloseTo(forceAfterPush(p, spec.pushSeconds, spec.recordAt), 12);
      }
  });
});

describe("テスト11：イオンを通りやすくする（抵抗を小さくする）と、半分に戻るまでの時間が短くなる", () => {
  it("通りやすい < そのまま < 通りにくい", () => {
    const easier = membraneHalfReturnTime(withPermeability(BASE_MEMBRANE, "easier"));
    const same = membraneHalfReturnTime(withPermeability(BASE_MEMBRANE, "same"));
    const harder = membraneHalfReturnTime(withPermeability(BASE_MEMBRANE, "harder"));
    expect(easier!).toBeLessThan(same!);
    expect(same!).toBeLessThan(harder!);
  });
  it("止めた時の高さは通りやすさで変わるが、割った表示は1から始まり、半分の時刻で0.5になる", () => {
    const easier = withPermeability(BASE_MEMBRANE, "easier");
    const harder = withPermeability(BASE_MEMBRANE, "harder");
    expect(membraneDeltaAtStop(easier, 1, 1)).not.toBeCloseTo(membraneDeltaAtStop(harder, 1, 1), 3);
    for (const m of [easier, harder]) {
      expect(membraneNormalizedAfterStop(m, 0)).toBe(1);
      expect(membraneNormalizedAfterStop(m, membraneHalfReturnTime(m)!)).toBeCloseTo(0.5, 12);
      // 実際の電位は基準の電位へ戻っていく（基準はゼロでなくてよい）
      expect(membranePotentialAfterStop(m, 1, 1, 100)).toBeCloseTo(m.restPotential, 9);
    }
  });
});

describe("テスト11：思考実験（抵抗がマイナス）では、止めた後に基準へ戻らず離れていく", () => {
  it("基準からの差が時間とともに大きくなり、半分に戻る時間は存在しない", () => {
    const neg = withPermeability(BASE_MEMBRANE, "negative");
    expect(neg.resistance).toBeLessThan(0);
    expect(membraneHalfReturnTime(neg)).toBeNull();
    const d0 = membraneDeltaAtStop(neg, 1, 1);
    expect(d0).toBeGreaterThan(0);
    let prev = membranePotentialAfterStop(neg, 1, 1, 0) - neg.restPotential;
    for (const h of [0.5, 1, 2, 3]) {
      const d = membranePotentialAfterStop(neg, 1, 1, h) - neg.restPotential;
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
    expect(membraneNormalizedAfterStop(neg, 2)).toBeGreaterThan(1);
  });
});
