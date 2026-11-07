// 謎1「なぜ？」のつまみ（1c-4、2026-11-07 深夜）。
// いつもの検査＋ふつう（1秒）の曲線で、正しい部品のつまみには必ず重なる目盛りがあり、違う部品はどの目盛りでも重ならない。
// 重なりの判定は比較器の「誤差を2倍にした区間」と同じ（つまみの値が区間に入る ⇔ 重なった）。
import { describe, expect, it } from "vitest";
import { candidateInterval, compare } from "../../server/model/comparator.js";
import { basePos, FIT_BAND, knobAnyFit, knobFits, knobPos, knobValue, KNOBS, type KnobId } from "../../server/model/knob.js";
import { BASE, ERROR, INTRO_OBSERVATION, RECORD_AT, WIDEN, type CandidateId } from "../../server/model/public.js";
import { allSignCombos, makeEvidence, representativeTruths } from "./helpers.js";

const SPECS = [INTRO_OBSERVATION, ...RECORD_AT.map((recordAt) => ({ pushSeconds: 1 as const, recordAt }))];
const IDS: CandidateId[] = ["overall", "instant", "relax", "same"];

describe("謎1 なぜ？のつまみ", () => {
  it("帯の幅は、測るたびのぶれの2倍", () => {
    expect(FIT_BAND).toBeCloseTo(ERROR * WIDEN, 12);
  });

  it("つまみのはじめは見本 A の値（どれも目盛りの上にある）", () => {
    expect(knobValue("overall", basePos("overall"))).toBeCloseTo(BASE.eInf, 9);
    expect(knobValue("instant", basePos("instant"))).toBeCloseTo(BASE.e1, 9);
    expect(knobValue("relax", basePos("relax"))).toBeCloseTo(BASE.tau, 9);
    for (const id of Object.keys(KNOBS) as KnobId[]) for (const p of [0, 7, KNOBS[id].n]) expect(knobPos(id, knobValue(id, p))).toBe(p);
  });

  it("隠れた範囲の全代表値・最悪のぶれまで：正しい部品のつまみだけが重なり、違う部品はどの目盛りでも重ならない", () => {
    let cases = 0;
    for (const truth of representativeTruths()) {
      for (const signs of allSignCombos(SPECS.length)) {
        const ev = makeEvidence(truth.params, SPECS, signs);
        for (const id of IDS) {
          const hit = knobAnyFit(id, ev);
          if (id === truth.correct) expect(hit, `${truth.cause} ${JSON.stringify(truth.params)} ${signs}`).not.toBeNull();
          else expect(hit, `${id} ${truth.cause} ${signs}`).toBeNull();
        }
        // 比較器も同じ答え（いつもの検査＋ふつう1秒で一つに絞れる。テスト13）
        const r = compare(ev);
        expect(r.overall).toBe("narrowed");
        expect(r.narrowedTo).toBe(truth.correct);
        cases++;
      }
    }
    expect(cases).toBe(representativeTruths().length * 3 ** SPECS.length);
  });

  it("重なった ⇔ つまみの値が比較器の広げた区間に入る", () => {
    for (const truth of representativeTruths().filter((_, i) => i % 3 === 0)) {
      const ev = makeEvidence(truth.params, SPECS, [1, -1, 0, 1, -1, 1]);
      const id = truth.correct as KnobId;
      const iv = candidateInterval(id, ev, ERROR * WIDEN);
      for (let p = 0; p <= KNOBS[id].n; p++) {
        const v = knobValue(id, p);
        const inside = !!iv && v >= iv[0] - 1e-9 && v <= iv[1] + 1e-9;
        expect(knobFits(id, v, ev)).toBe(inside);
      }
    }
  });
});
