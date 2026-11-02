// モデル・比較器・課題データが編集されたときだけ、数値テストを実行する。
// 失敗したら終了コード2で返し、標準エラーの内容を Claude Code に伝える。
import { execSync } from "node:child_process";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let filePath = "";
  try {
    filePath = JSON.parse(input)?.tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  const watched = /[\\/](server[\\/]model|scenarios|tests[\\/]model)[\\/]/;
  if (!watched.test(filePath)) process.exit(0);
  try {
    execSync("npx vitest run tests/model --reporter=dot", { stdio: "pipe" });
    process.exit(0);
  } catch (e) {
    const out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    process.stderr.write("数値テストが失敗しました。区別可能性・初期症状・正解分離のいずれかが崩れています。\n" + out.slice(-4000));
    process.exit(2);
  }
});
