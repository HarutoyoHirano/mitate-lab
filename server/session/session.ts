// セッション：一人の学生の探究の記録。秘密（観測生成器）を持つが、外に出すのは publicView() だけ。
import { compare, OVERALL_LABELS, STATUS_LABELS, type ComparisonResult, type Evidence } from "../model/comparator.js";
import { ObservationGenerator } from "../model/generator.js";
import { plan, type PlanAdvice } from "../model/planner.js";
import {
  BASE,
  CANDIDATE_IDS,
  CANDIDATES,
  ERROR,
  INTRO_OBSERVATION,
  isPushSeconds,
  isRecordAt,
  type CandidateId,
  type ObservationSpec,
} from "../model/public.js";
import { forceAfterPush } from "../model/sls.js";
import type { HiddenCauseId } from "../../scenarios/material1.js";
import { templateHint, type Hint } from "./hints.js";

/** 学生の予想：同じ押し方・時刻で、BはAと比べてどうなるか */
export type PredictionChoice = "higher" | "same" | "lower";
export const PREDICTION_LABELS: Readonly<Record<PredictionChoice, string>> = {
  higher: "Aより大きい",
  same: "Aと同じくらい",
  lower: "Aより小さい",
};

export interface SavedPrediction extends ObservationSpec {
  readonly choice: PredictionChoice;
  readonly reason: string;
}

export interface ObservationRecord extends Evidence {
  readonly index: number;
  readonly prediction: SavedPrediction | null;
  /** この観察で「整合しにくい」に変わった候補（決め手の記録） */
  readonly excluded: readonly CandidateId[];
  /** 同じ押し方・時刻の、基準素材Aの予測（公開の値） */
  readonly baseForce: number;
}

export interface MeasuredA extends ObservationSpec {
  readonly id: string;
  readonly force: number;
}

export interface Reflection {
  readonly firstGuess: string;
  readonly keyObservation: string;
  readonly notEnoughWithOne: string;
  readonly otherSubjectWords: string;
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface SessionOptions {
  readonly seed: number;
  readonly cause?: HiddenCauseId;
  readonly value?: number;
  readonly teacherMode?: boolean;
  readonly maxHints?: number;
}

export class Session {
  readonly id: string;
  readonly teacherMode: boolean;
  readonly #generator: ObservationGenerator;
  readonly #records: ObservationRecord[] = [];
  readonly #measuredA: MeasuredA[] = [];
  readonly #usedObservationIds = new Set<string>();
  #pending: SavedPrediction | null = null;
  #hintStage: 1 | 2 | 3 | 4 = 1;
  #hintsUsed = 0;
  readonly #maxHints: number;
  #finished = false;
  #reflection: Reflection | null = null;
  #studentWords: string[] = [];

  constructor(id: string, opts: SessionOptions) {
    this.id = id;
    this.teacherMode = !!opts.teacherMode;
    this.#maxHints = opts.maxHints ?? 10;
    this.#generator = new ObservationGenerator({ seed: opts.seed, cause: opts.cause, value: opts.value });
    // 導入観察：1秒で押して20秒後を、AとBの両方で記録する（Bは証拠に入れる）
    this.#measureA(INTRO_OBSERVATION, "intro-A");
    this.#recordB(INTRO_OBSERVATION, "intro-B", null);
  }

  get evidence(): readonly Evidence[] {
    return this.#records;
  }

