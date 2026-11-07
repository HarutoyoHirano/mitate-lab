// 先生役の Claude の出力の形を確かめる（CLAUDE.md 1e-5）。AIの出力は信用しない：
// 部品ごとにちょうど一つの判定があるか、理由の長さ、禁止の言葉、ok が中身と食い違わないかを、ここで確かめる。
import type { NetPuzzleSpec } from "./partsNet.js";

const BANNED = /病|症|患者|診断|治療|薬|投与|処方|服用|手術|がん|癌|死|異常|発火|活動電位|臨床/;
const MAX_REASON = 80;
/** 画面に出さない言葉を含む理由のかわりに出す文 */
export const HIDDEN = "（画面に出さない言葉を含むため、理由の文は省略）";
const MAX_SUMMARY = 120;

export interface ReviewItem {
  readonly partId: string;
  readonly name: string;
  readonly ok: boolean;
  readonly reason: string;
}
export interface Review {
  /** 形が正しく読めたか（false なら先生役の確かめはできなかった） */
  readonly readable: boolean;
  /** 先生役が通したか（部品も文もすべて ok、かつ ok の宣言と食い違わない） */
  readonly pass: boolean;
  readonly items: readonly ReviewItem[];
  readonly text: { readonly ok: boolean; readonly reason: string } | null;
  readonly summary: string;
  /** 形の問題（読めなかった理由） */
  readonly problems: readonly string[];
}

const str = (v: unknown): v is string => typeof v === "string";

export function checkReview(raw: unknown, spec: NetPuzzleSpec): Review {
  const problems: string[] = [];
  const parts = Array.isArray(spec.parts) ? spec.parts : [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : null;
  if (!rawItems) problems.push("部品ごとの判定（items）がない");
  const items: ReviewItem[] = [];
  const seen = new Set<string>();
  for (const it of rawItems ?? []) {
    const id = str(it?.partId) ? it.partId : "";
    const part = parts.find((p) => p.id === id);
    if (!part) {
      problems.push(`組み立てにない部品「${id || "（id なし）"}」の判定がある`);
      continue;
    }
    if (seen.has(id)) {
      problems.push(`部品「${id}」の判定が二つある`);
      continue;
    }
    seen.add(id);
    const reason = str(it.reason) ? it.reason.trim() : "";
    if (typeof it.ok !== "boolean") problems.push(`部品「${id}」の判定が true/false でない`);
    if (!reason) problems.push(`部品「${id}」の理由がない`);
    if (reason.length > MAX_REASON) problems.push(`部品「${id}」の理由が長すぎる（${reason.length}字）`);
    items.push({ partId: id, name: part.name, ok: it.ok === true, reason });
  }
  for (const p of parts) if (!seen.has(p.id)) problems.push(`部品「${p.id}」の判定がない`);
  const t = r.text && typeof r.text === "object" ? (r.text as Record<string, unknown>) : null;
  const text = t && typeof t.ok === "boolean" && str(t.reason) ? { ok: t.ok, reason: t.reason.trim() } : null;
  if (!text) problems.push("話の文の判定（text）がない");
  else if (text.reason.length > MAX_REASON) problems.push(`話の文の理由が長すぎる（${text.reason.length}字）`);
  const summary = str(r.summary) ? r.summary.trim() : "";
  if (!summary) problems.push("まとめ（summary）がない");
  if (summary.length > MAX_SUMMARY) problems.push(`まとめが長すぎる（${summary.length}字）`);
  if (typeof r.ok !== "boolean") problems.push("全体の判定（ok）が true/false でない");
  // 画面に出さない言葉を含む理由は、判定（✓／✗）を残したまま、理由の文だけを出さない（先生役が「病気につながる言葉はない」と書く場合など）
  const mask = (s: string) => (BANNED.test(s) ? HIDDEN : s);
  items.forEach((it, k) => (items[k] = { ...it, reason: mask(it.reason) }));
  const readable = problems.length === 0;
  const textOut = text ? { ok: text.ok, reason: mask(text.reason) } : null;
  const allOk = items.every((i) => i.ok) && !!text?.ok;
  // ok の宣言が中身と食い違うときは通さない（「全部 ok」と言いながら ✗ がある、など）
  const pass = readable && allOk && r.ok === true;
  return { readable, pass, items, text: textOut, summary: mask(summary), problems };
}

/** 先生役が通さなかった理由を、組み立て役へ戻す形（計算プログラムの不合格と同じ形）にする */
export function reviewFailures(rv: Review): { id: string; label: string; ok: false; detail: string }[] {
  if (!rv.readable) return [{ id: "review-form", label: "先生役の確かめ", ok: false, detail: rv.problems.join("。") }];
  return [
    ...rv.items.filter((i) => !i.ok).map((i) => ({ id: `review-${i.partId}`, label: `先生役：部品「${i.name}」`, ok: false as const, detail: i.reason })),
    ...(rv.text && !rv.text.ok ? [{ id: "review-text", label: "先生役：話の文", ok: false as const, detail: rv.text.reason }] : []),
  ];
}
