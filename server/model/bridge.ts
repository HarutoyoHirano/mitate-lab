// ゲーム版「橋」：抵抗Rと容量C1のスライダーで回路をつくり、事件1のB（開示した値）の保持中の力に
// 回路の電圧を重ねる。高さと戻る速さの両方が合ったときだけ一本に重なる。誤差なしの計算。
import { circuitVoltageAfterStop, circuitVoltageDuringCharge, parallelVoltage, toCircuit, type MechanicalCircuit } from "./circuit.js";
import { DEPTH, type MaterialParams } from "./public.js";
import { forceAfterPush, forceDuringPush } from "./sls.js";

export const BRIDGE_SLIDERS = {
  r: { min: 0.1, max: 5, step: 0.02, label: "抵抗 R" },
  c1: { min: 0.3, max: 2.5, step: 0.02, label: "コンデンサ C1" },
} as const;
/** 押し終わってから描く長さ（秒） */
export const BRIDGE_HOLD = 20;
/** 一本に重なったとみなす差の最大 */
export const BRIDGE_TOL = 0.03;
/** 戻る速さが合ったとみなす、時定数の比のずれ */
export const SPEED_TOL = 0.05;

export function bridgeTimes(pushSeconds: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 40; i++) out.push((pushSeconds * i) / 40);
  for (let i = 1; i <= 200; i++) out.push(pushSeconds + (BRIDGE_HOLD * i) / 200);
  return out;
}

/** Bの押し返す力（押し始めから） */
export function materialForceAt(p: MaterialParams, pushSeconds: number, t: number): number {
  return t <= pushSeconds ? forceDuringPush(p, pushSeconds, t) : forceAfterPush(p, pushSeconds, t - pushSeconds);
}

/** 回路の電圧（一定の電流 D/T を T 秒流して止める） */
export function circuitAt(c: MechanicalCircuit, pushSeconds: number, t: number): number {
  const current = DEPTH / pushSeconds;
  return t <= pushSeconds ? circuitVoltageDuringCharge(c, current, t) : circuitVoltageAfterStop(c, current, pushSeconds, t - pushSeconds);
}

/** プレイヤーの回路：C∞ はBの値（1/E∞）に固定、R と C1 はスライダー */
export function playerCircuit(truth: MaterialParams, r: number, c1: number): MechanicalCircuit {
  return { cInf: 1 / truth.eInf, c1, r };
}

export interface BridgeJudge {
  readonly maxDiff: number;
  readonly overlap: boolean;
  readonly speedOk: boolean;
  readonly heightOk: boolean;
  /** プレイヤーの時定数 R·C1 とBの τ */
  readonly tauPlayer: number;
  readonly tauB: number;
  /** 押し終わりの並列部分の電圧と、Bの上乗せ分 */
  readonly heightPlayer: number;
  readonly heightB: number;
}

export function judgeBridge(truth: MaterialParams, pushSeconds: number, r: number, c1: number): BridgeJudge {
  const c = playerCircuit(truth, r, c1);
  let maxDiff = 0;
  for (const t of bridgeTimes(pushSeconds)) maxDiff = Math.max(maxDiff, Math.abs(circuitAt(c, pushSeconds, t) - materialForceAt(truth, pushSeconds, t)));
  const tauPlayer = r * c1;
  const tauB = truth.tau;
  const current = DEPTH / pushSeconds;
  const heightPlayer = parallelVoltage(c, current, pushSeconds, pushSeconds);
  const heightB = parallelVoltage(toCircuit(truth), current, pushSeconds, pushSeconds);
  return {
    maxDiff,
    overlap: maxDiff <= BRIDGE_TOL + 1e-12,
    speedOk: Math.abs(tauPlayer / tauB - 1) <= SPEED_TOL + 1e-12,
    heightOk: Math.abs(heightPlayer - heightB) <= BRIDGE_TOL + 1e-12,
    tauPlayer,
    tauB,
    heightPlayer,
    heightB,
  };
}
