// 事件3「拍動の盲点」：模擬循環回路（試験用の装置）につないだ人工血管の模型。
// 2要素ウィンドケッセル（教科書の模型）：C·dP/dt = Q(t) − P/R。
//   Q(t)：心臓ポンプが送り出す流れ（駆出期に半正弦、それ以外は0）＝電流源
//   C：血管のやわらかさ（圧が1上がるとき、ふくらんで受け止める血の量）＝コンデンサ
//   R：末梢の流れにくさ＝抵抗
// 細胞の膜（C·dV/dt = I − V/R）と同じ式。隠れた答えは持たない（血管Bは固定例）。誤差なしの計算。
// 値は模型の値で、体の値・病気の判定を表すものではない。

export interface Vessel {
  /** 末梢の流れにくさ（mmHg·s/mL） */
  readonly r: number;
  /** 血管のやわらかさ（mL/mmHg） */
  readonly c: number;
}

/** 一拍の周期（秒）、駆出の時間（秒）、一回に送り出す量（mL） */
export const BEAT_S = 0.8;
export const EJECT_S = 0.3;
export const STROKE_ML = 70;
/** 一拍を刻む細かさ */
export const BEAT_STEPS = 800;

export const BASE_VESSEL: Vessel = { r: 1, c: 1.5 };
/** 血管B：やわらかさが半分（固定例） */
export const CASE_VESSEL_B: Vessel = { r: 1, c: 0.75 };

/** ロボの検査：一拍の平均の圧。この差の大きさ以内なら「区別できない」 */
export const VESSEL_ROBOT_TOL = 2;
/** 写真：この差の大きさを超えたら「違いが見えた」 */
export const VESSEL_SEE_DIFF = 3;

export const VESSEL_SLIDERS = {
  r: { min: 0.5, max: 2, step: 0.05, label: "末梢の流れにくさ（抵抗 R）" },
  c: { min: 0.4, max: 3, step: 0.05, label: "血管のやわらかさ（コンデンサ C）" },
} as const;

const QMAX = (STROKE_ML * Math.PI) / (2 * EJECT_S);

/** 心臓ポンプの流れ（mL/s）。一拍の中の時刻 u（0〜BEAT_S） */
export function pumpFlow(u: number): number {
  const v = ((u % BEAT_S) + BEAT_S) % BEAT_S;
  return v < EJECT_S ? QMAX * Math.sin((Math.PI * v) / EJECT_S) : 0;
}

/** 平均の流れ（mL/s） */
export const MEAN_FLOW = STROKE_ML / BEAT_S;

function step(m: Vessel, p: number, u: number, dt: number): number {
  const f = (t: number, x: number) => (pumpFlow(t) - x / m.r) / m.c;
  const k1 = f(u, p);
  const k2 = f(u + dt / 2, p + (dt / 2) * k1);
  const k3 = f(u + dt / 2, p + (dt / 2) * k2);
  const k4 = f(u + dt, p + dt * k3);
  return p + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
}

/** 一拍ぶん進める（式は線形なので、P(一拍後) = a·P0 + b） */
function oneBeat(m: Vessel, p0: number, steps = BEAT_STEPS): number[] {
  const dt = BEAT_S / steps;
  const out = [p0];
  let p = p0;
  for (let i = 0; i < steps; i++) {
    p = step(m, p, i * dt, dt);
    out.push(p);
  }
  return out;
}

/**
 * 拍動が落ち着いた後の一拍の圧（mmHg、BEAT_STEPS+1 点）。
 * 一拍で P0 → a·P0 + b となるので、落ち着いた状態は P0 = b / (1 − a)、a = e^(−BEAT_S/(R·C))。
 */
export function steadyBeat(m: Vessel, steps = BEAT_STEPS): number[] {
  const b = oneBeat(m, 0, steps)[steps]!;
  const a = Math.exp(-BEAT_S / (m.r * m.c));
  return oneBeat(m, b / (1 - a), steps);
}

export interface BeatSummary {
  readonly max: number;
  readonly min: number;
  readonly mean: number;
  readonly pulse: number;
}

export function summarize(m: Vessel): BeatSummary {
  const ps = steadyBeat(m);
  const body = ps.slice(0, ps.length - 1);
  const mean = body.reduce((s, x) => s + x, 0) / body.length;
  const max = Math.max(...ps);
  const min = Math.min(...ps);
  return { max, min, mean, pulse: max - min };
}

/** 一拍の中の時刻 u（秒）の圧 */
export function pressureAt(m: Vessel, u: number): number {
  const ps = steadyBeat(m);
  const v = ((u % BEAT_S) + BEAT_S) % BEAT_S;
  const i = Math.round((v / BEAT_S) * (ps.length - 1));
  return ps[i]!;
}

/** 血管がふくらんで受け止めている血の量（落ち着いた最低の圧からの増え分、mL）＝ C × 圧の上がり分 */
export function storedVolume(m: Vessel, p: number, pMin: number): number {
  return m.c * (p - pMin);
}

// ---------- 対決（仕掛けろ） ----------
export const VESSEL_ROUNDS = [
  { id: 1 as const, robotLabel: "一拍の平均の圧", hiddenLabel: "脈の振れ幅（最高−最低）", robotLine: "平均の圧を測ります。平均が同じなら、同じ血管です。" },
  { id: 2 as const, robotLabel: "脈の振れ幅（最高−最低）", hiddenLabel: "一拍の平均の圧", robotLine: "規則を改訂しました。今度は脈の振れ幅を見ます。" },
];
export const VESSEL_HIDDEN_NEED = 8;

export interface VesselDuelResult {
  readonly robot: { a: number; b: number; diff: number; ok: boolean };
  readonly hidden: { a: number; b: number; diff: number; ok: boolean };
  readonly cleared: boolean;
}

export function judgeVesselDuel(round: 1 | 2, m: Vessel): VesselDuelResult {
  const A = summarize(BASE_VESSEL);
  const B = summarize(m);
  const meanD = { a: A.mean, b: B.mean, diff: B.mean - A.mean };
  const pulseD = { a: A.pulse, b: B.pulse, diff: B.pulse - A.pulse };
  const [r, h] = round === 1 ? [meanD, pulseD] : [pulseD, meanD];
  const robot = { ...r, ok: Math.abs(r.diff) <= VESSEL_ROBOT_TOL + 1e-9 };
  const hidden = { ...h, ok: Math.abs(h.diff) >= VESSEL_HIDDEN_NEED - 1e-9 };
  return { robot, hidden, cleared: robot.ok && hidden.ok };
}

// ---------- なぜ？（電気回路で同じ波をつくる） ----------
export interface SyncJudge {
  readonly meanOk: boolean;
  readonly pulseOk: boolean;
  readonly both: boolean;
  readonly target: BeatSummary;
  readonly mine: BeatSummary;
}

/** 回路（R と C）の電圧の波が、血管Bの圧の波に重なるか：平均と振れ幅がどちらも 2 以内 */
export function judgeSync(target: Vessel, mine: Vessel): SyncJudge {
  const t = summarize(target);
  const m = summarize(mine);
  const meanOk = Math.abs(m.mean - t.mean) <= VESSEL_ROBOT_TOL + 1e-9;
  const pulseOk = Math.abs(m.pulse - t.pulse) <= VESSEL_ROBOT_TOL + 1e-9;
  return { meanOk, pulseOk, both: meanOk && pulseOk, target: t, mine: m };
}
