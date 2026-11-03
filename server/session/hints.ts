// 定型ヒント（Claudeが使えないとき・Claudeの出力を破棄したときに使う）。
// 4段階：予想の保存 → 着眼点 → 比較方法 → 操作。段階を飛ばさない。
// 数値はここで書いてよい（計算はプログラム。Claudeの自由文とは違う）。
import type { ComparisonResult } from "../model/comparator.js";
import type { PlanAdvice } from "../model/planner.js";
import { CANDIDATES, type CandidateId, type ObservationSpec } from "../model/public.js";

export interface Hint {
  readonly stage: 1 | 2 | 3 | 4;
  readonly text: string;
  readonly suggestion: ObservationSpec | null;
  readonly source: "template" | "claude";
  readonly evidenceIds: readonly string[];
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
  advice: PlanAdvice,
): Hint {
  const base = { source: "template" as const, evidenceIds: [] as string[] };
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
      text: "まず、押す時間と記録する時刻を選んで、BがAと比べてどうなるか予想を保存しましょう。予想があると、結果から学べることが増えます。",
    };
  }
  if (stage === 2) {
    return {
      ...base,
      stage: 2,
      suggestion: null,
      text: "十分に待ったあとは、AとBは同じでした。では、押し終わった直後や、速く押したときはどうでしょう？ 「上乗せされる力」が見えるのはいつか、考えてみましょう。",
    };
  }
  const top = advice.ranked[0];
  if (!top) return { ...base, stage: 3, suggestion: null, text: "記録を見比べてみましょう。" };
  const pairs = [...top.decisivePairs, ...top.separatingPairs];
  const why = pairs.length
    ? `${pairs.map((p) => names(p)).join("、")}は、この観察で予測が分かれます。`
    : "今はどの観察も候補を確実には分けませんが、この観察は候補によって結果が大きく変わりうる観察です。";
  if (stage === 3) {
    return {
      ...base,
      stage: 3,
      suggestion: null,
      text: `残っている候補ごとに、予測の帯を比べてみましょう。帯が重ならない観察を選ぶと、説明を分けられます。${why}`,
    };
  }
  return {
    ...base,
    stage: 4,
    suggestion: top.spec,
    text: `「${specText(top.spec)}の力を記録する」観察を試してみましょう。${why}`,
  };
}
