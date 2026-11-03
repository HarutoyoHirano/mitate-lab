// 答え合わせと第2幕の言葉。Bの正体の向き（大きい／小さい、速い／遅い）を、開示した真の値の大小から組み立てる（テスト16）。
// 秘密は終了後（答え合わせ）にだけ届く。この関数はその開示済みの値だけを使う。
import { compare, type Evidence } from "../server/model/comparator.js";
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
  /** 第2幕：膜の見方への入口（問いの答えを先に言わない） */
  readonly membrane: string;
  /** 第2幕：問いに答えた後に出す、Bと膜の対応 */
  readonly membraneLink: string;
}

const NEAR_ZERO = "上乗せ分は待つうちにほとんど残らなくなる（20秒後の残りは測定の誤差より小さい）ので、いつもの検査ではAと区別できません。";
const RELAX_MEMBRANE = "あなたのBは「上乗せ分がやわらぐ時間」が違う素材でした。膜にも同じ形の部分があります。イオンの通りやすさを変えると、戻る速さはどう変わるでしょう？";
const INSTANT_LINK =
  "あなたのBは、回路では R と C1 の両方がAと違うのに、積（時定数）は同じでした。戻る時間が同じでも、部品の組み合わせは一つではありません。いまの膜の実験は、容量を固定して通りやすさだけを変えたので、時定数の違いがそのまま通りやすさの違いになっています。";
const INSTANT_MEMBRANE = "あなたのBは「上乗せのかたさ」が違う素材で、回路では止めた時の高さだけが違いました。膜では、戻る速さは何で決まるでしょう？";

export const STORY: Readonly<Record<Direction, StoryText>> = {
  instantUp: {
    summary: `Bは「押した直後だけ上乗せされるかたさ」がAより大きい素材でした。${NEAR_ZERO}`,
    circuit:
      "回路では、かたさは逆数のコンデンサになります（かたいほど C1 は小さい）。上乗せのかたさに対応するコンデンサ C1 がAより小さく、抵抗 R（＝上乗せのかたさ×やわらぐ時間）がAより大きい。素材で違うのは一つでも、回路では二つの部品の値が動きます。ただし R×C1 はやわらぐ時間 τ そのものなので、Aと同じ。止めた後に戻る速さは同じで、高さだけが違います。",
    membrane: INSTANT_MEMBRANE,
    membraneLink: INSTANT_LINK,
  },
  instantDown: {
    summary: `Bは「押した直後だけ上乗せされるかたさ」がAより小さい素材でした。${NEAR_ZERO}`,
    circuit:
      "回路では、かたさは逆数のコンデンサになります（やわらかいほど C1 は大きい）。上乗せのかたさに対応するコンデンサ C1 がAより大きく、抵抗 R（＝上乗せのかたさ×やわらぐ時間）がAより小さい。素材で違うのは一つでも、回路では二つの部品の値が動きます。ただし R×C1 はやわらぐ時間 τ そのものなので、Aと同じ。止めた後に戻る速さは同じで、高さだけが違います。",
    membrane: INSTANT_MEMBRANE,
    membraneLink: INSTANT_LINK,
  },
  relaxSlow: {
    summary: `Bは「上乗せ分がやわらぐ」のがAより遅い素材でした。${NEAR_ZERO}`,
    circuit: "回路にすると、抵抗 R（＝上乗せのかたさ×やわらぐ時間）がAより大きく、時定数 R×C1 が長い。止めた後、ゆっくり戻ります。",
    membrane: RELAX_MEMBRANE,
    membraneLink: "あなたのBは、膜でいえば「イオンが通りにくい膜」と同じ形（時定数が長い）です。",
  },
  relaxFast: {
    summary: `Bは「上乗せ分がやわらぐ」のがAより速い素材でした。${NEAR_ZERO}`,
    circuit: "回路にすると、抵抗 R（＝上乗せのかたさ×やわらぐ時間）がAより小さく、時定数 R×C1 が短い。止めた後、すばやく戻ります。",
    membrane: RELAX_MEMBRANE,
    membraneLink: "あなたのBは、膜でいえば「イオンが通りやすい膜」と同じ形（時定数が短い）です。",
  },
};

export const STORY_NONE: StoryText = {
  summary: "いつもの検査だけでは、違いは見えませんでした。",
  circuit: "回路にすると、部品の値はAと同じです。",
  membrane: "第1幕で見た「時間をかけてやわらぐ変化」が、細胞の膜では何にあたるかを見てみよう。",
  membraneLink: "",
};

/**
 * 今回の決め手を、記録から組み立てる（テスト22）。
 * 決め手の曲線の「押し終わり」一点（と導入観察）だけで一つに絞れたかを、比較器で確かめて書き分ける。
 */
export function decisiveNote(records: readonly Evidence[], keyCurveId: string | null, narrowed: boolean): string {
  if (!narrowed || !keyCurveId) return "今回の記録では、まだ一つに絞りきれていません。";
  const intro = records.filter((r) => !r.id.includes("@"));
  const end = records.filter((r) => r.id === `${keyCurveId}@0`);
  const endOnly = compare([...intro, ...end]).overall === "narrowed";
  return endOnly
    ? "今回は違いが大きく、押し終わりの高さだけで正体が一つに絞れました。ただし、押し終わりの高さが同じになる別の説明がありうる素材もあります（「この説明で重ねてみる」で試せます）。"
    : "今回は、押し終わりの高さだけでは説明を分けきれず、そのあとの下がり方（0.5〜5秒後）まで比べて正体が一つに絞れました。";
}

export function storyFor(truth: MaterialParams, base: MaterialParams): StoryText {
  const d = directionOfTruth(truth, base);
  return d ? STORY[d] : STORY_NONE;
}
