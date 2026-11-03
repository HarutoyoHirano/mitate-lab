// 第2幕：同じ形の式を電気回路で書く（力↔電圧の対応）と、細胞の膜の等価回路。
// 素材の場合は式の形が同じだけ（数式上の対応）。細胞の膜では電気の現象が実際に起きていて、
// その性質を等価回路で表す。表示する値は計算値（誤差を付けない）。
import type { MaterialParams } from "./public.js";

/** 力学の値を回路の部品に対応づける：E∞→C∞=1/E∞、E1→C1=1/E1、ねばり η=E1·τ→R */
export interface MechanicalCircuit {
  readonly cInf: number;
  readonly c1: number;
  readonly r: number;
}

export function toCircuit(p: MaterialParams): MechanicalCircuit {
  return { cInf: 1 / p.eInf, c1: 1 / p.e1, r: p.e1 * p.tau };
}

/**
 * C∞ と「C1 と R の並列」を直列につないだ回路に、一定の電流 I を T 秒流して止め、
 * 止めてから h 秒後の電圧。I は押す速さ、電荷は変形に対応する。
 */
export function circuitVoltageAfterStop(c: MechanicalCircuit, current: number, seconds: number, h: number): number {
  const charge = current * seconds;
  const tau = c.r * c.c1;
  const parallel = current * c.r * (1 - Math.exp(-seconds / tau)) * Math.exp(-h / tau);
  return charge / c.cInf + parallel;
}

/** 受け身の膜の等価回路（コンデンサ＝膜、抵抗＝イオンの通りにくさ、電池＝基準の電位） */
export interface MembraneCircuit {
  readonly capacitance: number;
  readonly resistance: number;
  /** 基準の電位（イオンの濃さの差がつくる）。ゼロである必要はない */
  readonly restPotential: number;
}

export type Permeability = "easier" | "same" | "harder";
/** 思考実験：通り道がマイナスの抵抗のように働く（外からエネルギーを入れる仕組みがあるときだけ起きる） */
export type ThoughtPermeability = Permeability | "negative";

/** イオンの通りやすさ：通りやすい＝抵抗が小さい */
export const PERMEABILITY_FACTOR: Readonly<Record<ThoughtPermeability, number>> = Object.freeze({
  easier: 0.5,
  same: 1,
  harder: 2,
  negative: -1,
});

export const BASE_MEMBRANE: MembraneCircuit = Object.freeze({ capacitance: 1, resistance: 1, restPotential: -1 });

export function withPermeability(m: MembraneCircuit, perm: ThoughtPermeability): MembraneCircuit {
  return { ...m, resistance: m.resistance * PERMEABILITY_FACTOR[perm] };
}

/** 電流を T 秒入れて止めた時の、基準からの差 */
export function membraneDeltaAtStop(m: MembraneCircuit, current: number, seconds: number): number {
  const tau = m.resistance * m.capacitance;
  return current * m.resistance * (1 - Math.exp(-seconds / tau));
}

/** 止めてから h 秒後の電位（実際の電位） */
export function membranePotentialAfterStop(m: MembraneCircuit, current: number, seconds: number, h: number): number {
  const tau = m.resistance * m.capacitance;
  return m.restPotential + membraneDeltaAtStop(m, current, seconds) * Math.exp(-h / tau);
}

/** 止めた時の基準からの差で割った値（割った表示であることを画面に明記する） */
export function membraneNormalizedAfterStop(m: MembraneCircuit, h: number): number {
  return Math.exp(-h / (m.resistance * m.capacitance));
}

/** 止めた時の差の半分に戻るまでの時間（抵抗がマイナスなら戻らないので null） */
export function membraneHalfReturnTime(m: MembraneCircuit): number | null {
  if (m.resistance <= 0) return null;
  return m.resistance * m.capacitance * Math.LN2;
}
