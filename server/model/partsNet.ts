// つづきの謎（CLAUDE.md 1e-2）：模型の形そのものをAIが部品箱から組み立て、プログラムが計算して確かめる。
// 部品：ためる部品・自分で固くなる部屋・流れにくさ・一方通行の戸・送りこむもの。節点には「高さの決まった場所」を置ける。
import { refById } from "./refs.js";

// AIの出力（NetPuzzleSpec）は信用しない。形・つなぎ方・計算・ロボの見落とし・見える違い・言葉をすべてここで確かめる。

export type ClockKind = "pulse" | "beats";
export type Shape = "square" | "halfSine";
export type PartType = "store" | "chamber" | "resist" | "valve" | "source";
export type Metric = "mean" | "max" | "min" | "plateau" | "halfTime" | "perCycle";

export interface NetNode {
  readonly id: string;
  readonly name: string;
  /** 高さの決まった場所（電池・地面・静脈の戻り口など）。なければ、ためる部品か部屋で高さが決まる */
  readonly fixed?: number;
}

export interface NetPart {
  readonly id: string;
  readonly type: PartType;
  readonly name: string;
  /** 体（または題材）の何にあたるか */
  readonly role: string;
  /** store・chamber・source がつながる節点 */
  readonly node?: string;
  /** resist・valve の両端（valve は from→to だけ流す） */
  readonly from?: string;
  readonly to?: string;
  readonly C?: number;
  readonly R?: number;
  readonly Emin?: number;
  readonly Emax?: number;
  readonly V0?: number;
  readonly amplitude?: number;
  readonly shape?: Shape;
  /** 出典（server/model/refs.ts のカタログの id。1e-3） */
  readonly ref?: string;
}

export type Probe = { readonly node: string } | { readonly flow: string } | { readonly amount: string };

export interface NetPuzzleSpec {
  readonly title: string;
  readonly topic: string;
  readonly scenes: readonly { readonly tag: string; readonly caption: readonly string[] }[];
  readonly endLine: string;
  readonly analogy: string;
  readonly units: {
    readonly level: { readonly name: string; readonly unit: string };
    readonly amount: { readonly name: string; readonly unit: string };
    readonly flow: { readonly name: string; readonly unit: string };
  };
  readonly clock: { readonly kind: ClockKind; readonly on: number; readonly period?: number; readonly record?: number; readonly timeUnit: string };
  readonly nodes: readonly NetNode[];
  readonly parts: readonly NetPart[];
  readonly watch: readonly { readonly probe: Probe; readonly label: string }[];
  readonly robot: { readonly probe: Probe; readonly metric: Metric; readonly says: string };
  readonly B: {
    readonly part: string;
    readonly param: string;
    readonly factor: number;
    /** ロボの数字がそろうように、プログラムが合わせる値（任意） */
    readonly compensate?: { readonly part: string; readonly param: string };
    readonly reveal: string;
  };
  readonly outOfScope: readonly string[];
  /** 部品箱にない部品が要ると判断したら書く */
  readonly missingParts?: readonly string[];
  /** 前の謎からのつなぎ（1e-3） */
  readonly link: { readonly fromTitle: string; readonly story: string; readonly change: string };
  /** 次の題材の候補（AIが2〜3個） */
  readonly nextTopics: readonly string[];
}

/** 足し引きを数える部品の種類。battery は高さが 0 でない「高さの決まった場所」（電池） */
export type DiffType = PartType | "battery";

export interface PartDiff {
  readonly added: DiffType[];
  readonly removed: DiffType[];
  readonly kept: DiffType[];
}

/** 前の模型からの部品の足し引き（種類ごとの数で比べる） */
export function partDiff(prev: NetPuzzleSpec, cur: NetPuzzleSpec): PartDiff {
  const count = (sp: NetPuzzleSpec) => {
    const m = new Map<DiffType, number>();
    for (const p of sp.parts) m.set(p.type, (m.get(p.type) ?? 0) + 1);
    const bat = sp.nodes.filter((n) => typeof n.fixed === "number" && n.fixed !== 0).length;
    if (bat) m.set("battery", bat);
    return m;
  };
  const a = count(prev);
  const b = count(cur);
  const added: DiffType[] = [];
  const removed: DiffType[] = [];
  const kept: DiffType[] = [];
  for (const t of ["source", "store", "chamber", "resist", "valve", "battery"] as DiffType[]) {
    const x = a.get(t) ?? 0;
    const y = b.get(t) ?? 0;
    for (let k = 0; k < Math.min(x, y); k++) kept.push(t);
    for (let k = x; k < y; k++) added.push(t);
    for (let k = y; k < x; k++) removed.push(t);
  }
  return { added, removed, kept };
}

