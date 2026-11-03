// 観測生成器：隠れた原因と真の値を持つ唯一の場所。
// 秘密は private フィールドに閉じ込め、JSON化・文字列化しても中身が出ないようにする。
import { HIDDEN_CAUSES, type HiddenCauseId, type HiddenCauseSpec } from "../../scenarios/material1.js";
import { BASE, ERROR, isPushSeconds, isRecordAt, RECORD_AT, type MaterialParams, type ObservationSpec, type PushSeconds } from "./public.js";
import { forceAfterPush } from "./sls.js";

/** 再現できる乱数（mulberry32） */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratorOptions {
  readonly seed: number;
  /** 先生モード：原因を指定する */
  readonly cause?: HiddenCauseId;
  /** 先生モード・テスト用：真の値を指定する（指定した原因の範囲内であること） */
  readonly value?: number;
  /** テスト用：真の値を直接指定する（Aと複数違う素材など、課題の範囲外の検証に使う） */
  readonly overrideParams?: MaterialParams;
}

export interface MeasuredPoint extends ObservationSpec {
  readonly material: "A" | "B";
  readonly force: number;
}

const SECRET = "[秘密]";

export class ObservationGenerator {
  readonly #rng: () => number;
  readonly #cause: HiddenCauseSpec | null;
  readonly #truth: MaterialParams;
  readonly #seed: number;

  constructor(opts: GeneratorOptions) {
    this.#seed = opts.seed;
    this.#rng = createRng(opts.seed);
    if (opts.overrideParams) {
      this.#cause = null;
      this.#truth = { ...opts.overrideParams };
      return;
    }
    const cause = opts.cause
      ? HIDDEN_CAUSES.find((c) => c.id === opts.cause)
      : HIDDEN_CAUSES[Math.floor(this.#rng() * HIDDEN_CAUSES.length)];
    if (!cause) throw new Error("指定された原因がない");
    const [lo, hi] = cause.range;
    const value = opts.value ?? lo + (hi - lo) * this.#rng();
    if (value < lo || value > hi) throw new Error("真の値が原因の範囲外");
    this.#cause = cause;
    this.#truth = { ...BASE, [cause.param]: value };
  }

  /** 一回押して、選んだ時刻の一点を記録する（有界一様誤差つき） */
  observe(material: "A" | "B", spec: ObservationSpec): MeasuredPoint {
    if (!isPushSeconds(spec.pushSeconds) || !isRecordAt(spec.recordAt)) throw new Error("許可されていない観察");
    const p = material === "A" ? BASE : this.#truth;
    const noise = (2 * this.#rng() - 1) * ERROR;
    return { material, pushSeconds: spec.pushSeconds, recordAt: spec.recordAt, force: forceAfterPush(p, spec.pushSeconds, spec.recordAt) + noise };
  }

  /** 先生モード・解説用：5時刻まとめて記録する */
  observeAllTimes(material: "A" | "B", pushSeconds: PushSeconds): MeasuredPoint[] {
    return RECORD_AT.map((recordAt) => this.observe(material, { pushSeconds, recordAt }));
  }

  /** 終了後の解説でだけ使う（秘密を開示する唯一の出口） */
  revealForDebrief(): { causeId: HiddenCauseId | null; explanation: string; truth: MaterialParams; seed: number } {
    return {
      causeId: this.#cause?.id ?? null,
      explanation: this.#cause?.explanation ?? "課題の範囲外の素材（検証用）",
      truth: { ...this.#truth },
      seed: this.#seed,
    };
  }

  toJSON(): string {
    return SECRET;
  }

  toString(): string {
    return SECRET;
  }
}
