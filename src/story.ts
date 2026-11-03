// 答え合わせと第2幕の言葉。Bの正体の向き（大きい／小さい、速い／遅い）を、開示した真の値の大小から組み立てる（テスト16）。
// 秘密は終了後（答え合わせ）にだけ届く。この関数はその開示済みの値だけを使う。
import type { MaterialParams } from "../server/model/public.js";

export type Direction = "instantUp" | "instantDown" | "relaxSlow" | "relaxFast";

export function directionOfTruth(truth: MaterialParams, base: MaterialParams): Direction | null {
  if (Math.abs(truth.tau - base.tau) > 1e-9) return truth.tau > base.tau ? "relaxSlow" : "relaxFast";
  if (Math.abs(truth.e1 - base.e1) > 1e-9) return truth.e1 > base.e1 ? "instantUp" : "instantDown";
  return null;
}

export interface StoryText {
  /** 答え合わせの「つまり」 */
  readonly summary: string;
  /** 回路に変換すると、どの部品がどう違うか */
  readonly circuit: string;
  /** 第2幕：膜の見方への入口 */
  readonly membrane: string;
}

export const STORY: Readonly<Record<Direction, StoryText>> = {
  instantUp: {
    summary:
      "Bは「押した直後だけ上乗せされるかたさ」がAより大きい素材でした。上乗せ分は待つとやわらいで消えるので、いつもの検査（20秒後）ではAと区別できません。押し終わりの高さを見たから、違いが見えました。",
    circuit:
      "回路にすると、上乗せのかたさに対応するコンデンサ C1 がAより小さく、抵抗 R がAより大きい。でも二つを掛けた時定数 R×C1 はAと同じなので、止めた後に戻る速さは同じで、高さだけが違います。",
    membrane: "あなたのBの違いは「止めた時の高さ」でした。膜では、戻る速さは何で決まるでしょう？",
  },
  instantDown: {
    summary:
      "Bは「押した直後だけ上乗せされるかたさ」がAより小さい素材でした。上乗せ分は待つとやわらいで消えるので、いつもの検査（20秒後）ではAと区別できません。押し終わりの高さを見たから、違いが見えました。",
    circuit:
      "回路にすると、上乗せのかたさに対応するコンデンサ C1 がAより大きく、抵抗 R がAより小さい。でも二つを掛けた時定数 R×C1 はAと同じなので、止めた後に戻る速さは同じで、高さだけが違います。",
    membrane: "あなたのBの違いは「止めた時の高さ」でした。膜では、戻る速さは何で決まるでしょう？",
  },
  relaxSlow: {
    summary:
      "Bは「上乗せ分がやわらぐ」のがAより遅い素材でした。20秒も待てばやわらぎきるので、いつもの検査ではAと区別できません。押し終わりから数秒の途中を見たから、違いが見えました。",
    circuit: "回路にすると、抵抗 R（ねばり）がAより大きく、時定数 R×C1 が長い。止めた後、ゆっくり戻ります。",
    membrane: "あなたのBは、膜でいえば「イオンが通りにくい膜」と同じ形（時定数が長い）。では、通りやすさを変えると、戻る速さはどう変わる？",
  },
  relaxFast: {
    summary:
      "Bは「上乗せ分がやわらぐ」のがAより速い素材でした。いつもの検査（20秒後）では、AもBもやわらぎきっているので区別できません。押し終わりの直後を見たから、違いが見えました。",
    circuit: "回路にすると、抵抗 R（ねばり）がAより小さく、時定数 R×C1 が短い。止めた後、すばやく戻ります。",
    membrane: "あなたのBは、膜でいえば「イオンが通りやすい膜」と同じ形（時定数が短い）。では、通りやすさを変えると、戻る速さはどう変わる？",
  },
};

export const STORY_NONE: StoryText = {
  summary: "いつもの検査だけでは、違いは見えませんでした。",
  circuit: "回路にすると、部品の値はAと同じです。",
  membrane: "第1幕で見た「時間をかけてやわらぐ変化」が、細胞の膜では何にあたるかを見てみよう。",
};

export function storyFor(truth: MaterialParams, base: MaterialParams): StoryText {
  const d = directionOfTruth(truth, base);
  return d ? STORY[d] : STORY_NONE;
}
