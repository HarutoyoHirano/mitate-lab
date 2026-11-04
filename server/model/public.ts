// 公開情報（学生・画面・Claudeに見せてよいもの）だけを置く。
// 隠れた原因・真の値・乱数の種はここに置かない（scenarios/ と generator.ts だけが持つ）。

/** 標準線形固体の3つの値。E∞＝待ったあとも残るかたさ、E1＝押した直後だけ上乗せされるかたさ、τ＝上乗せ分がやわらぐ時間の目安 */
export interface MaterialParams {
  readonly eInf: number;
  readonly e1: number;
  readonly tau: number;
}

/** 基準素材A（基準カード） */
export const BASE: MaterialParams = Object.freeze({ eInf: 1, e1: 1, tau: 1 });

/** 押す深さ（初期版では固定） */
export const DEPTH = 1;

/** 各記録点の有界一様誤差の幅（Aが落ち着いた力1に対して） */
export const ERROR = 0.02;

/** 「まだ判断できない」の判定に使う、誤差を広げる倍率（教材内の規則。確率や信頼度ではない） */
export const WIDEN = 2;

export const PUSH_SECONDS = [0.2, 1, 5] as const;
export const RECORD_AT = [0, 0.5, 2, 5, 20] as const;
export type PushSeconds = (typeof PUSH_SECONDS)[number];
export type RecordAt = (typeof RECORD_AT)[number];

/** 一回の押しで選ぶもの：押す時間と、記録する時刻（押し終わりからの秒数） */
export interface ObservationSpec {
  readonly pushSeconds: PushSeconds;
  readonly recordAt: RecordAt;
}

/** 許可された15通りの観察（押す時間の短い順、記録時刻の早い順） */
export const ALLOWED_OBSERVATIONS: readonly ObservationSpec[] = PUSH_SECONDS.flatMap((pushSeconds) =>
  RECORD_AT.map((recordAt) => ({ pushSeconds, recordAt })),
);

/** 導入観察：1秒で押し、20秒後の1点を見る */
export const INTRO_OBSERVATION: ObservationSpec = Object.freeze({ pushSeconds: 1, recordAt: 20 });

/**
 * 検査の判定の許容差（測定誤差 ERROR とは別の、検査の決まり）。
 * 隠れた範囲の真の差は 0.006 以下なので、Bの測定値と基準Aの差は最大 0.026 で、どの乱数でもこの幅に収まる（テスト15）。
 */
export const TEST_TOLERANCE = 0.03;

/** 測定値と基準値の差から、検査の判定を計算する（画面とテストで同じ関数を使う） */
export function judgeAgainstBase(measured: number, base: number): { diff: number; indistinguishable: boolean } {
  const diff = measured - base;
  return { diff, indistinguishable: Math.abs(diff) <= TEST_TOLERANCE + 1e-12 };
}

export type CandidateId = "overall" | "instant" | "relax" | "same";
export const CANDIDATE_IDS: readonly CandidateId[] = ["overall", "instant", "relax", "same"];

/** 未知数を一つ持つ候補が、どの値を動かすか */
export type ParamKey = keyof MaterialParams;

export interface CandidateInfo {
  readonly id: CandidateId;
  readonly label: string;
  /** 動かす値（same は持たない） */
  readonly param?: ParamKey;
  /** 公開するパラメータ範囲 */
  readonly range?: readonly [number, number];
}

export const CANDIDATES: Readonly<Record<CandidateId, CandidateInfo>> = Object.freeze({
  overall: { id: "overall", label: "待ったあとも残るかたさが違う", param: "eInf", range: [0.1, 5] },
  instant: { id: "instant", label: "押した直後だけ増えるかたさが違う", param: "e1", range: [0, 10] },
  relax: { id: "relax", label: "増えたかたさが消えていくまでの時間が違う", param: "tau", range: [0.05, 20] },
  same: { id: "same", label: "違いはない" },
});

export function isPushSeconds(v: unknown): v is PushSeconds {
  return typeof v === "number" && (PUSH_SECONDS as readonly number[]).includes(v);
}

export function isRecordAt(v: unknown): v is RecordAt {
  return typeof v === "number" && (RECORD_AT as readonly number[]).includes(v);
}

export function isCandidateId(v: unknown): v is CandidateId {
  return typeof v === "string" && (CANDIDATE_IDS as readonly string[]).includes(v);
}
