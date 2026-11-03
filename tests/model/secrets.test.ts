// CLAUDE.md 第7章のテスト9（秘密の非混入）のうち、観測生成器の部分。
// セッションAPIとClaude入力の検査は、それらを実装したときにこのファイルへ足す。
import { describe, expect, it } from "vitest";
import { HIDDEN_CAUSES } from "../../scenarios/material1.js";
import { ObservationGenerator } from "../../server/model/generator.js";

describe("テスト9（生成器）：秘密は文字列化・JSON化しても出ない", () => {
  it("原因ID・真の値・乱数の種が現れない", () => {
    for (const c of HIDDEN_CAUSES) {
      const g = new ObservationGenerator({ seed: 987654, cause: c.id, value: (c.range[0] + c.range[1]) / 2 });
      const truth = g.revealForDebrief().truth;
      const texts = [JSON.stringify(g), JSON.stringify({ session: g }), String(g), `${g}`];
      for (const s of texts) {
        expect(s).not.toContain(c.id);
        expect(s).not.toContain("987654");
        expect(s).not.toContain(String(truth.e1));
        expect(s).not.toContain(String(truth.tau));
      }
      expect(Object.keys(g)).toEqual([]);
    }
  });
});