export interface Check {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface NetRun {
  readonly t: number[];
  /** 節点ごとの高さ（id → 時系列） */
  readonly level: Record<string, number[]>;
  /** 部品ごとの流れ（resist・valve・source） */
  readonly flow: Record<string, number[]>;
  /** ためる部品・部屋のたまった量 */
  readonly amount: Record<string, number[]>;
  /** くり返しのとき、落ち着いたか */
  readonly settled: boolean;
  readonly finite: boolean;
}

export interface NetVerdict {
  readonly ok: boolean;
  readonly checks: Check[];
  readonly runA?: NetRun;
  readonly runB?: NetRun;
  /** 合わせたあとのBの値 */
  readonly specB?: NetPuzzleSpec;
  readonly compensateFactor?: number;
  readonly robotA?: number;
  readonly robotB?: number;
  readonly best?: { readonly label: string; readonly probe: Probe; readonly t: number; readonly a: number; readonly b: number; readonly tol: number };
  /** 外からエネルギーを入れている部品・場所 */
  readonly energySources?: string[];
  /** 前の模型からの部品の足し引き（前の謎を渡したとき） */
  readonly diff?: PartDiff;
}

export const MAX_NODES = 7;
export const MAX_PARTS = 12;
export const ROBOT_REL = 0.02;
export const SEE_REL = 0.08;
export const HALF_REL = 0.03;
const BANNED = /病|症|患者|診断|治療|薬|投与|処方|服用|手術|がん|癌|死|血圧が(高|低)|異常|mg|ミリグラム|発火|活動電位|臨床/;

const PARAMS: Record<PartType, readonly string[]> = {
  store: ["C"],
  chamber: ["Emin", "Emax", "V0"],
  resist: ["R"],
  valve: ["R"],
  source: ["amplitude"],
};

/** 時計の「送る」あいだの位置（0〜1）。送っていなければ −1 */
function phase(spec: NetPuzzleSpec, t: number): number {
  const c = spec.clock;
  const local = c.kind === "beats" ? ((t % c.period!) + c.period!) % c.period! : t;
  return local >= 0 && local < c.on ? local / c.on : -1;
}

export function sourceAt(spec: NetPuzzleSpec, p: NetPart, t: number): number {
  const ph = phase(spec, t);
  if (ph < 0) return 0;
  return (p.shape ?? "square") === "halfSine" ? p.amplitude! * Math.sin(Math.PI * ph) : p.amplitude!;
}

export function elastanceAt(spec: NetPuzzleSpec, p: NetPart, t: number): number {
  const ph = phase(spec, t);
  const act = ph < 0 ? 0 : Math.sin(Math.PI * ph);
  return p.Emin! + (p.Emax! - p.Emin!) * act;
}

interface Compiled {
  spec: NetPuzzleSpec;
  storages: NetPart[];
  /** 節点 id → ためる部品・部屋の番号（なければ fixed） */
  nodeStore: Map<string, number>;
  fixed: Map<string, number>;
  links: NetPart[];
  sources: NetPart[];
}

function compile(spec: NetPuzzleSpec): Compiled {
  const storages = spec.parts.filter((p) => p.type === "store" || p.type === "chamber");
  const nodeStore = new Map<string, number>();
  storages.forEach((p, k) => nodeStore.set(p.node!, k));
  const fixed = new Map<string, number>();
  spec.nodes.forEach((n) => {
    if (typeof n.fixed === "number") fixed.set(n.id, n.fixed);
  });
  return { spec, storages, nodeStore, fixed, links: spec.parts.filter((p) => p.type === "resist" || p.type === "valve"), sources: spec.parts.filter((p) => p.type === "source") };
}

function levels(c: Compiled, q: number[], t: number): Map<string, number> {
  const L = new Map<string, number>(c.fixed);
  c.storages.forEach((p, k) => {
    const lv = p.type === "store" ? q[k]! / p.C! : elastanceAt(c.spec, p, t) * (q[k]! - (p.V0 ?? 0));
    L.set(p.node!, lv);
  });
  return L;
}

function linkFlow(p: NetPart, L: Map<string, number>): number {
  const d = L.get(p.from!)! - L.get(p.to!)!;
  return p.type === "valve" ? Math.max(0, d) / p.R! : d / p.R!;
}

function deriv(c: Compiled, q: number[], t: number): number[] {
  const L = levels(c, q, t);
  const dq = q.map(() => 0);
  for (const p of c.links) {
    const f = linkFlow(p, L);
    const a = c.nodeStore.get(p.from!);
    const b = c.nodeStore.get(p.to!);
    if (a !== undefined) dq[a]! -= f;
    if (b !== undefined) dq[b]! += f;
  }
  for (const p of c.sources) {
    const k = c.nodeStore.get(p.node!);
    if (k !== undefined) dq[k]! += sourceAt(c.spec, p, t);
  }
  return dq;
}

/** いちばん速い変化の時間の目安（刻みを決める） */
function fastestTau(c: Compiled): number {
  let m = Infinity;
  c.storages.forEach((p) => {
    const cap = p.type === "store" ? p.C! : 1 / Math.max(p.Emax!, p.Emin!);
    let g = 0;
    for (const l of c.links) if (l.from === p.node || l.to === p.node) g += 1 / l.R!;
    if (g > 0) m = Math.min(m, cap / g);
  });
  return Number.isFinite(m) ? m : 1;
}

function step(c: Compiled, q: number[], t: number, dt: number): number[] {
  const k1 = deriv(c, q, t);
  const k2 = deriv(c, q.map((v, i) => v + (dt / 2) * k1[i]!), t + dt / 2);
  const k3 = deriv(c, q.map((v, i) => v + (dt / 2) * k2[i]!), t + dt / 2);
  // 送り終わりなどの切りかわりが刻みの端に来ても、刻みの中の値で評価する（右端をわずかに内側に）
  const k4 = deriv(c, q.map((v, i) => v + dt * k3[i]!), t + dt * (1 - 1e-9));
  return q.map((v, i) => v + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!));
}

