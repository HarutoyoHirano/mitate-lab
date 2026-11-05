// 検査ロボを謎ごとに鍛えなおす（CLAUDE.md 1c-3）。ロボは決まったルールで動くので、規則を書きなおすのはプレイヤー。
// この関数が、書きなおした規則で見落としがふさがったかを確かめる（画面とテストで同じ関数）。
// 隠れた答えは持たない。軟骨のBは、謎1で正体を開けたあとに画面が受け取った値を引数で渡す。
import { BASE, type MaterialParams } from "./public.js";
import { PHASE_LABEL, STEP_ERROR, STEP_PHASES, STEP_TOLERANCE, stepDents, TEMPOS, type StepPhase } from "./steps.js";
import { DUEL_SLIDERS, duelMaterial, finalCheckDiff, HIDDEN_NEED, ROBOT_PASS } from "./duel.js";
import { BASE_VESSEL, BEAT_S, BEAT_STEPS, CASE_VESSEL_B, steadyBeat, summarize, VESSEL_HIDDEN_NEED, VESSEL_ROBOT_TOL, VESSEL_SLIDERS, type Vessel } from "./vessel.js";
import { BASE_MEM, CASE3_B, deltaMv, HIDDEN2_NEED, MEM_SLIDERS, PULSE_MS, RECORD_MS, ROBOT_STEADY_TOL, type Membrane } from "./membraneGame.js";

export type RetrainCase = "cartilage" | "vessel" | "membrane";
/** 最初の規則に足せる数字の数 */
export const RETRAIN_SLOTS = 2;

export interface RetrainPoint {
  readonly id: string;
  readonly label: string;
}

/** 格子の一つのます（つまみの値と、すり抜けるか） */
export interface RetrainCell {
  readonly x: number;
  readonly y: number;
  /** 最初の規則（いつもの検査）を通るか。通らない試作品は、はじめからロボに見分けられる */
  readonly first: boolean;
  /** 書きなおした規則をすべて通り、どこかで違いを残す（すり抜ける） */
  readonly slips: boolean;
}

export interface RetrainResult {
  /** 足した数字ごとの、AとBの差 */
  readonly bDiffs: readonly { id: string; label: string; a: number; b: number; diff: number; seen: boolean }[];
  readonly catchesB: boolean;
  readonly cells: readonly RetrainCell[];
  readonly slipCount: number;
  readonly cleared: boolean;
}

interface Design {
  readonly x: number;
  readonly y: number;
  readonly first: boolean;
  /** 足せる数字ごとの、見本との差 */
  readonly d: readonly number[];
  /** 違いが残るかを見る全点のうち、見本との差の最大 */
  readonly maxDiff: number;
}

interface CaseSpec {
  readonly points: readonly RetrainPoint[];
  readonly firstRule: string;
  /** ロボの「同じ」の幅（足した数字に使う） */
  readonly tol: number;
  /** Bを見分けたとみなす差（軟骨は測るたびのぶれを足す） */
  readonly seeB: number;
  /** すり抜けとみなす、残った違いの大きさ */
  readonly hiddenNeed: number;
  readonly unit: string;
  readonly axes: { x: string; y: string };
  readonly grid: () => readonly Design[];
  readonly valuesA: () => readonly number[];
}

const grid = (min: number, max: number, step: number) => {
  const n = Math.round((max - min) / step);
  return Array.from({ length: n + 1 }, (_, i) => +(min + i * step).toFixed(4));
};

// ---------- 軟骨 ----------
const CART_STEPS = [0, 11] as const;
export const CARTILAGE_POINTS: readonly (RetrainPoint & { period: number; step: number; phase: StepPhase; tempo: string })[] = TEMPOS.flatMap((t) =>
  CART_STEPS.flatMap((k) => STEP_PHASES.map((ph) => ({ id: `${t.id}:${k}:${ph}`, label: `${t.id === "jog" ? "走る" : t.label}・${k + 1}歩目・${PHASE_LABEL[ph]}`, period: t.period, step: k, phase: ph, tempo: t.label }))),
);
/**
 * 新しい画面で選べる軟骨の数字（2026-11-05 夜、作者の指摘「テンポ・何歩目・一歩の中は、今は判断できるようになっていない」による）。
 * プレイヤーが見たことのある瞬間だけ：謎1・謎2と同じ「走る」の1歩目の4点
 * （2026-11-06、謎2のロボの検査を「走る」の1歩目に変えたため、ゆっくり歩く12歩目の4点は外した）
 */
