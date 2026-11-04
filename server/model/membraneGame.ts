// ゲーム版 事件3「膜の盲点」：受け身の膜（膜＝コンデンサ、イオンの通り道＝抵抗、イオンの濃さの差＝電池）。
// 電流を一定時間流して止め、膜電位を見る。誤差は付けない計算例。時間はミリ秒、電位はミリボルト。
// 膜Bは隠れた答えではない固定例（画面に正体を出してよい）。

export interface Membrane {
  /** イオンの通りやすさ（基準膜Aに対する倍率）。通りやすい＝抵抗が小さい */
  readonly g: number;
  /** 膜の容量（電位を同じだけ上げるのに要る電荷の量。基準膜Aに対する倍率） */
  readonly c: number;
}

export const BASE_MEM: Membrane = Object.freeze({ g: 1, c: 1 });
/** 見破れの膜B：容量が 2.2 倍（通りやすさは同じ） */
export const CASE3_B: Membrane = Object.freeze({ g: 1, c: 2.2 });

export const REST_MV = -70;
/** 基準膜Aに流し続けたときの上がり幅（ミリボルト） */
export const RISE_MV = 10;
/** 基準膜Aの時定数（ミリ秒） */
export const TAU_A_MS = 10;
/** 電流を流す時間（ミリ秒） */
export const PULSE_MS = 100;
/** 記録の長さ（ミリ秒） */
export const RECORD_MS = 200;

export const ROBOT_STEADY_TOL = 0.5; // mV
export const SEE_DIFF = 1; // mV：写真で「違いが見えた」とする幅
export const HIDDEN_AFTER_MS = 5;
export const HIDDEN1_NEED = 1.5; // mV
export const HALF_TIME_TOL = 0.7; // ms
export const HIDDEN2_NEED = 2; // mV

export const MEM_SLIDERS = {
  g: { min: 0.4, max: 2.5, step: 0.05, label: "イオンの通りやすさ" },
  c: { min: 0.4, max: 2.5, step: 0.05, label: "電気のためやすさ" },
} as const;

export function tauMs(m: Membrane): number {
  return (TAU_A_MS * m.c) / m.g;
}

export function riseInfMv(m: Membrane): number {
  return RISE_MV / m.g;
}

/** 基準の電位からの差（ミリボルト）。t は流し始めからのミリ秒 */
export function deltaMv(m: Membrane, t: number, pulse = PULSE_MS): number {
  const tau = tauMs(m);
  const inf = riseInfMv(m);
  if (t <= 0) return 0;
  if (t <= pulse) return inf * (1 - Math.exp(-t / tau));
  return inf * (1 - Math.exp(-pulse / tau)) * Math.exp(-(t - pulse) / tau);
}

export function potentialMv(m: Membrane, t: number): number {
  return REST_MV + deltaMv(m, t);
}

/** 止めてから、止めた時の差が半分に戻るまでの時間（ミリ秒） */
export function halfTimeMs(m: Membrane): number {
  return tauMs(m) * Math.LN2;
}

/** 止める直前（長く流した後）の電位の差 B−A */
export function steadyDiff(m: Membrane): number {
  return deltaMv(m, PULSE_MS) - deltaMv(BASE_MEM, PULSE_MS);
}

export function diffAt(m: Membrane, t: number): number {
  return deltaMv(m, t) - deltaMv(BASE_MEM, t);
}

export interface MemRound {
  readonly id: 1 | 2;
  readonly robotLine: string;
  readonly robotLabel: string;
  readonly hiddenLabel: string;
}

export const MEM_ROUNDS: readonly MemRound[] = [
  { id: 1, robotLine: "私は「長く流した後（止める直前）」の膜の電圧を見ます。すり抜けられますか？", robotLabel: "止める直前の膜の電圧", hiddenLabel: `止めて${HIDDEN_AFTER_MS}ミリ秒後の膜の電圧` },
  { id: 2, robotLine: "測り方を変えます。今度は「止めた時の、−70 mV から上がった高さが、半分になるまでの時間」を見ます。", robotLabel: "止めた時の上がった高さが半分に戻るまでの時間", hiddenLabel: "止める直前の膜の電圧" },
];

export interface MemDuelResult {
  readonly robot: { a: number; b: number; diff: number; ok: boolean; unit: "mV" | "ms" };
  readonly hidden: { a: number; b: number; diff: number; ok: boolean; unit: "mV" };
  readonly cleared: boolean;
}

export function judgeMemDuel(round: 1 | 2, m: Membrane): MemDuelResult {
  const stopA = deltaMv(BASE_MEM, PULSE_MS);
  const stopB = deltaMv(m, PULSE_MS);
  if (round === 1) {
    const t = PULSE_MS + HIDDEN_AFTER_MS;
    const ha = deltaMv(BASE_MEM, t);
    const hb = deltaMv(m, t);
    const robot = { a: REST_MV + stopA, b: REST_MV + stopB, diff: stopB - stopA, ok: Math.abs(stopB - stopA) <= ROBOT_STEADY_TOL + 1e-12, unit: "mV" as const };
    const hidden = { a: REST_MV + ha, b: REST_MV + hb, diff: hb - ha, ok: Math.abs(hb - ha) >= HIDDEN1_NEED - 1e-12, unit: "mV" as const };
    return { robot, hidden, cleared: robot.ok && hidden.ok };
  }
  const htA = halfTimeMs(BASE_MEM);
  const htB = halfTimeMs(m);
  const robot = { a: htA, b: htB, diff: htB - htA, ok: Math.abs(htB - htA) <= HALF_TIME_TOL + 1e-12, unit: "ms" as const };
  const hidden = { a: REST_MV + stopA, b: REST_MV + stopB, diff: stopB - stopA, ok: Math.abs(stopB - stopA) >= HIDDEN2_NEED - 1e-12, unit: "mV" as const };
  return { robot, hidden, cleared: robot.ok && hidden.ok };
}