/** tEnd までを n 区切りで記録する */
function integrate(c: Compiled, q0: number[], t0: number, tEnd: number, n: number, dtMax: number): { t: number[]; q: number[][] } {
  const span = tEnd - t0;
  const sub = Math.max(1, Math.ceil(span / n / dtMax));
  const dt = span / n / sub;
  const t: number[] = [t0];
  const qs: number[][] = [q0.slice()];
  let q = q0.slice();
  for (let i = 1; i <= n; i++) {
    for (let s = 0; s < sub; s++) q = step(c, q, t0 + ((i - 1) * sub + s) * dt, dt);
    t.push(t0 + (i * span) / n);
    qs.push(q.slice());
  }
  return { t, q: qs };
}

/** 送りこまず・縮まないときの落ち着いた状態（初めの状態） */
function restState(c: Compiled, dtMax: number): number[] {
  const quiet: NetPuzzleSpec = { ...c.spec, clock: { ...c.spec.clock, kind: "pulse", on: 0 } };
  const cq = { ...c, spec: quiet };
  let q = c.storages.map((p) => (p.type === "store" ? 0 : p.V0 ?? 0));
  const tau = fastestTau(c);
  for (let r = 0; r < 60; r++) {
    const span = 40 * tau * Math.pow(1.6, r);
    const res = integrate(cq, q, 0, span, 50, dtMax);
    const next = res.q[res.q.length - 1]!;
    const diff = Math.max(0, ...next.map((v, i) => Math.abs(v - q[i]!)));
    const scale = Math.max(1e-9, ...next.map(Math.abs));
    q = next;
    if (diff < 1e-10 * scale) break;
  }
  return q;
}

