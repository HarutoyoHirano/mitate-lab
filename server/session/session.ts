// セッション：一人の学生の探究の記録。秘密（観測生成器）を持つが、外に出すのは publicView() だけ。
import { compare, OVERALL_LABELS, STATUS_LABELS, type ComparisonResult, type Evidence } from "../model/comparator.js";
import { ObservationGenerator, type CurvePoint } from "../model/generator.js";
import { plan, planBySpeed, type PlanAdvice, type SpeedAdvice } from "../model/planner.js";
import {
  BASE,
  CANDIDATE_IDS,
  CANDIDATES,
  ERROR,
  INTRO_OBSERVATION,
  TEST_TOLERANCE,
  isCandidateId,
  isPushSeconds,
  judgeAgainstBase,
  isRecordAt,
  type CandidateId,
  type ObservationSpec,
  type PushSeconds,
} from "../model/public.js";
import { forceAfterPush } from "../model/sls.js";
import type { HiddenCauseId } from "../../scenarios/material1.js";
import { templateHint, type Hint } from "./hints.js";

/** 学生の予想：同じ押し方・時刻で、BはAと比べてどうなるか（「まだ分からない」も選べる） */
export type PredictionChoice = "higher" | "same" | "lower" | "unknown";
export const PREDICTION_CHOICES: readonly PredictionChoice[] = ["same", "higher", "lower", "unknown"];
export const PREDICTION_LABELS: Readonly<Record<PredictionChoice, string>> = {
  higher: "Aより大きい",
  same: "Aと同じくらい",
  lower: "Aより小さい",
  unknown: "まだ分からない",
};

/** 測った値と基準値の差を、予想と同じ言葉にする（許容差以内なら same） */
export function directionOf(measured: number, base: number): Exclude<PredictionChoice, "unknown"> {
  const { diff, indistinguishable } = judgeAgainstBase(measured, base);
  return indistinguishable ? "same" : diff > 0 ? "higher" : "lower";
}

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

/** 曲線の予想：Bの曲線はAと比べて */
export interface CurvePrediction {
  readonly pushSeconds: PushSeconds;
  readonly choice: PredictionChoice;
  readonly reason: string;
}

/** 一回押して測った曲線（Aも並べて測る。比較器の証拠はBの5時刻だけ） */
export interface CurveRecord {
  readonly id: string;
  readonly pushSeconds: PushSeconds;
  readonly a: readonly CurvePoint[];
  readonly b: readonly CurvePoint[];
  readonly prediction: CurvePrediction | null;
  readonly excluded: readonly CandidateId[];
  readonly evidenceIds: readonly string[];
  /** 押し終わり（h=0）の測定値と基準Aの差から決めた向き。予想の正誤はこれと比べる */
  readonly endDirection: Exclude<PredictionChoice, "unknown">;
  /** 予想が当たったか（「まだ分からない」や予想なしは null） */
  readonly predictionHit: boolean | null;
  /** 本人が「この曲線で合わなくなった」と選んだ説明（"unsure"＝分からない、null＝まだ選んでいない） */
  readonly studentPick: readonly CandidateId[] | "unsure" | null;
}

/** いつもの検査の結果（Bだけを測り、基準カードの値と比べる） */
export interface IntroResult {
  readonly force: number;
  readonly base: number;
  readonly diff: number;
  readonly tolerance: number;
  readonly indistinguishable: boolean;
}

export interface MeasuredA extends ObservationSpec {
  readonly id: string;
  readonly force: number;
}

