// 先生役の Claude への指示文（CLAUDE.md 1e-5）。組み立て役の出力が計算プログラムの確かめに通ったあとに呼ぶ。
// 先生役は、体の何にあたるか（部品の役）と出典の内容が合っているか、話の文に模型の外の話がないかを見る。
// 出力の形は server/model/review.ts の checkReview で確かめる（AIの出力は信用しない）。
import type { NetPuzzleSpec } from "../model/partsNet.js";
import { refById } from "../model/refs.js";

export const REVIEW_PROMPT_VERSION = "r1";

export function reviewPrompt(spec: NetPuzzleSpec): string {
  const parts = (spec.parts ?? []).map((p) => {
    const r = refById((p as { ref?: string }).ref);
    return `- 部品 ${p.id}（種類：${p.type}、名前：${p.name}）\n  役（体の何にあたるか）：${p.role}\n  出典：${r ? `${r.id}：${r.about} 扱っていないこと：${r.notCovers}` : "（カタログにない）"}`;
  });
  const scenes = (spec.scenes ?? []).map((s) => `「${s.tag}」${(s.caption ?? []).join("")}`).join("\n");
  return `あなたは、医療系の大学で生理学と工学を教える先生の役です。別の AI が組み立てた、学生向けの謎（体の一部を、ためる部品・流れにくさ・送りこむもの などの部品で表した模型）を確かめてください。
数値やつなぎ方は、計算プログラムがすでに確かめています。あなたが見るのは、体の説明として正しいかどうかです。

確かめること：
1. 部品ごとに、その「役」（体の何にあたるか）が、選ばれた出典の内容で説明できるか。出典が「扱っていないこと」に入っていないか。教科書で知られていることか（研究として確立していない話や、まちがった体の説明はだめ）。
2. はじまりの話・見立ての説明・結びの文に、体についてのまちがい、模型の外の話を模型で示したかのような言い方、確立していない話がないか。
3. 病気・診断・治療・薬につながる言葉はだめ。

謎の題名：${spec.title}
題材：${spec.topic}
はじまりの話：
${scenes}
結び：${spec.endLine}
見立ての説明：${spec.analogy}
部品：
${parts.join("\n")}

次の JSON だけを出力してください（説明の文は書かない）。
{"ok": true か false（すべての部品と文が合っていれば true）,
 "items": [{"partId": "部品の id", "ok": true か false, "reason": "40字以内。合っている理由か、合わない理由"}],（部品ごとに一つずつ、すべての部品）
 "text": {"ok": true か false, "reason": "40字以内"},
 "summary": "60字以内のまとめ"}`;
}