export const CARTILAGE_SHOWN: readonly { group: string; ids: readonly string[] }[] = [
  { group: "走って1歩目（謎1・謎2と同じ走り）", ids: STEP_PHASES.map((ph) => `jog:0:${ph}`) },
];
/** 全テンポ・全歩・全時点のへこみ（違いが残るかを見る） */
function allDents(p: MaterialParams): number[] {
  const out: number[] = [];
  for (const t of TEMPOS) for (const s of stepDents(p, t.period)) for (const ph of STEP_PHASES) out.push(s[ph]);
  return out;
}
function cartPointValues(p: MaterialParams): number[] {
  const byPeriod = new Map(TEMPOS.map((t) => [t.period, stepDents(p, t.period)]));
  return CARTILAGE_POINTS.map((q) => byPeriod.get(q.period)![q.step]![q.phase]);
}

// ---------- 血管 ----------
const V_TIMES = grid(0, BEAT_S, 0.05);
export const VESSEL_POINTS: readonly (RetrainPoint & { u: number })[] = V_TIMES.map((u) => ({ id: `v:${u}`, label: `脈の中 ${u.toFixed(2)} 秒の圧`, u }));
const vIndex = (u: number) => Math.round((u / BEAT_S) * BEAT_STEPS);

// ---------- 膜 ----------
const M_TIMES = grid(0, RECORD_MS, 5);
export const MEMBRANE_POINTS: readonly (RetrainPoint & { t: number })[] = M_TIMES.map((t) => ({ id: `m:${t}`, label: t === PULSE_MS ? "離す直前（押して 100 ms）の膜の電圧" : t < PULSE_MS ? `押して ${t} ms の膜の電圧` : `離して ${t - PULSE_MS} ms の膜の電圧`, t }));

function memo<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
}

const SPECS: Record<RetrainCase, CaseSpec> = {
  cartilage: {
    points: CARTILAGE_POINTS,
    firstRule: "押して20秒後の力",
    tol: ROBOT_PASS,
    seeB: STEP_TOLERANCE + STEP_ERROR,
    hiddenNeed: HIDDEN_NEED,
    unit: "",
    axes: { x: DUEL_SLIDERS.tau.label, y: DUEL_SLIDERS.e1.label },
    valuesA: memo(() => cartPointValues(BASE)),
    grid: memo(() => {
      const a = cartPointValues(BASE);
      const aAll = allDents(BASE);
      const out: Design[] = [];
      for (const e1 of grid(DUEL_SLIDERS.e1.min, DUEL_SLIDERS.e1.max, DUEL_SLIDERS.e1.step))
        for (const tau of grid(DUEL_SLIDERS.tau.min, DUEL_SLIDERS.tau.max, DUEL_SLIDERS.tau.step)) {
          const p = duelMaterial(e1, tau);
          const first = Math.abs(finalCheckDiff(p).diff) <= ROBOT_PASS + 1e-12;
          const all = allDents(p);
          out.push({ x: tau, y: e1 + DUEL_SLIDERS.e1.offset, first, d: cartPointValues(p).map((v, i) => v - a[i]!), maxDiff: Math.max(...all.map((v, i) => Math.abs(v - aAll[i]!))) });
        }
      return out;
    }),
  },
  vessel: {
    points: VESSEL_POINTS,
    firstRule: "1回の脈の平均の圧",
    tol: VESSEL_ROBOT_TOL,
    seeB: VESSEL_ROBOT_TOL,
    hiddenNeed: VESSEL_HIDDEN_NEED,
    unit: " mmHg",
    axes: { x: VESSEL_SLIDERS.c.label, y: VESSEL_SLIDERS.r.label },
    valuesA: memo(() => {
      const b = steadyBeat(BASE_VESSEL);
      return VESSEL_POINTS.map((q) => b[vIndex(q.u)]!);
    }),
    grid: memo(() => {
      const bA = steadyBeat(BASE_VESSEL);
      const meanA = summarize(BASE_VESSEL).mean;
      const out: Design[] = [];
      for (const r of grid(VESSEL_SLIDERS.r.min, VESSEL_SLIDERS.r.max, VESSEL_SLIDERS.r.step))
        for (const c of grid(VESSEL_SLIDERS.c.min, VESSEL_SLIDERS.c.max, VESSEL_SLIDERS.c.step)) {
          const m: Vessel = { r, c };
          const b = steadyBeat(m);
          const mean = b.slice(0, -1).reduce((s, x) => s + x, 0) / (b.length - 1);
          const first = Math.abs(mean - meanA) <= VESSEL_ROBOT_TOL + 1e-9;
          out.push({ x: c, y: r, first, d: VESSEL_POINTS.map((q) => b[vIndex(q.u)]! - bA[vIndex(q.u)]!), maxDiff: Math.max(...b.map((x, i) => Math.abs(x - bA[i]!))) });
        }
      return out;
    }),
  },
  membrane: {
    points: MEMBRANE_POINTS,
    firstRule: "離す直前の膜の電圧",
    tol: ROBOT_STEADY_TOL,
    seeB: ROBOT_STEADY_TOL,
    hiddenNeed: HIDDEN2_NEED,
    unit: " mV",
    axes: { x: MEM_SLIDERS.c.label, y: MEM_SLIDERS.g.label },
    valuesA: memo(() => MEMBRANE_POINTS.map((q) => deltaMv(BASE_MEM, q.t))),
    grid: memo(() => {
      const out: Design[] = [];
      const ts = Array.from({ length: RECORD_MS + 1 }, (_, t) => t);
      for (const g of grid(MEM_SLIDERS.g.min, MEM_SLIDERS.g.max, MEM_SLIDERS.g.step))
        for (const c of grid(MEM_SLIDERS.c.min, MEM_SLIDERS.c.max, MEM_SLIDERS.c.step)) {
          const m: Membrane = { g, c };
          const first = Math.abs(deltaMv(m, PULSE_MS) - deltaMv(BASE_MEM, PULSE_MS)) <= ROBOT_STEADY_TOL + 1e-9;
          out.push({ x: c, y: g, first, d: MEMBRANE_POINTS.map((q) => deltaMv(m, q.t) - deltaMv(BASE_MEM, q.t)), maxDiff: Math.max(...ts.map((t) => Math.abs(deltaMv(m, t) - deltaMv(BASE_MEM, t)))) });
        }
      return out;
    }),
  },
};

