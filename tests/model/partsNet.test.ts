// テスト41（CLAUDE.md 1e-2）：部品箱と、AIが組み立てた模型の確かめ。
import { describe, expect, it } from "vitest";
import { metricOf, runNet, verifyNetPuzzle, withB, type NetPuzzleSpec } from "../../server/model/partsNet.js";
import { PREPARED_NETS, netPrompt, netRetryPrompt } from "../../server/claude/netPrompt.js";
import { BASE_VESSEL, CASE_VESSEL_B, steadyBeat, summarize } from "../../server/model/vessel.js";
import { BASE_MEM, CASE3_B, potentialMv } from "../../server/model/membraneGame.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const scenes = [
  { tag: "一", caption: ["一文。"] },
  { tag: "二", caption: ["一文。"] },
  { tag: "三", caption: ["一文。"] },
];
const units = { level: { name: "高さ", unit: "u" }, amount: { name: "量", unit: "u" }, flow: { name: "流れ", unit: "u" } };

/** ためる部品一つと流れにくさ一つ（解析解と比べる） */
const rc: NetPuzzleSpec = {
  title: "テスト",
  topic: "テスト",
  scenes,
  endLine: "結び",
  analogy: "見立て",
  units,
  clock: { kind: "pulse", on: 3, record: 10, timeUnit: "秒" },
  nodes: [
    { id: "a", name: "ためる場所" },
    { id: "g", name: "地面", fixed: 0 },
  ],
  parts: [
    { id: "s", type: "source", name: "送る", role: "送る", node: "a", amplitude: 2 },
    { id: "c", type: "store", name: "ためる", role: "ためる", node: "a", C: 0.5 },
    { id: "r", type: "resist", name: "逃げ道", role: "逃げ道", from: "a", to: "g", R: 2 },
  ],
  watch: [{ probe: { node: "a" }, label: "高さ" }],
  robot: { probe: { node: "a" }, metric: "plateau", says: "同じです。" },
  B: { part: "c", param: "C", factor: 2, reveal: "正体" },
  outOfScope: ["なし"],
};

/** 心臓（自分で固くなる部屋＋一方通行の戸二つ＋血管）。部品箱の計算の確かめ用（指示文には入れない） */
const heart: NetPuzzleSpec = {
  ...rc,
  clock: { kind: "beats", on: 0.3, period: 0.8, timeUnit: "秒" },
  units: { level: { name: "圧", unit: "mmHg" }, amount: { name: "血液", unit: "mL" }, flow: { name: "流れ", unit: "mL/秒" } },
  nodes: [
    { id: "vein", name: "静脈の戻り口", fixed: 8 },
    { id: "lv", name: "部屋の中" },
    { id: "art", name: "血管の中" },
    { id: "out", name: "その先", fixed: 0 },
  ],
  parts: [
    { id: "mv", type: "valve", name: "入口の戸", role: "入口の弁", from: "vein", to: "lv", R: 0.01 },
    { id: "ch", type: "chamber", name: "部屋", role: "下の部屋", node: "lv", Emin: 0.06, Emax: 2, V0: 10 },
    { id: "av", type: "valve", name: "出口の戸", role: "出口の弁", from: "lv", to: "art", R: 0.005 },
    { id: "ca", type: "store", name: "血管のふくらみやすさ", role: "太い血管", node: "art", C: 1.5 },
    { id: "rp", type: "resist", name: "出口の流れにくさ", role: "細い血管", from: "art", to: "out", R: 1 },
  ],
  watch: [
    { probe: { node: "art" }, label: "血管の圧" },
    { probe: { amount: "ch" }, label: "部屋の血液" },
  ],
  robot: { probe: { flow: "av" }, metric: "perCycle", says: "1回で送り出す量は同じです。" },
  B: { part: "ch", param: "Emax", factor: 0.6, compensate: { part: "ch", param: "Emin" }, reveal: "正体" },
};

