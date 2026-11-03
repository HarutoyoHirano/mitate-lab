// CLAUDE.md 第7章のテスト9（API応答・Claude入力に秘密が出ない）とテスト12（Claude出力の検証）、セッションの規則
import { afterEach, describe, expect, it } from "vitest";
import { HIDDEN_CAUSES } from "../../scenarios/material1.js";
import { buildPartnerInput, claudeHint, setPartnerCaller, validatePartnerOutput } from "../../server/claude/partner.js";
import { ALLOWED_OBSERVATIONS } from "../../server/model/public.js";
import { Session } from "../../server/session/session.js";

afterEach(() => setPartnerCaller(null));

function playSome(s: Session) {
  let n = 0;
  for (const spec of [ALLOWED_OBSERVATIONS[0]!, ALLOWED_OBSERVATIONS[7]!, ALLOWED_OBSERVATIONS[3]!]) {
    s.savePrediction(spec, "higher", "速く押すと強そう");
    s.observe(spec, `obs-${n++}`);
  }
}

describe("テスト9：応答・Claude入力に、選ばれた原因・真の値・乱数の種が混入しない", () => {
  it("全隠れ原因で、公開ビューとClaude入力を検査する", () => {
    for (const c of HIDDEN_CAUSES) {
      const seed = 13579246;
      const value = c.range[0] + (c.range[1] - c.range[0]) * 0.3721;
      const s = new Session("t", { seed, cause: c.id, value });
      playSome(s);
      s.nextTemplateHint();
      s.nextTemplateHint();
      s.nextTemplateHint();
      const texts = [JSON.stringify(s.publicView()), buildPartnerInput(s.publicView()), JSON.stringify(s)];
      for (const t of texts) {
        expect(t).not.toContain(c.id);
        expect(t).not.toContain(String(seed));
        expect(t).not.toContain(String(value));
        expect(t).not.toContain(c.explanation);
      }
    }
  });
});

describe("セッションの規則", () => {
  it("予想を保存しないと観察できない。観察IDで二重実行を防ぐ", () => {
    const s = new Session("t", { seed: 5 });
    const spec = ALLOWED_OBSERVATIONS[0]!;
    expect(() => s.observe(spec, "a")).toThrow();
    s.savePrediction(spec, "same");
    const r1 = s.observe(spec, "a");
    const r2 = s.observe(spec, "a");
    expect(r2).toBe(r1);
    expect(s.publicView().observationCount).toBe(1);
  });
  it("別の押し方の予想では観察できない。範囲外の入力を受け付けない", () => {
    const s = new Session("t", { seed: 5 });
    s.savePrediction(ALLOWED_OBSERVATIONS[0]!, "same");
    expect(() => s.observe(ALLOWED_OBSERVATIONS[1]!, "b")).toThrow();
    expect(() => s.savePrediction({ pushSeconds: 3 as never, recordAt: 0 }, "same")).toThrow();
  });
  it("計画支援の結果は、ヒント3段階目より前は見せない", () => {
    const s = new Session("t", { seed: 9 });
    expect(s.publicView().plan).toEqual([]);
    s.savePrediction(ALLOWED_OBSERVATIONS[0]!, "higher");
    s.nextTemplateHint(); // 2 → 3
    expect(s.publicView().hintStage).toBe(3);
    expect(s.publicView().plan.length).toBeGreaterThan(0);
  });
  it("ヒントは段階を飛ばさない", () => {
    const s = new Session("t", { seed: 9 });
    expect(s.nextTemplateHint().stage).toBe(1);
    s.savePrediction(ALLOWED_OBSERVATIONS[0]!, "higher");
    expect(s.nextTemplateHint().stage).toBe(2);
    expect(s.nextTemplateHint().stage).toBe(3);
    expect(s.nextTemplateHint().stage).toBe(4);
    expect(s.nextTemplateHint().stage).toBe(4);
  });
});

describe("テスト12：Claude出力の検証", () => {
  const s = new Session("t", { seed: 1 });
  const view = s.publicView();
  const ok = { evidenceIds: ["intro-B"], interpretation: "待ったあとは同じでした。", nextSuggestion: "押した直後はどうでしょう？", hintStage: 2 };
  it("正しい出力は通る", () => {
    expect(validatePartnerOutput(ok, view).ok).toBe(true);
  });
  it("数字を含む文、存在しないID、範囲外の観察提案は通らない", () => {
    expect(validatePartnerOutput({ ...ok, interpretation: "差は0.2です" }, view)).toEqual({ ok: false, reason: "digits" });
    expect(validatePartnerOutput({ ...ok, nextSuggestion: "２秒後を見よう" }, view)).toEqual({ ok: false, reason: "digits" });
    expect(validatePartnerOutput({ ...ok, evidenceIds: ["nope"] }, view).ok).toBe(false);
    expect(validatePartnerOutput({ ...ok, candidateIds: ["magic"] }, view).ok).toBe(false);
    expect(validatePartnerOutput({ ...ok, proposedObservation: { pushSeconds: 3, recordAt: 0 } }, view).ok).toBe(false);
  });
  it("数字が入ったら1回だけ作り直させ、それでもだめなら定型ヒント", async () => {
    let calls = 0;
    setPartnerCaller(async () => {
      calls++;
      return { ...ok, interpretation: "差は0.2です" };
    });
    const s2 = new Session("t", { seed: 1 });
    const h = await claudeHint(s2);
    expect(calls).toBe(2);
    expect(h.source).toBe("template");
  });
  it("作り直しで直れば、Claudeの応答を使う", async () => {
    let calls = 0;
    setPartnerCaller(async () => (++calls === 1 ? { ...ok, interpretation: "差は0.2です" } : ok));
    const h = await claudeHint(new Session("t", { seed: 1 }));
    expect(calls).toBe(2);
    expect(h.source).toBe("claude");
  });
  it("通信に失敗したら定型ヒントで続ける", async () => {
    setPartnerCaller(async () => {
      throw new Error("network");
    });
    const h = await claudeHint(new Session("t", { seed: 1 }));
    expect(h.source).toBe("template");
  });
});