export function retrainSpec(c: RetrainCase) {
  const s = SPECS[c];
  return { points: s.points, firstRule: s.firstRule, tol: s.tol, seeB: s.seeB, hiddenNeed: s.hiddenNeed, unit: s.unit, axes: s.axes };
}

/** この謎のBの、足せる数字ごとの値 */
function bValues(c: RetrainCase, b: MaterialParams | null): readonly number[] {
  if (c === "cartilage") return cartPointValues(b ?? BASE);
  if (c === "vessel") {
    const bb = steadyBeat(CASE_VESSEL_B);
    return VESSEL_POINTS.map((q) => bb[vIndex(q.u)]!);
  }
  return MEMBRANE_POINTS.map((q) => deltaMv(CASE3_B, q.t));
}

/**
 * 書きなおした規則（最初の規則＋足した数字 ids）を確かめる。
 * @param bCartilage 軟骨のときだけ：謎1で開けた試作品Bの値
 */
export function judgeRetrain(c: RetrainCase, ids: readonly string[], bCartilage: MaterialParams | null = null): RetrainResult {
  const s = SPECS[c];
  const idx = ids.map((id) => s.points.findIndex((p) => p.id === id)).filter((i) => i >= 0);
  const a = s.valuesA();
  const bv = bValues(c, bCartilage);
  const bDiffs = idx.map((i) => {
    const diff = bv[i]! - a[i]!;
    return { id: s.points[i]!.id, label: s.points[i]!.label, a: a[i]!, b: bv[i]!, diff, seen: Math.abs(diff) > s.seeB + 1e-12 };
  });
  const catchesB = bDiffs.some((x) => x.seen);
  const cells = s.grid().map((g) => ({
    x: g.x,
    y: g.y,
    first: g.first,
    slips: g.first && idx.every((i) => Math.abs(g.d[i]!) <= s.tol + 1e-12) && g.maxDiff >= s.hiddenNeed - 1e-12,
  }));
  const slipCount = cells.filter((x) => x.slips).length;
  return { bDiffs, catchesB, cells, slipCount, cleared: idx.length > 0 && catchesB && slipCount === 0 };
}
