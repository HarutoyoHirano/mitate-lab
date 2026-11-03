// CLAUDE.md 第7章のテスト1〜4・6〜8・10（比較器と観測生成器）
import { describe, expect, it } from "vitest";
import { HIDDEN_CAUSES } from "../../scenarios/material1.js";
import { compare, invertNonDecreasing, type Evidence } from "../../server/model/comparator.js";
import { ObservationGenerator } from "../../server/model/generator.js";
import { plan } from "../../server/model/planner.js";
import { ALLOWED_OBSERVATIONS, BASE, INTRO_OBSERVATION, RECORD_AT, type MaterialParams, type ObservationSpec } from "../../server/model/public.js";
import { forceAfterPush } from "../../server/model/sls.js";
import { allSignCombos, makeEvidence, representativeTruths } from "./helpers.js";

const truths = representativeTruths();
const fiveAtOneSecond: ObservationSpec[] = RECORD_AT.map((recordAt) => ({ pushSeconds: 1, recordAt }));

describe("区間計算の端点処理", () => {
  it("平坦な部分を含む関数でも、y を満たす点をすべて含む区間を返す", () => {
    const f = (v: number) => (v < 3 ? 1 : 1 + (v - 3));
    const iv = invertNonDecreasing(f, 0, 10, 1, 0.02);
    expect(iv).not.toBeNull();
    expect(iv![0]).toBe(0);
    expect(iv![1]).toBeGreaterThanOrEqual(3.02 - 1e-6);
  });
});

describe("テスト1：正しい候補は最悪ケースでも「整合しにくい」にならない", () => {
  it("導入＋任意の一点（15通り）、誤差の全組み合わせ", () => {
    for (const t of truths)
      for (const spec of ALLOWED_OBSERVATIONS)
        for (const signs of allSignCombos(2)) {
          const r = compare(makeEvidence(t.params, [INTRO_OBSERVATION, spec], signs));
          expect(r.candidates[t.correct].status, `${t.cause} ${JSON.stringify(spec)} ${signs}`).toBe("consistent");
        }
  });
  it("導入＋1秒の5時刻（20秒後の平坦な点を含む）、誤差の全組み合わせ", () => {
    for (const t of truths)
      for (const signs of allSignCombos(6)) {
        const r = compare(makeEvidence(t.params, [INTRO_OBSERVATION, ...fiveAtOneSecond], signs));
        expect(r.candidates[t.correct].status).toBe("consistent");
      }
  });
});

describe("テスト2：導入観察では同じに見える", () => {
  it("全隠れ原因の範囲で、1秒で押して20秒後の真値の差が 0.01 以下", () => {
    for (const c of HIDDEN_CAUSES)
      for (let k = 0; k <= 50; k++) {
        const v = c.range[0] + ((c.range[1] - c.range[0]) * k) / 50;
        const p = { ...BASE, [c.param]: v };
        const diff = Math.abs(forceAfterPush(p, 1, 20) - forceAfterPush(BASE, 1, 20));
        expect(diff).toBeLessThanOrEqual(0.01);
      }
  });
});

describe("テスト3：一点だけでは決着しない例がある（教材の山場）", () => {
  it("1秒の押し終わりだけでは instant と relax がどちらも整合する", () => {
    const r = compare(makeEvidence({ ...BASE, tau: 3 }, [{ pushSeconds: 1, recordAt: 0 }], [0]));
    expect(r.candidates.instant.status).toBe("consistent");
    expect(r.candidates.relax.status).toBe("consistent");
    expect(r.overall).toBe("unresolved");
  });
});

describe("テスト4：決まった観察の並びで、最悪ケースまで正しく一つに絞れる", () => {
  it("導入＋1秒の5時刻", () => {
    for (const t of truths)
      for (const signs of allSignCombos(6)) {
        const r = compare(makeEvidence(t.params, [INTRO_OBSERVATION, ...fiveAtOneSecond], signs));
        expect(r.overall, `${t.cause} ${signs}`).toBe("narrowed");
        expect(r.narrowedTo).toBe(t.correct);
      }
  });
  it("導入＋0.2秒の押し終わり＋支援が勧める一点（結果に応じて変わる）", () => {
    const first: ObservationSpec = { pushSeconds: 0.2, recordAt: 0 };
    for (const t of truths)
      for (const s0 of [-1, 0, 1])
        for (const s1 of [-1, 0, 1]) {
          const ev2 = makeEvidence(t.params, [INTRO_OBSERVATION, first], [s0, s1]);
          let r = compare(ev2);
          if (r.overall === "narrowed") {
            expect(r.narrowedTo).toBe(t.correct);
            continue;
          }
          const next = plan(ev2, r).ranked[0]!.spec;
          for (const s2 of [-1, 0, 1]) {
            const ev3: Evidence[] = [...ev2, ...makeEvidence(t.params, [next], [s2]).map((e) => ({ ...e, id: "ev2" }))];
            r = compare(ev3);
            expect(r.overall, `${t.cause} ${s0},${s1},${s2}`).toBe("narrowed");
            expect(r.narrowedTo).toBe(t.correct);
          }
        }
  });
});

