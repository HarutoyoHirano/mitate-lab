// テスト40：つづきの謎（CLAUDE.md 1e）。AIの出力は信用せず、プログラムが確かめる
import { describe, expect, it } from "vitest";
import { simulate, verifyPuzzle, type PuzzleSpec } from "../../server/model/rcPuzzle.js";
import { PREPARED, extractJson, puzzlePrompt } from "../../server/claude/puzzlePrompt.js";
import { BASE_VESSEL, CASE_VESSEL_B, summarize } from "../../server/model/vessel.js";
import { BASE_MEM, CASE3_B, potentialMv } from "../../server/model/membraneGame.js";

const clone = (s: PuzzleSpec): PuzzleSpec => JSON.parse(JSON.stringify(s));

describe("40 つづきの謎の確かめ", () => {
  it("用意した謎（血管・膜）は確かめに通る", () => {
    for (const s of PREPARED) {
      const v = verifyPuzzle(s);
      expect(v.ok, JSON.stringify(v.checks.filter((c) => !c.ok))).toBe(true);
    }
  });
  it("用意した血管の謎は、謎4の血管の模型と同じ平均・高い圧と低い圧の差になる", () => {
    const v = verifyPuzzle(PREPARED[0]!);
    const a = v.trace!.a;
    const b = v.trace!.b;
    expect(Math.max(...a)).toBeCloseTo(summarize(BASE_VESSEL).max, 0);
    expect(Math.min(...b)).toBeCloseTo(summarize(CASE_VESSEL_B).min, 0);
    expect(v.robotA!).toBeCloseTo(summarize(BASE_VESSEL).mean, 0);
  });
  it("用意した膜の謎は、謎5の膜の模型と同じ電圧になる", () => {
    const v = verifyPuzzle(PREPARED[1]!);
    for (const k of [10, 50, 120, 200]) {
      const i = v.trace!.t.findIndex((t) => t >= k);
      expect(v.trace!.a[i]!).toBeCloseTo(potentialMv(BASE_MEM, v.trace!.t[i]!), 1);
      expect(v.trace!.b[i]!).toBeCloseTo(potentialMv(CASE3_B, v.trace!.t[i]!), 1);
    }
  });
  it("ロボに見えてしまう謎（Bは流れにくさが違う・止める直前を見る）は通らない", () => {
    const s = clone(PREPARED[1]!) as PuzzleSpec & { B: { kind: string } };
    (s as { B: { kind: string } }).B.kind = "tradeoff";
    (s as { robot: { metric: string } }).robot.metric = "plateau";
    const v = verifyPuzzle(s);
    expect(v.ok).toBe(false);
  });
  it("流す時間が短すぎてロボの数字にも差が出る謎は通らない", () => {
    const s = clone(PREPARED[1]!);
    (s.input as { on: number }).on = 30;
    expect(verifyPuzzle(s).checks.find((c) => c.id === "robot")!.ok).toBe(false);
  });
  it("違いが小さすぎる謎・病気につながる言葉・形の崩れは通らない", () => {
    const small = clone(PREPARED[0]!);
    (small.B as { factor: number }).factor = 1.1;
    expect(verifyPuzzle(small).ok).toBe(false);
    const bad = clone(PREPARED[0]!);
    (bad.B as { reveal: string }).reveal = "血管Bは病気の血管です。";
    expect(verifyPuzzle(bad).checks.find((c) => c.id === "words")!.ok).toBe(false);
    expect(verifyPuzzle({ title: "x" }).ok).toBe(false);
    expect(verifyPuzzle(null).ok).toBe(false);
  });
  it("型③（戻る時間は同じ・高さが違う）を確かめられる", () => {
    const s = clone(PREPARED[1]!);
    (s as { robot: { metric: string } }).robot.metric = "halfTime";
    (s.B as { kind: string; factor: number }).kind = "tradeoff";
    (s.B as { factor: number }).factor = 1.4;
    const v = verifyPuzzle(s);
    expect(v.ok, JSON.stringify(v.checks)).toBe(true);
    expect(Math.abs(v.robotB! - v.robotA!)).toBeLessThan(0.03 * v.robotA!);
  });
  it("模型の解き方は、一定の入力で解析解と一致する", () => {
    const s = PREPARED[1]!;
    const r = simulate(s, 10, 1, 200, 400);
    const i = r.t.findIndex((t) => t >= 30);
    expect(r.y[i]!).toBeCloseTo(10 * (1 - Math.exp(-r.t[i]! / 10)), 6);
  });
  it("指示文に題材と見本が入り、JSONの取り出しが前後の文に強い", () => {
    const p = puzzlePrompt("肺");
    expect(p).toContain("肺");
    expect(p).toContain("脈の見落とし");
    expect(extractJson('はい。\n{"a":1}\n以上')).toEqual({ a: 1 });
    expect(extractJson("JSONなし")).toBeNull();
  });
});

describe("40b 試作で Claude が実際に出力した謎（11/5、指示文 v2 は逃げ道の欄つき）", () => {
  // tests/fixtures/ai-puzzles：Claude（Sonnet）に指示文だけを渡して得た出力。人は手を加えていない
  const dir = new URL("../fixtures/ai-puzzles/", import.meta.url);
  it("指示文 v2 の出力（肺・心臓）は、確かめに一度で通る", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["lung.json", "heart.json"]) {
      const v = verifyPuzzle(extractJson(readFileSync(new URL(f, dir), "utf-8")));
      expect(v.ok, `${f} ${JSON.stringify(v.checks.filter((c) => !c.ok))}`).toBe(true);
    }
  });
  it("指示文 v1 の出力（体温・皮膚）は、逃げ道の欄がないので形の確かめで落ちる", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["temperature.v1.json", "skin.v1.json"]) {
      const v = verifyPuzzle(extractJson(readFileSync(new URL(f, dir), "utf-8")));
      expect(v.checks.find((c) => c.id === "shape")!.ok).toBe(false);
    }
  });
});