/** 振り返り：記録から自動で埋まる「今回の発見」カードに、本人が一言ずつ足す */
export interface Reflection {
  readonly keyReason: string;
  readonly nextCheck: string;
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
  #pendingCurve: CurvePrediction | null = null;
  readonly #curves: CurveRecord[] = [];
  readonly #confirmed: CandidateId[] = [];
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
    // 導入観察：1秒で押して20秒後を、Bについて記録する（証拠に入れる）。Aは基準カードの値と比べる
    this.#recordB(INTRO_OBSERVATION, "intro-B", null);
  }

  get evidence(): readonly Evidence[] {
    return this.#records;
  }

  /** 予想を保存する（保存しないと観察できない） */
  savePrediction(spec: ObservationSpec, choice: PredictionChoice, reason = ""): void {
    this.#assertOpen();
    assertSpec(spec);
    if (!PREDICTION_CHOICES.includes(choice)) throw new SessionError("予想の選び方が正しくない");
    this.#pending = { pushSeconds: spec.pushSeconds, recordAt: spec.recordAt, choice, reason: reason.slice(0, 200) };
    if (this.#hintStage === 1) this.#hintStage = 2;
  }

  /** 曲線の予想を保存する（保存しないと押せない） */
  saveCurvePrediction(pushSeconds: PushSeconds, choice: PredictionChoice, reason = ""): void {
    this.#assertOpen();
    if (!isPushSeconds(pushSeconds)) throw new SessionError("許可されていない押し方です");
    if (!PREDICTION_CHOICES.includes(choice)) throw new SessionError("予想の選び方が正しくない");
    this.#pendingCurve = { pushSeconds, choice, reason: reason.slice(0, 200) };
    if (this.#hintStage === 1) this.#hintStage = 2;
  }

  /** Bを一回押して曲線を測る（Aも並べて測る）。証拠はBの5時刻。観察IDで二重実行を防ぐ */
  observeCurve(pushSeconds: PushSeconds, observationId: string): CurveRecord {
    this.#assertOpen();
    if (!isPushSeconds(pushSeconds)) throw new SessionError("許可されていない押し方です");
    if (!observationId || observationId.length > 100) throw new SessionError("観察IDが正しくない");
    const done = this.#curves.find((c) => c.id === observationId);
    if (done) return done;
    if (this.#usedObservationIds.has(observationId)) throw new SessionError("この観察IDは使用済み", 409);
    const p = this.#pendingCurve;
    if (!p || p.pushSeconds !== pushSeconds) throw new SessionError("先に、この押し方での予想を選んでください", 409);
    this.#pendingCurve = null;
    this.#usedObservationIds.add(observationId);
    const before = this.comparison();
    const b = this.#generator.observeCurve("B", pushSeconds);
    const a = this.#generator.observeCurve("A", pushSeconds);
    const ids: string[] = [];
    for (const m of b.evidence) {
      const id = `${observationId}@${m.recordAt}`;
      ids.push(id);
      this.#records.push({
        id,
        index: this.#records.length,
        pushSeconds: m.pushSeconds,
        recordAt: m.recordAt,
        force: m.force,
        prediction: null,
        excluded: [],
        baseForce: forceAfterPush(BASE, m.pushSeconds, m.recordAt),
      });
    }
    const after = this.comparison();
    const excluded = CANDIDATE_IDS.filter(
      (c) => before.candidates[c].status !== "inconsistent" && after.candidates[c].status === "inconsistent",
    );
    const end = b.evidence.find((m) => m.recordAt === 0)!;
    const endDirection = directionOf(end.force, forceAfterPush(BASE, pushSeconds, 0));
    const rec: CurveRecord = {
      id: observationId,
      pushSeconds,
      a: a.display,
      b: b.display,
      prediction: p,
      excluded,
      evidenceIds: ids,
      endDirection,
      predictionHit: p.choice === "unknown" ? null : p.choice === endDirection,
      studentPick: null,
    };
    this.#curves.push(rec);
    this.#hintStage = 1;
    return rec;
  }

  /** 本人が「この曲線で合わなくなった説明」を選ぶ（比較器の結果を開く前の、自分の判断） */
  pickExcluded(curveId: string, pick: readonly CandidateId[] | "unsure"): CurveRecord {
    this.#assertOpen();
    const i = this.#curves.findIndex((c) => c.id === curveId);
    if (i < 0) throw new SessionError("その曲線は見つかりません", 404);
    if (pick !== "unsure" && (!Array.isArray(pick) || !pick.every(isCandidateId))) throw new SessionError("説明の選び方が正しくない");
    const rec = { ...this.#curves[i]!, studentPick: pick === "unsure" ? "unsure" : [...new Set(pick)] } as CurveRecord;
    this.#curves[i] = rec;
    return rec;
  }

  /** 本人が確認した候補（言葉→候補の翻訳を確かめたもの）。Claudeへの入力に含める */
  confirmCandidate(id: CandidateId): void {
    this.#assertOpen();
    if (!isCandidateId(id)) throw new SessionError("候補が正しくない");
    if (!this.#confirmed.includes(id)) this.#confirmed.push(id);
  }

  /** いつもの検査の判定：Bの測定値を基準カードの値と比べる（許容差は測定誤差とは別） */
  introResult(): IntroResult {
    const r = this.#records.find((x) => x.id === "intro-B")!;
    const base = forceAfterPush(BASE, INTRO_OBSERVATION.pushSeconds, INTRO_OBSERVATION.recordAt);
    const j = judgeAgainstBase(r.force, base);
    return { force: r.force, base, diff: j.diff, tolerance: TEST_TOLERANCE, indistinguishable: j.indistinguishable };
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

  /** 本人が最新の曲線について「合わなくなった説明」をまだ選んでいない（判断待ち） */
  get awaitingPick(): boolean {
    const c = this.#curves[this.#curves.length - 1];
    return !!c && c.studentPick === null;
  }

  /** 手がかり・Claudeに渡す判定。判断待ちの間は、その曲線を押す前の判定だけ（テスト20） */
  guidanceComparison(): ComparisonResult {
    if (!this.awaitingPick) return this.comparison();
    const hide = new Set(this.#curves[this.#curves.length - 1]!.evidenceIds);
    return compare(this.#records.filter((r) => !hide.has(r.id)));
  }

  /** 定型ヒント（Claudeが使えないときも同じ段階で進む） */
  nextTemplateHint(): Hint {
    if (this.#hintsUsed >= this.#maxHints) throw new SessionError("このセッションのヒントの上限に達しました", 429);
    this.#hintsUsed++;
    const hasPrediction = this.#pending !== null || this.#pendingCurve !== null;
    const g = this.guidanceComparison();
    const hint = templateHint(this.#hintStage, hasPrediction, g, planBySpeed(this.#records.filter((r) => !this.#hiddenIds().has(r.id)), g), this.awaitingPick);
    if (this.#hintStage < 4 && hasPrediction) this.#hintStage = (this.#hintStage + 1) as 2 | 3 | 4;
    return hint;
  }

  #hiddenIds(): Set<string> {
    return this.awaitingPick ? new Set(this.#curves[this.#curves.length - 1]!.evidenceIds) : new Set();
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

  planBySpeed(): SpeedAdvice[] {
    return planBySpeed(this.#records, this.comparison());
  }

  saveReflection(r: Reflection): void {
    const clip = (s: unknown) => String(s ?? "").slice(0, 400);
    this.#reflection = {
      keyReason: clip(r?.keyReason),
      nextCheck: clip(r?.nextCheck),
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
      observationCount: this.#curves.length + this.#records.filter((r) => !r.id.includes("@")).length - 1,
      keyObservations: this.#records.filter((r) => r.excluded.length > 0).map((r) => ({ id: r.id, excluded: r.excluded })),
      keyCurves: this.#curves.filter((c) => c.excluded.length > 0).map((c) => ({ id: c.id, pushSeconds: c.pushSeconds, excluded: c.excluded })),
    };
  }

  /** 画面・API応答・Claude入力の元になる公開ビュー（公開型と証拠型だけ） */
  publicView(opts: { forGuidance?: boolean } = {}): PublicSessionView {
    const guide = !!opts.forGuidance && this.awaitingPick;
    const hidden = guide ? this.#hiddenIds() : new Set<string>();
    const visibleRecords = this.#records.filter((r) => !hidden.has(r.id));
    const comparison = guide ? compare(visibleRecords) : this.comparison();
    const advice = plan(visibleRecords, comparison);
    const bySpeed = planBySpeed(visibleRecords, comparison);
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
      intro: this.introResult(),
      confirmedCandidates: [...this.#confirmed],
      pendingPrediction: this.#pending,
      pendingCurve: this.#pendingCurve,
      // 判断待ちの曲線は、手がかり・Claude向けには比較器の結果を伏せる（測った値そのものは見せてよい）
      curves: this.#curves.map((c, i) => (guide && i === this.#curves.length - 1 ? { ...c, excluded: [] } : { ...c })),
      awaitingPick: this.awaitingPick,
      observationCount: this.#curves.length + this.#records.filter((r) => !r.id.includes("@")).length - 1,
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
      planBySpeed: (this.#hintStage >= 3 || this.teacherMode ? bySpeed : []).map((a) => ({
        pushSeconds: a.pushSeconds,
        decisivePairs: a.decisivePairs.map((p) => [...p]),
        separatingPairs: a.separatingPairs.map((p) => [...p]),
      })),
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
  readonly keyCurves: readonly { id: string; pushSeconds: number; excluded: readonly CandidateId[] }[];
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
  readonly intro: IntroResult;
  readonly confirmedCandidates: readonly CandidateId[];
  readonly pendingPrediction: SavedPrediction | null;
  readonly pendingCurve: CurvePrediction | null;
  readonly curves: readonly CurveRecord[];
  /** 本人が最新の曲線について判断する前か */
  readonly awaitingPick: boolean;
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
  readonly planBySpeed: readonly { pushSeconds: number; decisivePairs: CandidateId[][]; separatingPairs: CandidateId[][] }[];
  readonly predictionBands: readonly { id: CandidateId; low: number; high: number }[];
  readonly reflection: Reflection | null;
}