describe("テスト6：例示した二変化の素材では一つに絞れない（一般の検出保証ではない）", () => {
  const examples: MaterialParams[] = [
    { eInf: 1, e1: 1.3, tau: 3 },
    { eInf: 1, e1: 0.7, tau: 2 },
    { eInf: 1, e1: 1.5, tau: 0.5 },
    { eInf: 1, e1: 0.6, tau: 1.6 },
  ];
  it("導入＋1秒の5時刻、誤差の全組み合わせ", () => {
    for (const m of examples)
      for (const signs of allSignCombos(6)) {
        const r = compare(makeEvidence(m, [INTRO_OBSERVATION, ...fiveAtOneSecond], signs));
        expect(r.overall).not.toBe("narrowed");
      }
  });
});

describe("テスト7：比較器と計画支援は隠れた原因に依存しない", () => {
  it("隠れた原因が違う二つの生成器でも、同じ証拠なら同じ結果", () => {
    const ev = makeEvidence({ ...BASE, e1: 1.6 }, [INTRO_OBSERVATION, { pushSeconds: 0.2, recordAt: 0 }], [0.3, -0.4]);
    const g1 = new ObservationGenerator({ seed: 1, cause: "instantUp" });
    const g2 = new ObservationGenerator({ seed: 2, cause: "relaxFast" });
    expect(g1.revealForDebrief().causeId).not.toBe(g2.revealForDebrief().causeId);
    // 比較器・計画支援の入力は証拠だけ（生成器を渡す口がない）
    const a = JSON.stringify([compare(ev), plan(ev)]);
    const b = JSON.stringify([compare(ev), plan(ev)]);
    expect(a).toBe(b);
    expect(compare.length).toBe(1);
  });
});

describe("テスト8：許可する全観察で力が正", () => {
  it("隠れた範囲の代表値すべて", () => {
    for (const t of truths)
      for (const spec of ALLOWED_OBSERVATIONS) expect(forceAfterPush(t.params, spec.pushSeconds, spec.recordAt)).toBeGreaterThan(0);
  });
});

describe("テスト10：全体判定の4状態を再現できる", () => {
  const six = [INTRO_OBSERVATION, ...fiveAtOneSecond];
  it("一つに絞れた", () => {
    expect(compare(makeEvidence({ ...BASE, e1: 2 }, six, [0, 0, 0, 0, 0, 0])).overall).toBe("narrowed");
  });
  it("まだ説明を分けきれない", () => {
    expect(compare(makeEvidence({ ...BASE, tau: 3 }, [{ pushSeconds: 1, recordAt: 0 }], [0])).overall).toBe("unresolved");
  });
  it("通常の誤差では合わないが、誤差を広げると説明が残る", () => {
    const r = compare(makeEvidence({ eInf: 1.03, e1: 1, tau: 3 }, six, [0, 0, 0, 0, 0, 0]));
    expect(r.overall).toBe("onlyWidened");
    expect(r.normalSet).toEqual([]);
    expect(r.widenedSet.length).toBeGreaterThan(0);
  });
  it("今の候補では説明できない", () => {
    const r = compare(makeEvidence({ eInf: 1, e1: 1.3, tau: 3 }, six, [-1, -1, -1, -1, -1, -1]));
    expect(r.overall).toBe("noneFits");
    expect(r.widenedSet).toEqual([]);
  });
});

describe("観測生成器", () => {
  it("同じ種なら同じ観測、誤差は ±0.02 以内", () => {
    const g1 = new ObservationGenerator({ seed: 42 });
    const g2 = new ObservationGenerator({ seed: 42 });
    for (const spec of ALLOWED_OBSERVATIONS) {
      const a = g1.observe("B", spec);
      const b = g2.observe("B", spec);
      expect(a.force).toBe(b.force);
    }
    const g = new ObservationGenerator({ seed: 7, cause: "relaxSlow", value: 2.5 });
    const truth = g.revealForDebrief().truth;
    for (let i = 0; i < 200; i++) {
      const spec = ALLOWED_OBSERVATIONS[i % ALLOWED_OBSERVATIONS.length]!;
      const m = g.observe("B", spec);
      expect(Math.abs(m.force - forceAfterPush(truth, spec.pushSeconds, spec.recordAt))).toBeLessThanOrEqual(0.02);
    }
  });
  it("範囲外の観察や真の値を受け付けない", () => {
    const g = new ObservationGenerator({ seed: 1 });
    expect(() => g.observe("B", { pushSeconds: 2 as never, recordAt: 0 })).toThrow();
    expect(() => new ObservationGenerator({ seed: 1, cause: "relaxFast", value: 1 })).toThrow();
  });
});