/** 組み立てた模型を計算する */
export function runNet(spec: NetPuzzleSpec, n = 400): NetRun {
  const c = compile(spec);
  const ck = spec.clock;
  const span = ck.kind === "beats" ? ck.period! : ck.record!;
  const dtMax = Math.min(fastestTau(c) / 8, ck.on / 100, span / 800);
  let q0 = restState(c, dtMax);
  let settled = true;
  if (ck.kind === "beats") {
    settled = false;
    for (let k = 0; k < 600; k++) {
      const one = integrate(c, q0, 0, span, 40, dtMax);
      const end = one.q[one.q.length - 1]!;
      const scale = Math.max(1e-9, ...end.map(Math.abs));
      const diff = Math.max(0, ...end.map((v, i) => Math.abs(v - q0[i]!)));
      q0 = end;
      if (!end.every(Number.isFinite)) break;
      if (diff < 1e-8 * scale) {
        settled = true;
        break;
      }
    }
  }
  const res = integrate(c, q0, 0, span, n, dtMax);
  const level: Record<string, number[]> = {};
  const flow: Record<string, number[]> = {};
  const amount: Record<string, number[]> = {};
  spec.nodes.forEach((nd) => (level[nd.id] = []));
  spec.parts.forEach((p) => {
    if (p.type === "store" || p.type === "chamber") amount[p.id] = [];
    else flow[p.id] = [];
  });
  res.t.forEach((t, i) => {
    const q = res.q[i]!;
    const L = levels(c, q, t);
    spec.nodes.forEach((nd) => level[nd.id]!.push(L.get(nd.id) ?? Number.NaN));
    c.storages.forEach((p, k) => amount[p.id]!.push(q[k]!));
    c.links.forEach((p) => flow[p.id]!.push(linkFlow(p, L)));
    c.sources.forEach((p) => flow[p.id]!.push(sourceAt(spec, p, t)));
  });
  const finite = [...Object.values(level), ...Object.values(flow), ...Object.values(amount)].every((s) => s.every(Number.isFinite));
  return { t: res.t, level, flow, amount, settled, finite };
}

export function probeSeries(run: NetRun, p: Probe): number[] | undefined {
  if ("node" in p) return run.level[p.node];
  if ("flow" in p) return run.flow[p.flow];
  return run.amount[p.amount];
}

function trapz(t: number[], y: number[]): number {
  let s = 0;
  for (let i = 1; i < t.length; i++) s += ((y[i]! + y[i - 1]!) / 2) * (t[i]! - t[i - 1]!);
  return s;
}

/** ロボの見る一つの数字 */
export function metricOf(spec: NetPuzzleSpec, run: NetRun, p: Probe, m: Metric): number {
  const y = probeSeries(run, p)!;
  const t = run.t;
  const span = t[t.length - 1]! - t[0]!;
  if (m === "mean") return trapz(t, y) / span;
  if (m === "max") return Math.max(...y);
  if (m === "min") return Math.min(...y);
  if (m === "perCycle") return trapz(t, y);
  const k = Math.max(0, t.findIndex((x) => x >= spec.clock.on) - 1);
  if (m === "plateau") return y[k]!;
  // halfTime：送り終わりの高さが、記録の初めの高さとの差の半分に戻るまで
  const base = y[0]!;
  const d0 = y[k]! - base;
  for (let i = k + 1; i < t.length; i++) {
    if (Math.abs(y[i]! - base) <= Math.abs(d0) / 2) {
      const a = Math.abs(y[i - 1]! - base);
      const b = Math.abs(y[i]! - base);
      const f = a === b ? 0 : (a - Math.abs(d0) / 2) / (a - b);
      return t[i - 1]! + f * (t[i]! - t[i - 1]!) - t[k]!;
    }
  }
  return Number.NaN;
}

/** B：一つの部品の値を factor 倍（compensate があれば、もう一つを g 倍） */
export function withB(spec: NetPuzzleSpec, g = 1): NetPuzzleSpec {
  const scale = (p: NetPart, param: string, f: number): NetPart => ({ ...p, [param]: (p as unknown as Record<string, number>)[param]! * f });
  const parts = spec.parts.map((p) => {
    let q = p;
    if (p.id === spec.B.part) q = scale(q, spec.B.param, spec.B.factor);
    if (spec.B.compensate && p.id === spec.B.compensate.part) q = scale(q, spec.B.compensate.param, g);
    return q;
  });
  return { ...spec, parts };
}

const isPos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const textOk = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function probeOk(spec: NetPuzzleSpec, p: Probe | undefined): boolean {
  if (!p || typeof p !== "object") return false;
  if ("node" in p) return spec.nodes.some((n) => n.id === p.node);
  if ("flow" in p) return spec.parts.some((q) => q.id === p.flow && (q.type === "resist" || q.type === "valve" || q.type === "source"));
  if ("amount" in p) return spec.parts.some((q) => q.id === p.amount && (q.type === "store" || q.type === "chamber"));
  return false;
}

