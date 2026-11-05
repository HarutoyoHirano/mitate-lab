// ゲーム版 謎1の走行テスト：膝のクッションを一歩ずつ踏む（力を指定した標準線形固体）。
// 一歩：体重にあたる力 F を着地で一気にかけ、接地時間 P/2 保ち、足を上げて力を 0 にし、残り P/2 待つ（慣性は無視）。
// 力が ΔF 跳ぶと σ1 は E1·ΔF/(E∞+E1) 跳ぶ。力が一定の間は σ1 が時定数 τc＝τ(E∞+E1)/E∞ で減る。へこみ x＝(F−σ1)/E∞。
import type { MaterialParams } from "./public.js";

export const STEP_FORCE = 1;
export const STEP_COUNT = 12;
export const DUTY = 0.5;
export const STEP_ERROR = 0.01;
export const STEP_TOLERANCE = 0.03;
/** 謎1のイメージムービー（導入の物語）で、見本の軟骨を歩かせ・走らせる二つのテンポ */
export const MOVIE_WALK = 3;
export const MOVIE_RUN = 0.75;

export type TempoId = "slowWalk" | "walk" | "jog" | "sprint";
export const TEMPOS: readonly { id: TempoId; label: string; period: number }[] = [
  { id: "slowWalk", label: "ゆっくり歩く", period: 6 },
  { id: "walk", label: "歩く", period: 3 },
  { id: "jog", label: "ジョグ", period: 1.5 },
  { id: "sprint", label: "全力", period: 0.75 },
];
export const PERIOD_MIN = 0.6;
export const PERIOD_MAX = 6;
/** 叩いた間隔（秒）から一歩の周期（モデルの秒）へ */
export const TAP_TO_PERIOD = 2.5;

export function clampPeriod(p: number): number {
  return Math.min(PERIOD_MAX, Math.max(PERIOD_MIN, p));
}

export type StepPhase = "land" | "peak" | "lift" | "pre";
export const STEP_PHASES: readonly StepPhase[] = ["land", "peak", "lift", "pre"];
/** 新しい画面（1c）の謎1の走行テスト：テンポは「走る」だけ、最初の4歩を見せる（CLAUDE.md 1c・第3章） */
export const PLAY_RUN_PERIOD = 1.5;
export const PLAY_RUN_STEPS = 4;
export const PHASE_LABEL: Record<StepPhase, string> = { land: "着地した直後", peak: "足を上げる直前", lift: "足を上げた直後", pre: "次の着地の直前" };

export interface StepDents {
  readonly land: number;
  readonly peak: number;
  readonly lift: number;
  readonly pre: number;
}

/** 一歩ごとのへこみ（深さの単位は、力 1 を長くかけたときのへこみ＝1/E∞ を基準にした値。A では 1） */
export function stepDents(p: MaterialParams, period: number, n = STEP_COUNT, force = STEP_FORCE): StepDents[] {
  const tc = period * DUTY;
  const tf = period - tc;
  const tauC = (p.tau * (p.eInf + p.e1)) / p.eInf;
  const jump = (dF: number) => (p.e1 * dF) / (p.eInf + p.e1);
  let s = 0;
  const out: StepDents[] = [];
  for (let k = 0; k < n; k++) {
    s += jump(force);
    const land = (force - s) / p.eInf;
    s *= Math.exp(-tc / tauC);
    const peak = (force - s) / p.eInf;
    s += jump(-force);
    const lift = -s / p.eInf;
    s *= Math.exp(-tf / tauC);
    const pre = -s / p.eInf;
    out.push({ land, peak, lift, pre });
  }
  return out;
}

/** 一歩の中のへこみ（表示用。u は一歩の中の位置 0〜1）。A の描画に使う */
export function dentWithinStep(p: MaterialParams, period: number, steps: readonly StepDents[], k: number, u: number): number {
  const d = steps[k]!;
  const tauC = (p.tau * (p.eInf + p.e1)) / p.eInf;
  const tc = period * DUTY;
  const t = u * period;
  if (t <= tc) {
    // 接地中：x = (F − s)/E∞、s は land の時点から指数で減る
    const s0 = STEP_FORCE - d.land * p.eInf;
    return (STEP_FORCE - s0 * Math.exp(-t / tauC)) / p.eInf;
  }
  const s1 = -d.lift * p.eInf;
  return -(s1 * Math.exp(-(t - tc) / tauC)) / p.eInf;
}

export interface RunStep extends StepDents {
  readonly k: number;
}
