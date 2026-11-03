// CLAUDE.md 第7章のテスト13（曲線の観察）
import { describe, expect, it } from "vitest";
import { compare, type Evidence } from "../../server/model/comparator.js";
import { ObservationGenerator } from "../../server/model/generator.js";
import { planBySpeed } from "../../server/model/planner.js";
import { INTRO_OBSERVATION, PUSH_SECONDS, RECORD_AT, type ObservationSpec } from "../../server/model/public.js";
import { Session } from "../../server/session/session.js";
import { allSignCombos, makeEvidence, representativeTruths } from "./helpers.js";

const truths = representativeTruths();

describe("テスト13：曲線の観察", () => {
  it("一回の押しで、Bの5時刻が証拠に入り、Aの曲線も並ぶ。予想がないと押せない", () => {
    const s = new Session("t", { seed: 8 });
    expect(() => s.observeCurve(1, "x")).toThrow();
    s.saveCurvePrediction(1, "higher");
    const c = s.observeCurve(1, "x");
    expect(c.evidenceIds).toHaveLength(5);
    expect(c.a.length).toBe(c.b.length);
    expect(s.observeCurve(1, "x")).toBe(c); // 二重実行しない
    const v = s.publicView();
    expect(v.records.filter((r) => r.id.startsWith("x@")).map((r) => r.recordAt)).toEqual([...RECORD_AT]);
  });

  it("証拠の5点は、画面に描く点と同じ値（誤差は ±0.02 以内）", () => {
    const g = new ObservationGenerator({ seed: 4, cause: "relaxSlow", value: 3 });
    const c = g.observeCurve("B", 1);
    for (const e of c.evidence) {
      const d = c.display.find((p) => Math.abs(p.t - (1 + e.recordAt)) < 1e-12);
      expect(d?.force).toBe(e.force);
    }
  });

  it("いつもの検査＋任意の一つの速さの曲線で、正しい説明を退けない（最悪ケース）", () => {
    for (const t of truths)
      for (const T of PUSH_SECONDS) {
        const specs: ObservationSpec[] = [INTRO_OBSERVATION, ...RECORD_AT.map((recordAt) => ({ pushSeconds: T, recordAt }))];
        for (const signs of allSignCombos(6)) {
          const r = compare(makeEvidence(t.params, specs, signs));
          expect(r.candidates[t.correct].status).toBe("consistent");
          if (r.overall === "narrowed") expect(r.narrowedTo).toBe(t.correct);
        }
      }
  });

  it("いつもの検査の直後、速さごとの計画支援は3つの速さを並べる", () => {
    const ev: Evidence[] = makeEvidence(truths[0]!.params, [INTRO_OBSERVATION], [0]);
    const p = planBySpeed(ev);
    expect(p.map((a) => a.pushSeconds).sort()).toEqual([...PUSH_SECONDS].sort());
  });
});
