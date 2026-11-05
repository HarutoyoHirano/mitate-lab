// 出典カタログ（CLAUDE.md 1e-3）の形の確かめ。書誌そのものの正しさは、作者側で出版社・索引の頁を見て確かめる（checkedAt）。
import { describe, expect, it } from "vitest";
import { REFS, refById, refCatalogText } from "../../server/model/refs.js";

const PART_TYPES = ["store", "chamber", "resist", "valve", "source"];

describe("出典カタログ", () => {
  it("id は重ならず、英小文字と数字だけ", () => {
    const ids = REFS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*$/);
  });

  it("どの文献にも、書誌・分野・内容・扱わないこと・対象の言葉・確かめた先がある", () => {
    for (const r of REFS) {
      expect(r.cite.length, r.id).toBeGreaterThan(30);
      expect(r.cite, r.id).toMatch(/(18|19|20)\d\d/); // 年
      expect(r.cite, r.id).not.toMatch(/\.\.\.|…|et al/); // 題名や著者を省略しない
      expect(r.field.length, r.id).toBeGreaterThan(0);
      expect(r.about.length, r.id).toBeGreaterThan(10);
      expect(r.notCovers.length, r.id).toBeGreaterThan(3);
      expect(r.checkedAt.length, r.id).toBeGreaterThan(3);
      expect(r.topicWords).toBeInstanceOf(RegExp);
      if (r.doi) expect(r.doi, r.id).toMatch(/^10\.\d{4,}\//);
    }
  });

  it("支える部品は部品箱の種類だけで、一つ以上", () => {
    for (const r of REFS) {
      expect(r.supports.length, r.id).toBeGreaterThan(0);
      for (const s of r.supports) expect(PART_TYPES, r.id).toContain(s);
    }
  });

  it("画面と指示文に出す言葉に、病名・診断につながる言葉を入れない", () => {
    for (const r of REFS) {
      for (const text of [r.about, r.notCovers]) {
        expect(text, r.id).not.toMatch(/診断|治療|患者|病気|疾患|薬の量|発火|活動電位/);
      }
    }
  });

  it("refById と指示文のカタログは、全文献を含む", () => {
    const text = refCatalogText();
    for (const r of REFS) {
      expect(refById(r.id)).toBe(r);
      expect(text).toContain(`- ${r.id}（`);
    }
    expect(refById("nope")).toBeUndefined();
  });
});
