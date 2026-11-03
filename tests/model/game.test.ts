// ゲーム版のテスト（CLAUDE.md 第7章 28〜33）
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DUEL_ROUNDS, DUEL_SLIDERS, duelMaterial, judgeDuel } from "../../server/model/duel.js";
import {
  BASE_MEM,
  CASE3_B,
  deltaMv,
  diffAt,
  halfTimeMs,
  judgeMemDuel,
  MEM_SLIDERS,
  PULSE_MS,
  RECORD_MS,
  ROBOT_STEADY_TOL,
  SEE_DIFF,
  steadyDiff,
  tauMs,
  riseInfMv,
  type Membrane,
} from "../../server/model/membraneGame.js";
import { Session } from "../../server/session/session.js";
import { BASE } from "../../server/model/public.js";

function grid(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

describe("28 事件2 仕掛けろ", () => {
  const e1s = grid(DUEL_SLIDERS.e1.min, DUEL_SLIDERS.e1.max, DUEL_SLIDERS.e1.step);
  const taus = grid(DUEL_SLIDERS.tau.min, DUEL_SLIDERS.tau.max, DUEL_SLIDERS.tau.step);
  const pass = DUEL_ROUNDS.map((r) => e1s.flatMap((e) => taus.map((t) => ({ e, t }))).filter(({ e, t }) => judgeDuel(r, duelMaterial(e, t)).cleared));
  it("各ラウンドに、つまみの範囲内で達成できる組み合わせがある", () => {
    for (const p of pass) expect(p.length).toBeGreaterThan(0);
  });
  it("二つのラウンドを同時に満たす組み合わせはない（同じ設計では通らない）", () => {
    const both = pass[0]!.filter((x) => pass[1]!.some((y) => y.e === x.e && y.t === x.t));
    expect(both).toEqual([]);
  });
  it("見本そのままでは達成しない", () => {
    for (const r of DUEL_ROUNDS) expect(judgeDuel(r, BASE).cleared).toBe(false);
  });
});

describe("29 事件3 膜の解析解", () => {
  it("受け身の膜の微分方程式の数値積分と一致する", () => {
    for (const m of [BASE_MEM, CASE3_B, { g: 0.5, c: 1.7 }, { g: 2.2, c: 0.45 }] as Membrane[]) {
      // C dV/dt = I − V/R （V は基準からの差）。I·R = 上がり幅、R·C = 時定数
      const tau = tauMs(m);
      const inf = riseInfMv(m);
      let v = 0;
      const dt = 0.001;
      let maxErr = 0;
      for (let t = 0; t < RECORD_MS; t += dt) {
        const drive = t < PULSE_MS ? inf : 0;
        v += ((drive - v) / tau) * dt;
        const tt = t + dt;
        if (Math.abs(tt - Math.round(tt)) < dt / 2) maxErr = Math.max(maxErr, Math.abs(v - deltaMv(m, tt)));
      }
      expect(maxErr).toBeLessThan(0.01);
    }
  });
  it("半分に戻る時間は τ·ln2", () => {
    for (const m of [BASE_MEM, CASE3_B]) {
      const h = halfTimeMs(m);
      expect(deltaMv(m, PULSE_MS + h) / deltaMv(m, PULSE_MS)).toBeCloseTo(0.5, 9);
    }
  });
});

describe("30 事件3 見破れの固定例", () => {
  it("ロボの検査（止める直前）では区別できず、途中では差が見え、最後は区別できない", () => {
    expect(Math.abs(steadyDiff(CASE3_B))).toBeLessThanOrEqual(ROBOT_STEADY_TOL);
    const max = Math.max(...grid(0, RECORD_MS, 0.5).map((t) => Math.abs(diffAt(CASE3_B, t))));
    expect(max).toBeGreaterThan(SEE_DIFF);
    expect(Math.abs(diffAt(CASE3_B, RECORD_MS))).toBeLessThan(SEE_DIFF);
  });
});

describe("31 事件3 仕掛けろ", () => {
  const gs = grid(MEM_SLIDERS.g.min, MEM_SLIDERS.g.max, MEM_SLIDERS.g.step);
  const cs = grid(MEM_SLIDERS.c.min, MEM_SLIDERS.c.max, MEM_SLIDERS.c.step);
  const all = gs.flatMap((g) => cs.map((c) => ({ g, c })));
  const r1 = all.filter((m) => judgeMemDuel(1, m).cleared);
  const r2 = all.filter((m) => judgeMemDuel(2, m).cleared);
  it("各ラウンドに達成できる組み合わせがある", () => {
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
  });
  it("両方を同時に満たす組み合わせはない", () => {
    expect(r1.filter((x) => r2.some((y) => y.g === x.g && y.c === x.c))).toEqual([]);
  });
  it("見本そのままでは達成しない", () => {
    expect(judgeMemDuel(1, BASE_MEM).cleared).toBe(false);
    expect(judgeMemDuel(2, BASE_MEM).cleared).toBe(false);
  });
});

describe("32 事件1の写真", () => {
  it("同じ曲線・同じ時刻を二度撮っても一枚", () => {
    const s = new Session("t", { seed: 3, cause: "relaxSlow" });
    s.saveCurvePrediction(1, "unknown");
    const curveId = s.observeCurve(1, "obs-1").id;
    s.takePhoto(curveId, 2);
    s.takePhoto(curveId, 2);
    s.takePhoto(curveId, 3);
    expect(s.publicView().photos.length).toBe(2);
  });
});

describe("33 ゲーム版の画面のコードに秘密が入らない", () => {
  it("src/game に隠れた範囲・種・真の値の参照がない", () => {
    const dir = "src/game";
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      const t = readFileSync(`${dir}/${f}`, "utf-8");
      expect(t).not.toMatch(/scenarios\/|hiddenRange|HIDDEN_CAUSES|\.seed\b|truth\s*:/);
    }
  });
});