  /** 予想を保存する（保存しないと観察できない） */
  savePrediction(spec: ObservationSpec, choice: PredictionChoice, reason = ""): void {
    this.#assertOpen();
    assertSpec(spec);
    if (!["higher", "same", "lower"].includes(choice)) throw new SessionError("予想の選び方が正しくない");
    this.#pending = { pushSeconds: spec.pushSeconds, recordAt: spec.recordAt, choice, reason: reason.slice(0, 200) };
    if (this.#hintStage === 1) this.#hintStage = 2;
  }

  /** Bを一回押して、選んだ時刻の一点を記録する。観察IDで二重実行を防ぐ */
  observe(spec: ObservationSpec, observationId: string): ObservationRecord {
    this.#assertOpen();
    assertSpec(spec);
    if (!observationId || observationId.length > 100) throw new SessionError("観察IDが正しくない");
    const done = this.#records.find((r) => r.id === observationId);
    if (done) return done;
    if (this.#usedObservationIds.has(observationId)) throw new SessionError("この観察IDは使用済み", 409);
    const p = this.#pending;
    if (!p || p.pushSeconds !== spec.pushSeconds || p.recordAt !== spec.recordAt)
      throw new SessionError("先に、この押し方・時刻での予想を保存してください", 409);
    this.#pending = null;
    return this.#recordB(spec, observationId, p);
  }

  /** 基準素材Aを測る（表示用。比較器の証拠には使わない） */
  measureA(spec: ObservationSpec, measurementId: string): MeasuredA {
    this.#assertOpen();
    assertSpec(spec);
    const done = this.#measuredA.find((m) => m.id === measurementId);
    if (done) return done;
    return this.#measureA(spec, measurementId);
  }

  /** 定型ヒント（Claudeが使えないときも同じ段階で進む） */
  nextTemplateHint(): Hint {
    if (this.#hintsUsed >= this.#maxHints) throw new SessionError("このセッションのヒントの上限に達しました", 429);
    this.#hintsUsed++;
    const hint = templateHint(this.#hintStage, this.#pending !== null, this.comparison(), this.plan());
    if (this.#hintStage < 4 && this.#pending !== null) this.#hintStage = (this.#hintStage + 1) as 2 | 3 | 4;
    return hint;
  }

  get hintStage(): 1 | 2 | 3 | 4 {
    return this.#hintStage;
  }

  /** 学生の自由な説明（Claudeの翻訳に使う。公開・証拠型として扱う） */
  addStudentWords(text: string): void {
    const t = text.trim().slice(0, 200);
    if (t) this.#studentWords.push(t);
  }

  comparison(): ComparisonResult {
    return compare(this.#records);
  }

  plan(): PlanAdvice {
    return plan(this.#records, this.comparison());
  }

  saveReflection(r: Reflection): void {
    const clip = (s: unknown) => String(s ?? "").slice(0, 400);
    this.#reflection = {
      firstGuess: clip(r.firstGuess),
      keyObservation: clip(r.keyObservation),
      notEnoughWithOne: clip(r.notEnoughWithOne),
      otherSubjectWords: clip(r.otherSubjectWords),
    };
  }

  /** 終了して解説を開く（秘密を開示する唯一の出口） */
  finish(): Debrief {
    this.#finished = true;
    const s = this.#generator.revealForDebrief();
    return {
      explanation: s.explanation,
      truth: s.truth,
      base: BASE,
      observationCount: this.#records.length - 1,
      keyObservations: this.#records.filter((r) => r.excluded.length > 0).map((r) => ({ id: r.id, excluded: r.excluded })),
      allTimes: this.#generator.observeAllTimes("B", 1),
    };
  }

  /** 画面・API応答・Claude入力の元になる公開ビュー（公開型と証拠型だけ） */
  publicView(): PublicSessionView {
    const comparison = this.comparison();
    const advice = this.plan();
    return {
      sessionId: this.id,
      teacherMode: this.teacherMode,
      finished: this.#finished,
      error: ERROR,
      base: BASE,
      candidates: CANDIDATE_IDS.map((id) => ({
        id,
        label: CANDIDATES[id].label,
        status: comparison.candidates[id].status,
        statusLabel: STATUS_LABELS[comparison.candidates[id].status],
      })),
      overall: comparison.overall,
      overallLabel: OVERALL_LABELS[comparison.overall],
      narrowedTo: comparison.narrowedTo,
      records: this.#records.map((r) => ({ ...r })),
      measuredA: this.#measuredA.map((m) => ({ ...m })),
      pendingPrediction: this.#pending,
      observationCount: this.#records.length - 1,
      hintStage: this.#hintStage,
      hintsLeft: this.#maxHints - this.#hintsUsed,
      studentWords: [...this.#studentWords],
      // 計画支援の結果は、ヒント3段階目以降（または先生モード）でだけ見せる
      plan: (this.#hintStage >= 3 || this.teacherMode ? advice.ranked.slice(0, 5) : []).map((a) => ({
        pushSeconds: a.spec.pushSeconds,
        recordAt: a.spec.recordAt,
        decisivePairs: a.decisivePairs.map((p) => [...p]),
        separatingPairs: a.separatingPairs.map((p) => [...p]),
      })),
      anySeparating: this.#hintStage >= 3 || this.teacherMode ? advice.anySeparating : null,
      predictionBands: this.#pending ? predictionBands(comparison, this.#pending) : [],
      reflection: this.#reflection,
    };
  }

  #recordB(spec: ObservationSpec, id: string, prediction: SavedPrediction | null): ObservationRecord {
    const before = this.#records.length ? this.comparison() : null;
    const m = this.#generator.observe("B", spec);
    this.#usedObservationIds.add(id);
    const draft = {
      id,
      index: this.#records.length,
      pushSeconds: m.pushSeconds,
      recordAt: m.recordAt,
      force: m.force,
      prediction,
      excluded: [] as CandidateId[],
      baseForce: forceAfterPush(BASE, spec.pushSeconds, spec.recordAt),
    };
    this.#records.push(draft);
    const after = this.comparison();
    if (before)
      draft.excluded = CANDIDATE_IDS.filter(
        (c) => before.candidates[c].status !== "inconsistent" && after.candidates[c].status === "inconsistent",
      );
    this.#hintStage = 1;
    return draft;
  }

  #measureA(spec: ObservationSpec, id: string): MeasuredA {
    const m = this.#generator.observe("A", spec);
    const rec = { id, pushSeconds: m.pushSeconds, recordAt: m.recordAt, force: m.force };
    this.#measuredA.push(rec);
    return rec;
  }

  #assertOpen(): void {
    if (this.#finished) throw new SessionError("この探究は終了しています", 409);
  }

  toJSON(): string {
    return "[セッション]";
  }
}

function assertSpec(spec: ObservationSpec): void {
  if (!spec || !isPushSeconds(spec.pushSeconds) || !isRecordAt(spec.recordAt))
    throw new SessionError("許可されていない押し方・記録時刻です");
}

/** 保存した予想の押し方・時刻について、残っている候補の予測の帯（区間の端から計算） */
function predictionBands(comparison: ComparisonResult, spec: ObservationSpec) {
  return CANDIDATE_IDS.flatMap((id) => {
    const c = comparison.candidates[id];
    if (c.status === "inconsistent") return [];
    const info = CANDIDATES[id];
    if (!info.param) {
      const v = forceAfterPush(BASE, spec.pushSeconds, spec.recordAt);
      return [{ id, low: v - ERROR, high: v + ERROR }];
    }
    const iv = c.interval ?? c.widenedInterval;
    if (!iv) return [];
    const f = (v: number) => forceAfterPush({ ...BASE, [info.param!]: v }, spec.pushSeconds, spec.recordAt);
    const a = f(iv[0]);
    const b = f(iv[1]);
    return [{ id, low: Math.min(a, b) - ERROR, high: Math.max(a, b) + ERROR }];
  });
}

export interface Debrief {
  readonly explanation: string;
  readonly truth: { eInf: number; e1: number; tau: number };
  readonly base: { eInf: number; e1: number; tau: number };
  readonly observationCount: number;
  readonly keyObservations: readonly { id: string; excluded: readonly CandidateId[] }[];
  readonly allTimes: readonly { pushSeconds: number; recordAt: number; force: number }[];
}

export interface PublicSessionView {
  readonly sessionId: string;
  readonly teacherMode: boolean;
  readonly finished: boolean;
  readonly error: number;
  readonly base: { eInf: number; e1: number; tau: number };
  readonly candidates: readonly { id: CandidateId; label: string; status: string; statusLabel: string }[];
  readonly overall: string;
  readonly overallLabel: string;
  readonly narrowedTo: CandidateId | null;
  readonly records: readonly ObservationRecord[];
  readonly measuredA: readonly MeasuredA[];
  readonly pendingPrediction: SavedPrediction | null;
  readonly observationCount: number;
  readonly hintStage: number;
  readonly hintsLeft: number;
  readonly studentWords: readonly string[];
  readonly plan: readonly {
    pushSeconds: number;
    recordAt: number;
    decisivePairs: CandidateId[][];
    separatingPairs: CandidateId[][];
  }[];
  readonly anySeparating: boolean | null;
  readonly predictionBands: readonly { id: CandidateId; low: number; high: number }[];
  readonly reflection: Reflection | null;
}
