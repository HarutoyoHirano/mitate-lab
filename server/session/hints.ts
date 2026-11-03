// 定型ヒント（Claudeが使えないとき・Claudeの出力を破棄したときに使う）。
// 4段階：予想の保存 → 着眼点 → 比較方法 → 操作。段階を飛ばさない。
// 数値はここで書いてよい（計算はプログラム。Claudeの自由文とは違う）。
import type { ComparisonResult } from "../model/comparator.js";
import type { SpeedAdvice } from "../model/planner.js";
import { CANDIDATES, type CandidateId, type ObservationSpec, type PushSeconds } from "../model/public.js";

export interface Hint {
  readonly stage: 1 | 2 | 3 | 4;
  readonly text: string;
  readonly suggestion: { readonly pushSeconds: PushSeconds } | null;
  readonly source: "template" | "claude";
  readonly evidenceIds: readonly string[];
}

const SPEED: Record<number, string> = { 0.2: "すばやく（0.2秒）", 1: "ふつう（1秒）", 5: "ゆっくり（5秒）" };

export function speedText(T: number): string {
  return SPEED[T] ?? `${T}秒`;
}

export function specText(s: ObservationSpec): string {
  const when = s.recordAt === 0 ? "押し終わった瞬間" : `押し終わってから${s.recordAt}秒後`;
  return `${s.pushSeconds}秒かけて押し、${when}`;
}

function names(ids: readonly CandidateId[]): string {
  return ids.map((id) => `「${CANDIDATES[id].label}」`).join("と");
}

export function templateHint(
  stage: 1 | 2 | 3 | 4,
  hasPrediction: boolean,
  comparison: ComparisonResult,
  bySpeed: readonly SpeedAdvice[],
  awaitingPick = false,
): Hint {
  const base = { source: "template" as const, evidenceIds: [] as string[] };
  // 本人の判断待ち：候補名や決着は言わず、観測の特徴を指す（テスト20）
  if (awaitingPick) {
    return {
      ...base,
      stage,
      suggestion: null,
      text: "この曲線と点線（見本A）を、押し終わり・2秒後・20秒後の三か所で見比べてみましょう。どこで離れて、どこで重なりますか？ 説明ごとの「この説明で重ねてみる」で、押し終わりの高さを合わせた線が途中も合うかを試せます。見比べたら、合わないと思う説明の名前を押して選び、「これで検算する」を押しましょう。迷ったら「分からない」でも進めます。",
    };
  }
  if (comparison.overall === "narrowed") {
    return {
      ...base,
      stage,
      suggestion: null,
      text: `この候補の中では${names([comparison.narrowedTo!])}に絞れました。どの観察で、ほかの候補が合わなくなったかを振り返ってみましょう。`,
    };
  }
  if (comparison.overall === "noneFits") {
    return {
      ...base,
      stage,
      suggestion: null,
      text: "今の候補では説明できません。「Aと一つだけ違う」という前提が合っていないのかもしれません。無理に一つを選ばず、記録を見直しましょう。",
    };
  }
  if (comparison.overall === "onlyWidened") {
    return {
      ...base,
      stage,
      suggestion: null,
      text: "通常の誤差の範囲では、どの候補とも合いません。同じ観察をもう一度して、測り直しで結果が変わるかを確かめてみましょう。",
    };
  }
  if (stage === 1 || !hasPrediction) {
    return {
      ...base,
      stage: 1,
      suggestion: null,
      text: "まず、押す速さを選んで、Bの押し終わりの高さがAと比べてどうなるか予想しましょう。予想があると、結果から学べることが増えます。",
    };
  }
  if (stage === 2) {
    return {
      ...base,
      stage: 2,
      suggestion: null,
      text: "いつもの検査（20秒後）では、BをAと区別できませんでした。でも、いつもの検査は途中を見ていません。押し終わりの高さや、押し返しがやわらいでいく途中に、違いが隠れていないでしょうか。",
    };
  }
  const top = bySpeed[0];
  if (!top) return { ...base, stage: 3, suggestion: null, text: "記録を見比べてみましょう。" };
  const pairs = [...top.decisivePairs, ...top.separatingPairs];
  const why = pairs.length
    ? `${pairs.map((p) => names(p)).join("、")}は、${speedText(top.pushSeconds)}押した曲線で分かれそうです。`
    : "今はどの押し方も説明を確実には分けませんが、この押し方は説明によって曲線が大きく変わりうる押し方です。";
  if (stage === 3) {
    return {
      ...base,
      stage: 3,
      suggestion: null,
      text: `残っている説明ごとに、曲線の形を思い浮かべてみましょう。「押した直後の高さ」の違いと、「抜けていく速さ」の違いは、どの押し方なら見分けやすいでしょう？ ${why}`,
    };
  }
  return {
    ...base,
    stage: 4,
    suggestion: { pushSeconds: top.pushSeconds },
    text: `${speedText(top.pushSeconds)}押してみましょう。${why}`,
  };
}