function paramOk(spec: NetPuzzleSpec, part: string, param: string): boolean {
  const p = spec.parts.find((q) => q.id === part);
  return !!p && PARAMS[p.type].includes(param) && isNum((p as unknown as Record<string, unknown>)[param]);
}

/** AIの組み立てた謎を確かめる */
export function verifyNetPuzzle(raw: unknown, previous?: NetPuzzleSpec): NetVerdict {
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean, detail = "") => checks.push({ id, label, ok, detail });
  const s = raw as NetPuzzleSpec;

  // 1. 形
  const shapeOk =
    !!s &&
    textOk(s.title, 40) &&
    textOk(s.topic, 30) &&
    Array.isArray(s.scenes) &&
    s.scenes.length === 3 &&
    s.scenes.every((sc) => textOk(sc?.tag, 24) && Array.isArray(sc.caption) && sc.caption.length >= 1 && sc.caption.length <= 2 && sc.caption.every((c: unknown) => textOk(c, 70))) &&
    textOk(s.endLine, 60) &&
    textOk(s.analogy, 200) &&
    !!s.units &&
    ["level", "amount", "flow"].every((k) => textOk((s.units as Record<string, { name: string }>)[k]?.name, 30)) &&
    !!s.clock &&
    (s.clock.kind === "pulse" || s.clock.kind === "beats") &&
    Array.isArray(s.nodes) &&
    Array.isArray(s.parts) &&
    s.nodes.every((n) => textOk(n?.id, 20) && textOk(n.name, 30)) &&
    s.parts.every((p) => textOk(p?.id, 20) && textOk(p.name, 30) && textOk(p.role, 80) && ["store", "chamber", "resist", "valve", "source"].includes(p.type)) &&
    Array.isArray(s.watch) &&
    s.watch.length >= 1 &&
    s.watch.length <= 3 &&
    s.watch.every((w) => textOk(w?.label, 30)) &&
    !!s.robot &&
    ["mean", "max", "min", "plateau", "halfTime", "perCycle"].includes(s.robot.metric) &&
    textOk(s.robot.says, 80) &&
    !!s.B &&
    textOk(s.B.reveal, 160) &&
    Array.isArray(s.outOfScope) &&
    s.outOfScope.length >= 1;
  add("shape", "決まった形で書けている", shapeOk, shapeOk ? "" : "欠けている項目、または長すぎる文がある");
  if (!shapeOk) return { ok: false, checks };

  // 2. 数と値
  const sizeOk = s.nodes.length >= 2 && s.nodes.length <= MAX_NODES && s.parts.length >= 2 && s.parts.length <= MAX_PARTS;
  add("size", `節点 2〜${MAX_NODES}・部品 2〜${MAX_PARTS}`, sizeOk, `節点 ${s.nodes.length}・部品 ${s.parts.length}`);
  const ck = s.clock;
  const clockOk = isPos(ck.on) && (ck.kind === "pulse" ? isPos(ck.record) && ck.record! > ck.on : isPos(ck.period) && ck.on < ck.period!);
  const badVals: string[] = [];
  for (const p of s.parts) {
    if (p.type === "store" && !isPos(p.C)) badVals.push(`${p.id}.C`);
    if ((p.type === "resist" || p.type === "valve") && !isPos(p.R)) badVals.push(`${p.id}.R`);
    if (p.type === "source" && !isPos(p.amplitude)) badVals.push(`${p.id}.amplitude`);
    if (p.type === "chamber" && !(isPos(p.Emin) && isPos(p.Emax) && p.Emax! > p.Emin! && (p.V0 === undefined || (isNum(p.V0) && p.V0 >= 0)))) badVals.push(`${p.id}.E`);
  }
  for (const n of s.nodes) if (n.fixed !== undefined && !isNum(n.fixed)) badVals.push(`${n.id}.fixed`);
  const valsOk = clockOk && badVals.length === 0;
  add("values", "値が正で、時計のつじつまが合う", valsOk, valsOk ? "" : clockOk ? `おかしい値：${badVals.join("、")}` : "送る長さと周期・記録の長さの関係がおかしい");
  if (!sizeOk || !valsOk) return { ok: false, checks };

  // 3. つなぎ方
  const ids = new Set(s.nodes.map((n) => n.id));
  const pids = new Set(s.parts.map((p) => p.id));
  const uniq = ids.size === s.nodes.length && pids.size === s.parts.length;
  const wiringErr: string[] = [];
  if (!uniq) wiringErr.push("同じ id がある");
  for (const p of s.parts) {
    if (p.type === "resist" || p.type === "valve") {
      if (!ids.has(p.from!) || !ids.has(p.to!) || p.from === p.to) wiringErr.push(`${p.id} の両端`);
    } else if (!ids.has(p.node!)) wiringErr.push(`${p.id} の節点`);
  }
  const fixedIds = s.nodes.filter((n) => n.fixed !== undefined).map((n) => n.id);
  if (fixedIds.length === 0) wiringErr.push("高さの決まった場所が一つもない");
  for (const n of s.nodes) {
    const st = s.parts.filter((p) => (p.type === "store" || p.type === "chamber") && p.node === n.id);
    if (n.fixed !== undefined && st.length > 0) wiringErr.push(`${n.id} は高さが決まっているのに、ためる部品がある`);
    if (n.fixed === undefined && st.length !== 1) wiringErr.push(`${n.id} には、ためる部品か部屋がちょうど一つ要る（今 ${st.length}）`);
  }
  for (const p of s.parts) if (p.type === "source" && fixedIds.includes(p.node!)) wiringErr.push(`${p.id} が高さの決まった場所に送りこんでいる`);
  add("wiring", "つなぎ方（たまる場所ごとにためる部品が一つ・高さの決まった場所がある）", wiringErr.length === 0, wiringErr.join("／"));
  if (wiringErr.length) return { ok: false, checks };
  // どのたまる場所からも、流れにくさ・戸を通って高さの決まった場所へ行ける（逃げ道）
  const reach = new Set(fixedIds);
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of s.parts) {
      if (p.type !== "resist" && p.type !== "valve") continue;
      // 戸は from→to にしか流れないので、to が届くなら from も届く
      const pairs: [string, string][] = p.type === "valve" ? [[p.from!, p.to!]] : [[p.from!, p.to!], [p.to!, p.from!]];
      for (const [a, b] of pairs) if (reach.has(b) && !reach.has(a)) {
        reach.add(a);
        changed = true;
      }
    }
  }
  const trapped = s.nodes.filter((n) => !reach.has(n.id)).map((n) => n.name);
  add("leak", "どのたまる場所にも、外へ逃げる道がある", trapped.length === 0, trapped.length ? `逃げ道がない：${trapped.join("、")}` : "");

  // 4. 言葉
  const banned = JSON.stringify(s).match(BANNED);
  add("words", "病名・診断・治療・薬の量につながる言葉がない", !banned, banned ? `「${banned[0]}」を含む` : "");

  // 4b. 出典（1e-3）：どの部品にも、カタログにある出典があり、その文献がその部品の種類を支える
  const refErr: string[] = [];
  for (const p of s.parts) {
    const r = refById(p.ref);
    if (!r) refErr.push(`${p.name}：${p.ref ? `カタログにない出典「${String(p.ref).slice(0, 30)}」` : "出典がない"}`);
    else if (!r.supports.includes(p.type)) refErr.push(`${p.name}：${r.id} はこの種類の部品を支えない`);
    else if (r.excludeWords && r.excludeWords.test(`${p.name} ${p.role}`)) refErr.push(`${p.name}：${r.id} は「${p.role}」を扱っていない（${r.notCovers}）`);
    else if (!r.topicWords.test(`${p.name} ${p.role}`)) refErr.push(`${p.name}：${r.id}（${r.field}の文献）の対象ではない（別の対象の文献の形だけを借りている）`);
  }
  add("sources", "どの部品にも、確かめた文献の出典がある", refErr.length === 0, refErr.join("／"));

  // 4c. つなぎ（1e-3）：前の謎の題名、部品の種類の共有と違い（足し引きはプログラムが計算する）
  const linkShape = !!s.link && textOk(s.link.fromTitle, 40) && textOk(s.link.story, 120) && textOk(s.link.change, 120);
  let diff: PartDiff | undefined;
  let linkOk = linkShape;
  let linkDetail = linkShape ? "" : "つなぎ（fromTitle・story・change）が欠けている、または長すぎる";
  if (linkShape && previous) {
    diff = partDiff(previous, s);
    const sameTitle = s.link.fromTitle.trim() === previous.title.trim();
    const shares = diff.kept.length > 0;
    const differs = diff.added.length + diff.removed.length > 0;
    linkOk = sameTitle && shares && differs;
    linkDetail = [!sameTitle ? `前の謎の題名が違う（前は「${previous.title}」）` : "", !shares ? "前の模型と同じ種類の部品が一つもない" : "", !differs ? "前の模型と部品の種類が全く同じ" : ""].filter(Boolean).join("／");
  }
  add("link", "前の謎とつながっている（同じ部品を残し、一つ以上足すか置きかえる）", linkOk, linkDetail);
  const nextOk = Array.isArray(s.nextTopics) && s.nextTopics.length >= 2 && s.nextTopics.length <= 3 && s.nextTopics.every((t) => textOk(t, 20));
  add("next", "次の題材の候補が2〜3個ある", nextOk);

  // 5. 見るもの・ロボ・B の参照
  const refsOk =
    s.watch.every((w) => probeOk(s, w.probe)) &&
    probeOk(s, s.robot.probe) &&
    paramOk(s, s.B.part, s.B.param) &&
    (!s.B.compensate || (paramOk(s, s.B.compensate.part, s.B.compensate.param) && !(s.B.compensate.part === s.B.part && s.B.compensate.param === s.B.param))) &&
    (s.robot.metric !== "plateau" && s.robot.metric !== "halfTime" ? true : ck.kind === "pulse") &&
    (s.robot.metric === "perCycle" ? "flow" in s.robot.probe : true);
  add("refs", "見るもの・ロボの数字・Bの部品が、組み立てた模型の中にある", refsOk);
  const f = s.B.factor;
  const factorOk = isPos(f) && f >= 0.33 && f <= 3 && Math.abs(Math.log(f)) >= Math.log(1.3);
  add("factor", "Bの違いの大きさ（見本の0.33〜3倍、1.3倍以上の違い）", factorOk, `見本の ${f} 倍`);
  if (trapped.length || banned || refErr.length || !linkOk || !nextOk || !refsOk || !factorOk) return { ok: false, checks, diff };

  // 6. 計算
  const runA = runNet(s);
  const calcOk = runA.finite && runA.settled;
  add("calc", ck.kind === "beats" ? "計算が破綻せず、落ち着いた1回に収まる" : "計算が破綻しない", calcOk);
  if (!calcOk) return { ok: false, checks, runA };
  // どの部品も実際に流れる・動く
  const idle: string[] = [];
  for (const p of s.parts) {
    const y = p.type === "store" || p.type === "chamber" ? runA.amount[p.id]! : runA.flow[p.id]!;
    const span = Math.max(...y) - Math.min(...y);
    const mag = Math.max(...y.map(Math.abs));
    if (p.type === "store" || p.type === "chamber" ? span <= 1e-6 * Math.max(1, mag) : mag <= 1e-9) idle.push(p.name);
  }
  add("active", "どの部品も、実際に流れる・動く", idle.length === 0, idle.length ? `動かない部品：${idle.join("、")}` : "");
  // くり返しのとき、1回で入った量と出た量（ためる場所ごと）
  if (ck.kind === "beats") {
    let worst = 0;
    for (const p of s.parts) if (p.type === "store" || p.type === "chamber") {
      const y = runA.amount[p.id]!;
      const sw = Math.max(1e-12, Math.max(...y) - Math.min(...y));
      worst = Math.max(worst, Math.abs(y[y.length - 1]! - y[0]!) / sw);
    }
    add("balance", "落ち着いた1回で、入った量と出た量が等しい", worst < 1e-3, `ずれ ${(worst * 100).toFixed(3)}%`);
  }

  // 7. ロボの見落とし（compensate があればプログラムが合わせる）
  const robotAt = (sp: NetPuzzleSpec) => {
    const r = runNet(sp);
    return { r, v: metricOf(sp, r, sp.robot.probe, sp.robot.metric) };
  };
  const robotA = metricOf(s, runA, s.robot.probe, s.robot.metric);
  const robotSeries = probeSeries(runA, s.robot.probe)!;
  // 1回で流れた量は、その量の大きさで、ほかは見る量の振れ幅で測る
  const robotScale = Math.max(1e-12, s.robot.metric === "perCycle" ? Math.abs(robotA) : Math.max(...robotSeries) - Math.min(...robotSeries));
  const same = (v: number) => (s.robot.metric === "halfTime" ? Number.isFinite(v) && Math.abs(v - robotA) <= HALF_REL * robotA : Math.abs(v - robotA) <= ROBOT_REL * robotScale);
  let g = 1;
  let b = robotAt(withB(s, 1));
  let tuneNote = "";
  // compensate を書いたときは必ず合わせる（「合わせた」という正体の文が、計算と食い違わないように）
  if (s.B.compensate && !(Math.abs(b.v - robotA) <= 1e-6 * Math.max(1e-12, Math.abs(robotA)))) {
    const err = (gg: number) => robotAt(withB(s, gg)).v - robotA;
    // 0.2〜5 倍を対数で17点に分けて、符号が変わる隣どうしのうち 1 倍にいちばん近い組を探す（端で計算できない値があっても止まらない）
    const grid = Array.from({ length: 17 }, (_, k) => Math.log(0.2) + ((Math.log(5) - Math.log(0.2)) * k) / 16);
    const es = grid.map((x) => err(Math.exp(x)));
    let pick = -1;
    for (let k = 0; k < 16; k++) {
      if (Number.isFinite(es[k]!) && Number.isFinite(es[k + 1]!) && es[k]! * es[k + 1]! <= 0) {
        if (pick < 0 || Math.abs(grid[k]! + grid[k + 1]!) < Math.abs(grid[pick]! + grid[pick + 1]!)) pick = k;
      }
    }
    if (pick >= 0) {
      let lo = grid[pick]!;
      let hi = grid[pick + 1]!;
      let elo = es[pick]!;
      // 一区切り（約1.22倍）を 2^20 に分ければ十分（ロボの許容は 2%）
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        const em = err(Math.exp(mid));
        if (!Number.isFinite(em)) break;
        if (em * elo <= 0) hi = mid;
        else {
          lo = mid;
          elo = em;
        }
      }
      g = Math.exp((lo + hi) / 2);
      b = robotAt(withB(s, g));
      tuneNote = `${s.B.compensate.part}.${s.B.compensate.param} を見本の ${g.toPrecision(3)} 倍に合わせた。`;
    } else tuneNote = "合わせる値を 0.2〜5 倍で動かしても、ロボの数字はそろわない。";
  }
  const robotSame = same(b.v);
  add("robot", "ロボの見る一つの数字では、AとBを区別できない", robotSame, `${tuneNote}A ${robotA.toPrecision(4)}／B ${b.v.toPrecision(4)}`);
  const runB = b.r;
  const bOk = runB.finite && runB.settled;
  if (!bOk) add("calcB", "Bの計算が破綻せず、落ち着く", false);

  // 8. 見るもののどこかで、違いが見える
  let best: NetVerdict["best"];
  let bestRatio = 0;
  for (const w of s.watch) {
    const ya = probeSeries(runA, w.probe)!;
    const yb = probeSeries(runB, w.probe)!;
    const range = Math.max(1e-12, Math.max(...ya) - Math.min(...ya));
    const tol = SEE_REL * range;
    ya.forEach((a, k) => {
      const r = Math.abs(yb[k]! - a) / tol;
      if (r > bestRatio) {
        bestRatio = r;
        best = { label: w.label, probe: w.probe, t: runA.t[k]!, a, b: yb[k]!, tol };
      }
    });
  }
  add("visible", "見るもののどこかで、違いが見える（その振れ幅の8%以上）", bestRatio >= 1, best ? `${best.label}：${best.t.toPrecision(3)} ${ck.timeUnit} で A ${best.a.toPrecision(4)}／B ${best.b.toPrecision(4)}` : "");

  const energySources = [
    ...s.parts.filter((p) => p.type === "source" || p.type === "chamber").map((p) => p.name),
    ...s.nodes.filter((n) => n.fixed !== undefined && n.fixed !== 0).map((n) => n.name),
  ];
  const ok = checks.every((c) => c.ok);
  return { ok, checks, runA, runB, specB: withB(s, g), compensateFactor: s.B.compensate ? g : undefined, robotA, robotB: b.v, best, energySources, diff };
}
