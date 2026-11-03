// 第1の課題：素材Bは基準素材Aと一つだけ違う。
// 真値の範囲は秘密（サーバーの観測生成器だけが読む）。画面・API応答・Claudeへの入力に出さない。
// 範囲は、Aとの差が誤差より十分大きく、最悪ケースまで決着するように設計段階の数値試作で決めた。
import type { ParamKey } from "../server/model/public.js";

export type HiddenCauseId = "instantUp" | "instantDown" | "relaxSlow" | "relaxFast";

export interface HiddenCauseSpec {
  readonly id: HiddenCauseId;
  readonly param: ParamKey;
  readonly range: readonly [number, number];
  /** 終了後の解説で使う言葉 */
  readonly explanation: string;
}

export const HIDDEN_CAUSES: readonly HiddenCauseSpec[] = Object.freeze([
  { id: "instantUp", param: "e1", range: [1.3, 2.0], explanation: "押した直後だけ上乗せされるかたさが、Aより大きかった" },
  { id: "instantDown", param: "e1", range: [0.5, 0.6], explanation: "押した直後だけ上乗せされるかたさが、Aより小さかった" },
  { id: "relaxSlow", param: "tau", range: [1.6, 4.0], explanation: "上乗せ分がやわらぐのが、Aより遅かった" },
  { id: "relaxFast", param: "tau", range: [0.3, 0.5], explanation: "上乗せ分がやわらぐのが、Aより速かった" },
] as const);