describe("41 部品箱", () => {
  it("ためる部品と流れにくさの解は解析解と一致する", () => {
    const r = runNet(rc);
    const tau = 1;
    r.t.forEach((t, i) => {
      const y = t <= 3 ? 4 * (1 - Math.exp(-t / tau)) : 4 * (1 - Math.exp(-3 / tau)) * Math.exp(-(t - 3) / tau);
      expect(r.level.a![i]).toBeCloseTo(y, 5);
    });
  });

  it("固さが一定の部屋は、ためる部品と同じにふるまう", () => {
    const ch: NetPuzzleSpec = { ...rc, parts: rc.parts.map((p) => (p.type === "store" ? { id: "c", type: "chamber", name: "部屋", role: "部屋", node: "a", Emin: 2, Emax: 2, V0: 0 } : p)) };
    const a = runNet(rc).level.a!;
    const b = runNet(ch).level.a!;
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 6));
  });

  it("一方通行の戸は逆向きに流さない", () => {
    const back: NetPuzzleSpec = {
      ...rc,
      nodes: [...rc.nodes, { id: "hi", name: "高い場所", fixed: 10 }],
      parts: [...rc.parts, { id: "v", type: "valve", name: "戸", role: "戸", from: "a", to: "hi", R: 0.1 }],
    };
    const r = runNet(back);
    expect(Math.max(...r.flow.v!)).toBe(0);
    // 戸を前向きにすると、高い場所から流れこむことはない（from=a のほうが低い）が、a が高くなれば流れ出る
    const fwd: NetPuzzleSpec = { ...back, parts: back.parts.map((p) => (p.id === "v" ? { ...p, from: "hi", to: "a" } : p)) };
    const f = runNet(fwd);
    expect(Math.min(...f.flow.v!)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...f.flow.v!)).toBeGreaterThan(0);
  });

  it("用意した血管の謎は、謎4の模型と一致する（見本もBも）", () => {
    const sp = PREPARED_NETS[0]!;
    const ref = steadyBeat(BASE_VESSEL);
    const r = runNet(sp, 400);
    r.t.forEach((t, i) => expect(r.level.vessel![i]).toBeCloseTo(ref[i * 2]!, 2));
    expect(metricOf(sp, r, { node: "vessel" }, "mean")).toBeCloseTo(summarize(BASE_VESSEL).mean, 1);
    const rb = runNet(withB(sp));
    expect(Math.max(...rb.level.vessel!)).toBeCloseTo(summarize(CASE_VESSEL_B).max, 1);
    expect(Math.min(...rb.level.vessel!)).toBeCloseTo(summarize(CASE_VESSEL_B).min, 1);
  });

  it("用意した膜の謎は、謎5の模型と一致する（見本もBも）", () => {
    const sp = PREPARED_NETS[1]!;
    const r = runNet(sp);
    const rb = runNet(withB(sp));
    r.t.forEach((t, i) => {
      expect(r.level.inside![i]).toBeCloseTo(potentialMv(BASE_MEM, t), 4);
      expect(rb.level.inside![i]).toBeCloseTo(potentialMv(CASE3_B, t), 4);
    });
  });

  it("用意した謎は確かめに通る", () => {
    for (const sp of PREPARED_NETS) {
      const v = verifyNetPuzzle(sp);
      expect(v.checks.filter((c) => !c.ok)).toEqual([]);
    }
  });

  it("心臓の例：部屋が縮んで送り出し、落ち着いた1回で入る量と出る量が等しい", () => {
    const r = runNet(heart);
    expect(r.settled).toBe(true);
    const inflow = metricOf(heart, r, { flow: "mv" }, "perCycle");
    const outflow = metricOf(heart, r, { flow: "av" }, "perCycle");
    const periph = metricOf(heart, r, { flow: "rp" }, "perCycle");
    expect(outflow).toBeGreaterThan(50);
    expect(Math.abs(inflow - outflow) / outflow).toBeLessThan(2e-3);
    expect(Math.abs(periph - outflow) / outflow).toBeLessThan(2e-3);
    // 部屋の血液は縮むあいだに減り、ゆるむあいだに増える
    const v = r.amount.ch!;
    expect(Math.max(...v) - Math.min(...v)).toBeCloseTo(outflow, 0);
    // 戸は逆に流れない
    expect(Math.min(...r.flow.mv!, ...r.flow.av!)).toBeGreaterThanOrEqual(0);
  });

  it("compensate で、ロボの数字（1回で送り出す量）がそろう", () => {
    const v = verifyNetPuzzle(heart);
    expect(v.ok).toBe(true);
    expect(v.compensateFactor).toBeDefined();
    expect(Math.abs(v.robotB! - v.robotA!) / v.robotA!).toBeLessThan(0.02);
    // compensate がないと、そろわないので通らない
    const raw = verifyNetPuzzle({ ...heart, B: { ...heart.B, compensate: undefined } });
    expect(raw.checks.find((c) => c.id === "robot")!.ok).toBe(false);
  });

  it("つなぎ方の誤りを落とす", () => {
    // 逃げ道のないためる場所（肺の謎 v1 と同じ誤り：送りこむ道に直列の流れにくさだけ）
    const trapped: NetPuzzleSpec = {
      ...rc,
      nodes: [
        { id: "a", name: "ためる場所" },
        { id: "b", name: "奥の場所" },
        { id: "g", name: "地面", fixed: 0 },
      ],
      parts: [
        { id: "s", type: "source", name: "送る", role: "送る", node: "a", amplitude: 2 },
        { id: "c", type: "store", name: "ためる", role: "ためる", node: "a", C: 0.5 },
        { id: "c2", type: "store", name: "奥", role: "奥", node: "b", C: 0.5 },
        { id: "r", type: "resist", name: "道", role: "道", from: "a", to: "b", R: 2 },
      ],
    };
    expect(verifyNetPuzzle(trapped).checks.find((c) => c.id === "leak")!.ok).toBe(false);
    // ためる部品のない節点
    const bare: NetPuzzleSpec = { ...rc, parts: rc.parts.filter((p) => p.type !== "store") };
    expect(verifyNetPuzzle(bare).checks.find((c) => c.id === "wiring")!.ok).toBe(false);
    // 流れない部品（両端とも高さの決まった同じ高さの場所）
    const idle: NetPuzzleSpec = {
      ...rc,
      B: { ...rc.B, factor: 2.2 },
      nodes: [...rc.nodes, { id: "g2", name: "地面2", fixed: 0 }],
      parts: [...rc.parts, { id: "z", type: "resist", name: "飾り", role: "飾り", from: "g", to: "g2", R: 1 }],
    };
    expect(verifyNetPuzzle(idle).checks.find((c) => c.id === "active")!.ok).toBe(false);
    // 病気につながる言葉
    expect(verifyNetPuzzle({ ...heart, title: "心臓の病気の見落とし" }).checks.find((c) => c.id === "words")!.ok).toBe(false);
  });

  it("指示文には見本（血管・膜）があり、心臓の組み立て方は書かない", () => {
    const p = netPrompt("心臓");
    expect(p).toContain("心臓");
    expect(p).toContain("chamber（自分で固くなる部屋");
    expect(p).not.toContain('"Emax":2');
    expect(netRetryPrompt("心臓", { a: 1 }, [{ id: "x", label: "理由", ok: false, detail: "詳細" }])).toContain("理由：詳細");
  });

  it("Claude が実際に組み立てた模型の確かめの結果（記録）", () => {
    const dir = join(__dirname, "../fixtures/ai-nets");
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      files = [];
    }
    for (const f of files) {
      const rec = JSON.parse(readFileSync(join(dir, f), "utf8")) as { expectOk: boolean; output: unknown };
      expect(verifyNetPuzzle(rec.output).ok, f).toBe(rec.expectOk);
    }
  });
});
