// 事件3「拍動の盲点」（CLAUDE.md 第7章 36〜38）
import { describe, expect, it } from "vitest";
import {
  BASE_VESSEL,
  BEAT_S,
  CASE_VESSEL_B,
  judgeSync,
  judgeVesselDuel,
  MEAN_FLOW,
  pumpFlow,
  steadyBeat,
  STROKE_ML,
  summarize,
  VESSEL_ROBOT_TOL,
  VESSEL_SEE_DIFF,
  VESSEL_SLIDERS,
  type Vessel,
} from "../../server/model/vessel.js";

function grid(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

describe("36 血管の模型（2要素ウィンドケッセル）", () => {
  it("一拍に送り出す量は STROKE_ML", () => {
    const n = 20000;
    let s = 0;
    for (let i = 0; i < n; i++) s += pumpFlow(((i + 0.5) / n) * BEAT_S) * (BEAT_S / n);
    expect(s).toBeCloseTo(STROKE_ML, 3);
  });
  it("落ち着いた一拍は、終わりの圧が始めの圧に戻る（周期的）", () => {
    for (const m of [BASE_VESSEL, CASE_VESSEL_B, { r: 1.6, c: 2.5 }]) {
      const ps = steadyBeat(m);
      expect(ps[ps.length - 1]!).toBeCloseTo(ps[0]!, 6);
    }
  });
  it("平均の圧は、平均の流れ × 抵抗（やわらかさにはよらない）", () => {
    for (const c of [0.4, 0.75, 1.5, 3]) expect(summarize({ r: 1.2, c }).mean).toBeCloseTo(MEAN_FLOW * 1.2, 1);
  });
  it("細かい刻みのオイラー法で多くの拍を進めた結果と一致する", () => {
    const m: Vessel = { r: 1, c: 1.5 };
    const dt = 1e-5;
    let p = 0;
    const beats = 30;
    const n = Math.round((beats * BEAT_S) / dt);
    for (let i = 0; i < n; i++) p += (dt * (pumpFlow(i * dt) - p / m.r)) / m.c;
    expect(p).toBeCloseTo(steadyBeat(m)[0]!, 1);
  });
  it("やわらかさが小さい（硬い）ほど、脈の振れ幅が大きい", () => {
    const pulses = [3, 1.5, 0.75, 0.4].map((c) => summarize({ r: 1, c }).pulse);
    for (let i = 1; i < pulses.length; i++) expect(pulses[i]!).toBeGreaterThan(pulses[i - 1]!);
  });
});

describe("37 事件3 見破れ", () => {
  const A = summarize(BASE_VESSEL);
  const B = summarize(CASE_VESSEL_B);
  it("ロボの検査（一拍の平均の圧）では区別できない", () => {
    expect(Math.abs(B.mean - A.mean)).toBeLessThanOrEqual(VESSEL_ROBOT_TOL);
  });
  it("最高と最低の圧には、写真で見える差がある", () => {
    expect(Math.abs(B.max - A.max)).toBeGreaterThan(VESSEL_SEE_DIFF);
    expect(Math.abs(B.min - A.min)).toBeGreaterThan(VESSEL_SEE_DIFF);
  });
});

describe("38 事件3 仕掛けろと、電気回路で同じ波をつくる", () => {
  const rs = grid(VESSEL_SLIDERS.r.min, VESSEL_SLIDERS.r.max, VESSEL_SLIDERS.r.step);
  const cs = grid(VESSEL_SLIDERS.c.min, VESSEL_SLIDERS.c.max, VESSEL_SLIDERS.c.step);
  const all = rs.flatMap((r) => cs.map((c) => ({ r, c })));
  const r1 = all.filter((m) => judgeVesselDuel(1, m).cleared);
  const r2 = all.filter((m) => judgeVesselDuel(2, m).cleared);
  it("各ラウンドに達成できる組み合わせがあり、両方を同時に満たすものはない", () => {
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
    expect(r1.filter((x) => r2.some((y) => y.r === x.r && y.c === x.c))).toEqual([]);
  });
  it("見本そのままでは達成しない", () => {
    expect(judgeVesselDuel(1, BASE_VESSEL).cleared).toBe(false);
    expect(judgeVesselDuel(2, BASE_VESSEL).cleared).toBe(false);
  });
  it("血管Bの値の回路は重なり、時定数だけ同じ回路（R を半分・C を2倍）は重ならない", () => {
    expect(judgeSync(CASE_VESSEL_B, CASE_VESSEL_B).both).toBe(true);
    const j = judgeSync(CASE_VESSEL_B, { r: 0.5, c: 1.5 });
    expect(j.both).toBe(false);
    expect(j.meanOk).toBe(false);
  });
  it("スライダーの格子に、血管Bと重なる組み合わせがある", () => {
    expect(all.some((m) => judgeSync(CASE_VESSEL_B, m).both)).toBe(true);
  });
});
