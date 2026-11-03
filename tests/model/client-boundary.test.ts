// テスト9の補足：画面のコード（src/）は秘密を持つモジュールを読み込まない
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("画面のコードは観測生成器・課題データ・セッションを読み込まない", () => {
  it("src/ の import を検査する（型だけの import は許す）", () => {
    for (const f of readdirSync("src").filter((n) => n.endsWith(".ts"))) {
      const text = readFileSync(join("src", f), "utf8");
      const imports = [...text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gms)];
      for (const m of imports) {
        const typeOnly = !!m[1];
        const path = m[2]!;
        if (typeOnly) continue;
        expect(path, `${f} が ${path} を読み込んでいる`).not.toMatch(/generator|scenarios|session\/|claude\/|server\/app/);
      }
    }
  });
});
