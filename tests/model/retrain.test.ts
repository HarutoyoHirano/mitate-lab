// テスト42：検査ロボの鍛えなおし（CLAUDE.md 1c-3）
import { describe, expect, it } from "vitest";
import { BASE } from "../../server/model/public.js";
import { HIDDEN_CAUSES } from "../../scenarios/material1.js";
import { CARTILAGE_POINTS, CARTILAGE_SHOWN, judgeRetrain, MEMBRANE_POINTS, recheckDesign, retrainSpec, VESSEL_POINTS, type RetrainCase } from "../../server/model/retrain.js";
import { stepDents, TEMPOS, STEP_PHASES } from "../../server/model/steps.js";
import { duelMaterial, finalCheckDiff } from "../../server/model/duel.js";

const reps = HIDDEN_CAUSES.flatMap((h) => [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((f) => ({ ...BASE, [h.param]: h.range[0] + (h.range[1] - h.range[0]) * f })));
const ids = (c: RetrainCase) => retrainSpec(c).points.map((p) => p.id);

describe("42 検査ロボの鍛えなおし", () => {
  it("いままでの数字だけでは、どの検査もBを見分けられず、すり抜ける試作品が残る", () => {
    for (const c of ["cartilage", "vessel", "membrane"] as const) {
      const r = judgeRetrain(c, [], reps[0]!);
      expect(r.catchesB, c).toBe(false);
      expect(r.slipCount, c).toBeGreaterThan(0);
      expect(r.cleared, c).toBe(false);
    }
  });

  it("軟骨：一つ足すだけでは、どれを選んでもすり抜けが残る", () => {
    for (const id of ids("cartilage")) expect(judgeRetrain("cartilage", [id], reps[0]!).slipCount, id).toBeGreaterThan(0);
  });

  it("軟骨：隠れた範囲の全代表値のBについて、見分けられてすり抜けも残らない二つの組がある", () => {
    const all = ids("cartilage");
    // すり抜けが残らない組（Bによらない）を先に集める
    const zero: [string, string][] = [];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (judgeRetrain("cartilage", [all[i]!, all[j]!], BASE).slipCount === 0) zero.push([all[i]!, all[j]!]);
    expect(zero.length).toBeGreaterThan(0);
    expect(zero.length).toBeLessThan((all.length * (all.length - 1)) / 2); // 選び方しだい
    for (const b of reps) expect(zero.some((pair) => judgeRetrain("cartilage", pair, b).cleared), JSON.stringify(b)).toBe(true);
  });

  it("軟骨：謎2でロボが見た二点（走って1歩目の着地した直後と足を上げた直後）を両方足すと、すり抜けは残らず、どのBも見分けられる", () => {
    const r = judgeRetrain("cartilage", ["jog:0:land", "jog:0:lift"], BASE);
    expect(r.slipCount).toBe(0);
    for (const b of reps) expect(judgeRetrain("cartilage", ["jog:0:land", "jog:0:lift"], b).cleared, JSON.stringify(b)).toBe(true);
  });

  it("軟骨：画面で選べる4つ（謎1・謎2と同じ走りの1歩目）だけでも、どのBにも鍛えなおせる組があり、一つだけではすり抜けが残る", () => {
    const shown = CARTILAGE_SHOWN.flatMap((g) => g.ids);
    expect(shown.length).toBe(4);
    for (const id of shown) expect(judgeRetrain("cartilage", [id], BASE).slipCount, id).toBeGreaterThan(0);
    for (const id of shown) expect(CARTILAGE_POINTS.some((p) => p.id === id), id).toBe(true);
    for (const b of reps) {
      let ok = false;
      for (let i = 0; i < shown.length && !ok; i++) for (let j = i + 1; j < shown.length && !ok; j++) ok = judgeRetrain("cartilage", [shown[i]!, shown[j]!], b).cleared;
      expect(ok, JSON.stringify(b)).toBe(true);
    }
  });

  it("血管と膜：一つで足りる時刻と、足りない時刻の両方がある", () => {
    for (const c of ["vessel", "membrane"] as const) {
      const one = ids(c).map((id) => judgeRetrain(c, [id]));
      expect(one.some((r) => r.cleared), c).toBe(true);
      expect(one.some((r) => !r.cleared), c).toBe(true);
    }
    // 血管：脈のはじまり（0秒）を足せば、ふくらみやすさが決まり、Bも見分けられる
    expect(judgeRetrain("vessel", ["v:0"]).cleared).toBe(true);
    // 膜：流し始め（0 ms）は、どの膜でも差が 0 なので役に立たない
    expect(judgeRetrain("membrane", ["m:0"]).cleared).toBe(false);
  });

  it("すり抜けの数は、格子をそのまま数えた値と一致する（軟骨・一点）", () => {
    const pt = CARTILAGE_POINTS.find((p) => p.id === "jog:0:peak")!;
    const aAll = TEMPOS.flatMap((t) => stepDents(BASE, t.period).flatMap((s) => STEP_PHASES.map((ph) => s[ph])));
    const aPt = stepDents(BASE, pt.period)[pt.step]![pt.phase];
    let n = 0;
    for (let i = 0; i <= 40; i++)
      for (let k = 0; k <= 72; k++) {
        const p = duelMaterial(+(0.2 + i * 0.05).toFixed(2), +(0.4 + k * 0.05).toFixed(2));
        if (Math.abs(finalCheckDiff(p).diff) > 0.03) continue;
        if (Math.abs(stepDents(p, pt.period)[pt.step]![pt.phase] - aPt) > 0.03) continue;
        const all = TEMPOS.flatMap((t) => stepDents(p, t.period).flatMap((s) => STEP_PHASES.map((ph) => s[ph])));
        if (Math.max(...all.map((v, q) => Math.abs(v - aAll[q]!))) >= 0.08) n++;
      }
    expect(judgeRetrain("cartilage", [pt.id], BASE).slipCount).toBe(n);
  });

  it("足せる数字の数と範囲", () => {
    expect(CARTILAGE_POINTS.length).toBe(32);
    expect(VESSEL_POINTS.length).toBe(17);
    expect(MEMBRANE_POINTS.length).toBe(41);
    expect(new Set(CARTILAGE_POINTS.map((p) => p.id)).size).toBe(32);
  });

  it("仕掛けろで通った試作品は、いままでの検査ではすり抜け、二点を足した検査では見分けられる（再検査の報酬）", () => {
    const ids = ["jog:0:land", "jog:0:lift"];
    // 通しの確認で仕掛けろのラウンド1・2を通った設計（E1, τ）
    for (const [e1, tau] of [[1.0, 3.0], [0.5, 1.0]] as const) {
      expect(recheckDesign("cartilage", [], tau, e1).caught).toBe(false);
      const r = recheckDesign("cartilage", ids, tau, e1);
      expect(r.slippedBefore).toBe(true);
      expect(r.caught).toBe(true);
    }
    // 膜：謎3の仕掛けろのラウンド1・2を通った設計（g, C）
    const mids = ["m:20", "m:105"];
    for (const [g, c] of [[1.0, 0.4], [2.0, 2.0]] as const) {
      const r = recheckDesign("membrane", mids, c, g);
      expect(r.diffs.length).toBe(2);
    }
  });
});
