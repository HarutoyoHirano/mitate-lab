// テスト43：先生役の Claude の出力の形の確かめ（CLAUDE.md 1e-5）
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { HIDDEN, checkReview, reviewFailures } from "../../server/model/review.js";
import { reviewPrompt } from "../../server/puzzle/reviewPrompt.js";
import type { NetPuzzleSpec } from "../../server/model/partsNet.js";

const net = (n: string) => JSON.parse(fs.readFileSync(`tests/fixtures/ai-nets/${n}`, "utf8")).output as NetPuzzleSpec;
const heart = net("heart.v4.json");
const good = {
  ok: true,
  items: heart.parts.map((p) => ({ partId: p.id, ok: true, reason: "出典の内容で説明できる" })),
  text: { ok: true, reason: "模型の外の話はない" },
  summary: "合っている",
};

describe("先生役の確かめの形（テスト43）", () => {
  it("正しい形なら読めて、すべて ok なら通る", () => {
    const r = checkReview(good, heart);
    expect(r.readable).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.items).toHaveLength(heart.parts.length);
  });
  it("部品の判定が抜けている・余っている・二つあると読めない", () => {
    expect(checkReview({ ...good, items: good.items.slice(1) }, heart).readable).toBe(false);
    expect(checkReview({ ...good, items: [...good.items, { partId: "nope", ok: true, reason: "x" }] }, heart).readable).toBe(false);
    expect(checkReview({ ...good, items: [...good.items, good.items[0]] }, heart).readable).toBe(false);
  });
  it("ok の宣言が中身と食い違えば通さない", () => {
    const items = good.items.map((i, k) => (k === 0 ? { ...i, ok: false } : i));
    const r = checkReview({ ...good, items }, heart);
    expect(r.readable).toBe(true);
    expect(r.pass).toBe(false);
    expect(reviewFailures(r)).toHaveLength(1);
    expect(checkReview({ ...good, text: { ok: false, reason: "食い違い" } }, heart).pass).toBe(false);
  });
  it("画面に出さない言葉は、判定を残して理由の文だけ出さない", () => {
    const items = good.items.map((i, k) => (k === 0 ? { ...i, reason: "病気につながる言葉はない" } : i));
    const r = checkReview({ ...good, items, summary: "診断の話はない" }, heart);
    expect(r.readable).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.items[0]!.reason).toBe(HIDDEN);
    expect(r.summary).toBe(HIDDEN);
  });
  it("長すぎる理由・形の崩れは読めない", () => {
    const long = good.items.map((i, k) => (k === 0 ? { ...i, reason: "あ".repeat(81) } : i));
    expect(checkReview({ ...good, items: long }, heart).readable).toBe(false);
    expect(checkReview("ok", heart).readable).toBe(false);
    expect(checkReview({ ...good, ok: "yes" }, heart).readable).toBe(false);
  });
  it("指示文には、部品ごとの役と出典の内容が入る", () => {
    const p = reviewPrompt(heart);
    for (const part of heart.parts) expect(p).toContain(part.role);
    expect(p).toContain("suga1973");
  });
  it("記録の先生役の出力は、組み立ての記録と部品の id でそろい、形が読める", () => {
    const files = fs.readdirSync("tests/fixtures/ai-reviews").filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const rec = JSON.parse(fs.readFileSync(`tests/fixtures/ai-reviews/${f}`, "utf8"));
      const r = checkReview(rec.output, net(rec.net));
      expect(r.readable, `${f}: ${r.problems.join(" / ")}`).toBe(true);
    }
  });
  it("腎臓の記録は、先生役が出典の当て方を指摘して通さない（作り直しが要る例）", () => {
    const rec = JSON.parse(fs.readFileSync("tests/fixtures/ai-reviews/kidney.json", "utf8"));
    const r = checkReview(rec.output, net(rec.net));
    expect(r.pass).toBe(false);
    expect(r.items.find((i) => !i.ok)?.partId).toBe("tuft");
  });
});
