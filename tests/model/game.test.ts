// ゲーム版のテスト（CLAUDE.md 第7章 28〜35）
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DUEL_PERIOD, DUEL_ROUNDS, DUEL_SLIDERS, DUEL_STEP, duelMaterial, judgeDuel, stepCheckDiff } from "../../server/model/duel.js";
import { BRIDGE_SLIDERS, circuitAt, judgeBridge, bridgeSolved, materialForceAt, bridgeTimes } from "../../server/model/bridge.js";
import { toCircuit } from "../../server/model/circuit.js";
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
import { DUTY, STEP_ERROR, STEP_PHASES, STEP_TOLERANCE, stepDents, TEMPOS } from "../../server/model/steps.js";
import { representativeTruths } from "./helpers.js";

function grid(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

describe("28 謎2 仕掛けろ（走行テストの対決）", () => {
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
  it("ロボの点・隠す点の値は走行テストの式（stepDents）と一致する", () => {
    const p = duelMaterial(1.8, 2);
    for (const r of DUEL_ROUNDS)
      for (const c of [r.robot, r.hidden]) {
        const d = stepCheckDiff(p, c);
        expect(d.a).toBeCloseTo(stepDents(BASE, DUEL_PERIOD)[DUEL_STEP]![c.phase], 12);
        expect(d.b).toBeCloseTo(stepDents(p, DUEL_PERIOD)[DUEL_STEP]![c.phase], 12);
      }
  });
});

describe("35 橋のスライダー", () => {
  const rs = grid(BRIDGE_SLIDERS.r.min, BRIDGE_SLIDERS.r.max, BRIDGE_SLIDERS.r.step);
  const cs = grid(BRIDGE_SLIDERS.c1.min, BRIDGE_SLIDERS.c1.max, BRIDGE_SLIDERS.c1.step);
  it("Bの値をそのまま回路にすると、回路の電圧は力学の式と一致する", () => {
    for (const { params } of representativeTruths())
      for (const T of [0.2, 1, 5])
        for (const t of bridgeTimes(T)) expect(circuitAt(toCircuit(params), T, t)).toBeCloseTo(materialForceAt(params, T, t), 9);
  });
  it("隠れた範囲の全代表値・3つの押し方で、スライダーの格子に一本に重なる組み合わせがある", () => {
    for (const { params } of representativeTruths())
      for (const T of [0.2, 1, 5]) {
        const ok = rs.some((r) => cs.some((c) => judgeBridge(params, T, r, c).overlap));
        expect(ok, JSON.stringify({ params, T })).toBe(true);
      }
  });
  it("謎3（新しい画面）：隠れた範囲の全代表値・3つの押し方で、格子に「重なり、二つのメーターも合う」組み合わせがある", () => {
    for (const { params } of representativeTruths())
      for (const T of [0.2, 1, 5]) {
        const ok = rs.some((r) => cs.some((c) => bridgeSolved(judgeBridge(params, T, r, c))));
        expect(ok, JSON.stringify({ params, T })).toBe(true);
      }
  });
  it("時定数だけ合わせた組み合わせ（Rを2倍・C1を半分）は重ならず、速さは合うが高さが違うと判定する", () => {
    for (const { params } of representativeTruths()) {
      const c = toCircuit(params);
      const j = judgeBridge(params, 1, c.r * 2, c.c1 / 2);
      expect(j.overlap).toBe(false);
      expect(j.speedOk).toBe(true);
      expect(j.heightOk).toBe(false);
    }
  });
});

describe("29 謎3 膜の解析解", () => {
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

describe("30 謎3 見破れの固定例", () => {
  it("ロボの検査（止める直前）では区別できず、途中では差が見え、最後は区別できない", () => {
    expect(Math.abs(steadyDiff(CASE3_B))).toBeLessThanOrEqual(ROBOT_STEADY_TOL);
    const max = Math.max(...grid(0, RECORD_MS, 0.5).map((t) => Math.abs(diffAt(CASE3_B, t))));
    expect(max).toBeGreaterThan(SEE_DIFF);
    expect(Math.abs(diffAt(CASE3_B, RECORD_MS))).toBeLessThan(SEE_DIFF);
  });
});

describe("31 謎3 仕掛けろ", () => {
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

describe("32 謎1の写真", () => {
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
  it("src/game と src/play に隠れた範囲・種・真の値の参照がない", () => {
    for (const dir of ["src/game", "src/play"]) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        const t = readFileSync(`${dir}/${f}`, "utf-8");
        expect(t, `${dir}/${f}`).not.toMatch(/scenarios\/|hiddenRange|HIDDEN_CAUSES|\.seed\b|truth\s*:/);
        expect(t, `${dir}/${f}`).not.toMatch(/from\s+"[^"]*(generator|scenarios|session\/|claude\/|server\/app)[^"]*"/);
      }
    }
  });
});

describe("34 走行テスト", () => {
  it("一歩ごとの解析解が、力を指定した標準線形固体の数値積分と一致する", () => {
    for (const p of [BASE, { eInf: 1, e1: 2, tau: 1 }, { eInf: 1, e1: 1, tau: 4 }, { eInf: 1, e1: 0.5, tau: 0.3 }]) {
      for (const period of [0.75, 3]) {
        const steps = stepDents(p, period, 4);
        // dσ/dt = [E1 dF/dt − E∞ σ/τ]/(E∞+E1)、F は階段状。x = (F − σ)/E∞
        const dt = 1e-4;
        let s = 0;
        let F = 0;
        const tc = period * DUTY;
        const xs: number[] = [];
        for (let k = 0; k < 4; k++) {
          s += (p.e1 * (1 - F)) / (p.eInf + p.e1);
          F = 1;
          xs.push((F - s) / p.eInf);
          for (let t = 0; t < tc - 1e-12; t += dt) s += ((-p.eInf * s) / p.tau / (p.eInf + p.e1)) * dt;
          xs.push((F - s) / p.eInf);
          s += (p.e1 * (0 - F)) / (p.eInf + p.e1);
          F = 0;
          xs.push(-s / p.eInf);
          for (let t = 0; t < period - tc - 1e-12; t += dt) s += ((-p.eInf * s) / p.tau / (p.eInf + p.e1)) * dt;
          xs.push(-s / p.eInf);
        }
        const exact = steps.flatMap((d) => [d.land, d.peak, d.lift, d.pre]);
        for (let i = 0; i < xs.length; i++) expect(Math.abs(xs[i]! - exact[i]!)).toBeLessThan(2e-3);
      }
    }
  });
  it("隠れた範囲の全代表値で、四つのテンポのどれかに、最悪の誤差でも判定幅を超える点がある", () => {
    for (const t of representativeTruths()) {
      let best = 0;
      for (const tempo of TEMPOS) {
        const a = stepDents(BASE, tempo.period);
        const b = stepDents(t.params, tempo.period);
        for (let k = 0; k < a.length; k++) for (const ph of STEP_PHASES) best = Math.max(best, Math.abs(b[k]![ph] - a[k]![ph]));
      }
      expect(best - STEP_ERROR).toBeGreaterThan(STEP_TOLERANCE);
    }
  });
  it("同じ一歩・同じ点の証拠は一枚。記録した値から判定する", () => {
    const s = new Session("t", { seed: 4, cause: "relaxSlow" });
    const r = s.run(3);
    s.takeRunPhoto(r.id, 2, "peak");
    const ph = s.takeRunPhoto(r.id, 2, "peak");
    expect(s.publicView().runPhotos.length).toBe(1);
    expect(ph.diff).toBeCloseTo(r.b[2]!.peak - r.a[2]!.peak, 12);
  });
});
