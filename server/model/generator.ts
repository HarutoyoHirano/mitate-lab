// 観測生成器：隠れた原因と真の値を持つ唯一の場所。
// 秘密は private フィールドに閉じ込め、JSON化・文字列化しても中身が出ないようにする。
import { HIDDEN_CAUSES, type HiddenCauseId, type HiddenCauseSpec } from "../../scenarios/material1.js";
import { BASE, ERROR, isPushSeconds, isRecordAt, RECORD_AT, type MaterialParams, type ObservationSpec, type PushSeconds } from "./public.js";
import { forceAfterPush, forceDuringPush } from "./sls.js";
import { dentAfterRelease, RECOVERY_TIMES, SHAPE_ERROR, type RecoveryPoint } from "./recovery.js";
import { clampPeriod, STEP_ERROR, stepDents, type StepDents } from "./steps.js";

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

/** 曲線の一点（t は押し始めからの秒） */
export interface CurvePoint {
  readonly t: number;
  readonly force: number;
}

/** 押し終わってからの、画面に描く時刻（比較器に使う5時刻を含む） */
const HOLD_TIMES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12.5, 15, 17.5, 20] as const;

export class ObservationGenerator {
  readonly #rng: () => number;
  /** 形の記録用の乱数列（力の記録の乱数列を変えないよう別にする） */
  readonly #shapeRng: () => number;
  /** 走行テスト用の乱数列（力・形の記録の乱数列を変えないよう別にする） */
  readonly #stepRng: () => number;
  readonly #cause: HiddenCauseSpec | null;
  readonly #truth: MaterialParams;
  readonly #seed: number;

  constructor(opts: GeneratorOptions) {
    this.#seed = opts.seed;
    this.#rng = createRng(opts.seed);
    this.#shapeRng = createRng((opts.seed ^ 0x5eed5) >>> 0);
    this.#stepRng = createRng((opts.seed ^ 0x57e95) >>> 0);
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

  /** 保持の後に離し、形の戻り（へこみ）を 0〜40 秒、0.5 秒ごとに記録する（各点に独立な有界一様誤差 ±SHAPE_ERROR） */
  observeRecovery(material: "A" | "B", pushSeconds: PushSeconds): RecoveryPoint[] {
    if (!isPushSeconds(pushSeconds)) throw new Error("許可されていない押し方");
    const p = material === "A" ? BASE : this.#truth;
    return RECOVERY_TIMES.map((h) => ({ h, dent: dentAfterRelease(p, pushSeconds, h) + (2 * this.#shapeRng() - 1) * SHAPE_ERROR }));
  }

  /** 走行テスト：Bを一歩ずつ踏んだときの、各歩4点のへこみ（各点に独立な誤差 ±0.01）。比較器の証拠には使わない */
  observeRun(period: number): StepDents[] {
    if (!Number.isFinite(period)) throw new Error("テンポが正しくない");
    const e = () => (2 * this.#stepRng() - 1) * STEP_ERROR;
    return stepDents(this.#truth, clampPeriod(period)).map((d) => ({ land: d.land + e(), peak: d.peak + e(), lift: d.lift + e(), pre: d.pre + e() }));
  }

  /** 一回押して、選んだ時刻の一点を記録する（有界一様誤差つき） */
  observe(material: "A" | "B", spec: ObservationSpec): MeasuredPoint {
    if (!isPushSeconds(spec.pushSeconds) || !isRecordAt(spec.recordAt)) throw new Error("許可されていない観察");
    const p = material === "A" ? BASE : this.#truth;
    const noise = (2 * this.#rng() - 1) * ERROR;
    return { material, pushSeconds: spec.pushSeconds, recordAt: spec.recordAt, force: forceAfterPush(p, spec.pushSeconds, spec.recordAt) + noise };
  }

  /**
   * 一回押して、押している間と押し終わってから20秒後までの押し返しを測る（各点に独立な誤差）。
   * evidence は比較器に使う5時刻（押し終わり・0.5・2・5・20秒後）。display は画面に描く細かい点（evidence と同じ値を含む）
   */
  observeCurve(material: "A" | "B", pushSeconds: PushSeconds): { display: CurvePoint[]; evidence: MeasuredPoint[] } {
    if (!isPushSeconds(pushSeconds)) throw new Error("許可されていない押し方");
    const p = material === "A" ? BASE : this.#truth;
    const noise = () => (2 * this.#rng() - 1) * ERROR;
    const display: CurvePoint[] = [];
    for (let k = 1; k < 10; k++) {
      const t = (pushSeconds * k) / 10;
      display.push({ t, force: forceDuringPush(p, pushSeconds, t) + noise() });
    }
    const evidence: MeasuredPoint[] = [];
    for (const h of HOLD_TIMES) {
      const force = forceAfterPush(p, pushSeconds, h) + noise();
      display.push({ t: pushSeconds + h, force });
      if (isRecordAt(h)) evidence.push({ material, pushSeconds, recordAt: h, force });
    }
    return { display, evidence };
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
