// つづきの謎（CLAUDE.md 1e）：AIが組み立てた謎を、プログラムが確かめる。
// 模型は一次の「ためる部品 C・流れにくさ R・送りこむもの u(t)・基準の高さ」：C·dy/dt = u − y/R（y は基準からの上がり分）。
// AIの出力（PuzzleSpec）は信用しない。値・ロボの見落とし・見える違い・言葉の禁止事項をすべてここで計算して確かめる。

export type InputKind = "pulse" | "beats";
export type PulseShape = "square" | "halfSine";
export type RobotMetric = "plateau" | "cycleMean" | "halfTime";
export type BKind = "storage" | "tradeoff";

export interface PuzzleSpec {
  readonly title: string;
  readonly topic: string;
  readonly scenes: readonly { readonly tag: string; readonly caption: readonly string[] }[];
  readonly endLine: string;
  readonly parts: {
    readonly flow: { readonly name: string; readonly unit: string };
    readonly storage: { readonly name: string };
    readonly resistance: { readonly name: string };
    readonly level: { readonly name: string; readonly unit: string };
    readonly base?: { readonly name: string; readonly value: number };
  };
  /** ためたものが、どこを通って外へ逃げるか（R はこの道の流れにくさ）。模型が成り立つかを人が読むための欄 */
  readonly leak: string;
  /** これまでの謎とのつながり（何を何に見立てたか） */
  readonly analogy: string;
  readonly input: {
    readonly kind: InputKind;
    readonly shape?: PulseShape;
    readonly amplitude: number;
    /** 一度流す長さ、または脈1回のうち送っている長さ */
    readonly on: number;
    /** 脈の周期（beats のとき） */
    readonly period?: number;
    readonly timeUnit: string;
    /** 記録する長さ（pulse のとき） */
    readonly record?: number;
  };
  readonly sampleA: { readonly R: number; readonly C: number };
  readonly robot: { readonly metric: RobotMetric; readonly says: string };
  readonly B: { readonly kind: BKind; readonly factor: number; readonly reveal: string };
  readonly outOfScope: readonly string[];
}

export interface Trace {
  readonly t: number[];
  readonly a: number[];
  readonly b: number[];
}

export interface Check {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface Verdict {
  readonly ok: boolean;
  readonly checks: Check[];
  /** 確かめに通ったときだけ */
  readonly trace?: Trace;
  readonly robotA?: number;
  readonly robotB?: number;
  /** 違いがいちばん大きい時刻と差 */
  readonly bestT?: number;
  readonly bestDiff?: number;
  /** 判定に使う幅（見える差・ロボの許容） */
  readonly seeTol?: number;
  readonly robotTol?: number;
}

/** ロボの許容（高さの何割）と、違いが見えたとみなす幅 */
export const ROBOT_REL = 0.02;
export const SEE_REL = 0.08;
export const HALF_REL = 0.03;
const BANNED = /病|症|患者|診断|治療|薬|投与|処方|服用|手術|がん|癌|死|血圧が(高|低)|異常|mg|ミリグラム/;

export function inputAt(spec: PuzzleSpec, t: number): number {
  const i = spec.input;
  const local = i.kind === "beats" ? ((t % i.period!) + i.period!) % i.period! : t;
  if (local < 0 || local >= i.on) return 0;
  return (i.shape ?? "square") === "halfSine" ? i.amplitude * Math.sin((Math.PI * local) / i.on) : i.amplitude;
}

/** 一次の模型を、細かい刻みで解く（刻みの中は入力を一定とみなした厳密な更新）。beats は落ち着くまで回して最後の1回を返す */
export function simulate(spec: PuzzleSpec, R: number, C: number, tEnd: number, n: number, y0 = 0): { t: number[]; y: number[] } {
  const tau = R * C;
  const sub = Math.max(1, Math.ceil(tEnd / n / (tau / 50)));
  const dt = tEnd / n / sub;
  const k = Math.exp(-dt / tau);
  const t: number[] = [0];
  const y: number[] = [y0];
  let v = y0;
  for (let i = 1; i <= n; i++) {
    for (let s = 0; s < sub; s++) {
      const tm = ((i - 1) * sub + s + 0.5) * dt;
      v = v * k + inputAt(spec, tm) * R * (1 - k);
    }
    t.push((i * tEnd) / n);
    y.push(v);
  }
  return { t, y };
}

function steadyCycle(spec: PuzzleSpec, R: number, C: number, n: number): { t: number[]; y: number[] } {
  const P = spec.input.period!;
  let y0 = 0;
  for (let c = 0; c < 400; c++) {
    const one = simulate(spec, R, C, P, n, y0);
    const end = one.y[one.y.length - 1]!;
    if (Math.abs(end - y0) < 1e-9 * Math.max(1, Math.abs(end))) return one;
    y0 = end;
  }
  return simulate(spec, R, C, P, n, y0);
}

export function paramsB(spec: PuzzleSpec): { R: number; C: number } {
  const { R, C } = spec.sampleA;
  const f = spec.B.factor;
  return spec.B.kind === "storage" ? { R, C: C * f } : { R: R * f, C: C / f };
}

function halfTime(t: number[], y: number[], from: number): number {
  const i0 = t.findIndex((x) => x >= from);
  const y0 = y[i0]!;
  for (let i = i0 + 1; i < t.length; i++) if (y[i]! <= y0 / 2) {
    const f = (y[i - 1]! - y0 / 2) / (y[i - 1]! - y[i]!);
    return t[i - 1]! + f * (t[i]! - t[i - 1]!) - from;
  }
  return Number.NaN;
}

const isPos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const textOk = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** AIの出力を確かめる。形・値・ロボの見落とし・見える違い・言葉 */
export function verifyPuzzle(raw: unknown): Verdict {
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean, detail = "") => checks.push({ id, label, ok, detail });
  const s = raw as PuzzleSpec;
  // 1. 形
  const shapeOk =
    !!s &&
    textOk(s.title, 40) &&
    textOk(s.topic, 30) &&
    Array.isArray(s.scenes) &&
    s.scenes.length === 3 &&
    s.scenes.every((sc) => textOk(sc?.tag, 24) && Array.isArray(sc.caption) && sc.caption.length >= 1 && sc.caption.length <= 2 && sc.caption.every((c: unknown) => textOk(c, 70))) &&
    textOk(s.endLine, 60) &&
    textOk(s.analogy, 160) &&
    textOk(s.leak, 80) &&
    !!s.parts &&
    textOk(s.parts.flow?.name, 30) &&
    textOk(s.parts.storage?.name, 30) &&
    textOk(s.parts.resistance?.name, 30) &&
    textOk(s.parts.level?.name, 30) &&
    !!s.input &&
    (s.input.kind === "pulse" || s.input.kind === "beats") &&
    !!s.robot &&
    ["plateau", "cycleMean", "halfTime"].includes(s.robot.metric) &&
    textOk(s.robot.says, 80) &&
    !!s.B &&
    (s.B.kind === "storage" || s.B.kind === "tradeoff") &&
    textOk(s.B.reveal, 140) &&
    Array.isArray(s.outOfScope) &&
    s.outOfScope.length >= 1;
  add("shape", "決まった形で書けている", shapeOk, shapeOk ? "" : "欠けている項目、または長すぎる文がある");
  if (!shapeOk) return { ok: false, checks };
  // 2. 値
  const i = s.input;
  const valsOk = isPos(i.amplitude) && isPos(i.on) && isPos(s.sampleA?.R) && isPos(s.sampleA?.C) && isPos(s.B.factor) && (i.kind === "pulse" ? isPos(i.record) && i.record! > i.on : isPos(i.period) && i.on < i.period!);
  add("values", "値が正で、つじつまが合う", valsOk, valsOk ? "" : "0以下・欠け、または送る長さと周期・記録の長さの関係がおかしい");
  if (!valsOk) return { ok: false, checks };
  const f = s.B.factor;
  const factorOk = f >= 0.33 && f <= 3 && Math.abs(Math.log(f)) >= Math.log(1.3);
  add("factor", "Bの違いの大きさ（見本の0.33〜3倍、1.3倍以上の違い）", factorOk, `見本の ${f} 倍`);
  // 3. 型と入力の組み合わせ
  const comboOk =
    (s.robot.metric === "plateau" && s.B.kind === "storage" && i.kind === "pulse") ||
    (s.robot.metric === "cycleMean" && s.B.kind === "storage" && i.kind === "beats") ||
    (s.robot.metric === "halfTime" && s.B.kind === "tradeoff" && i.kind === "pulse");
  add("combo", "謎の型と入力・ロボの見る数字が合っている", comboOk, `${i.kind} / ${s.robot.metric} / ${s.B.kind}`);
  // 4. 言葉
  const allText = JSON.stringify(s);
  const banned = allText.match(BANNED);
  add("words", "病名・診断・治療・薬の量につながる言葉がない", !banned, banned ? `「${banned[0]}」を含む` : "");
  if (!factorOk || !comboOk || banned) return { ok: false, checks };
  // 5. 計算
  const pa = s.sampleA;
  const pb = paramsB(s);
  const tauMax = Math.max(pa.R * pa.C, pb.R * pb.C);
  let trace: Trace;
  if (i.kind === "pulse") {
    const tEnd = i.record!;
    const n = 400;
    const A = simulate(s, pa.R, pa.C, tEnd, n);
    const Bt = simulate(s, pb.R, pb.C, tEnd, n);
    trace = { t: A.t, a: A.y, b: Bt.y };
    const back = tEnd - i.on >= 3 * tauMax;
    add("record", "止めたあとも十分に記録する", back, `止めてから ${(tEnd - i.on).toPrecision(3)}`);
  } else {
    const n = 400;
    const A = steadyCycle(s, pa.R, pa.C, n);
    const Bt = steadyCycle(s, pb.R, pb.C, n);
    trace = { t: A.t, a: A.y, b: Bt.y };
  }
  const scale = Math.max(...trace.a.map(Math.abs), 1e-12);
  const robotTol = ROBOT_REL * scale;
  const seeTol = SEE_REL * scale;
  let robotA = 0;
  let robotB = 0;
  if (s.robot.metric === "plateau") {
    const k = trace.t.findIndex((x) => x >= i.on) - 1;
    robotA = trace.a[k]!;
    robotB = trace.b[k]!;
  } else if (s.robot.metric === "cycleMean") {
    const m = (y: number[]) => y.slice(0, -1).reduce((x, v) => x + v, 0) / (y.length - 1);
    robotA = m(trace.a);
    robotB = m(trace.b);
  } else {
    robotA = halfTime(trace.t, trace.a, i.on);
    robotB = halfTime(trace.t, trace.b, i.on);
  }
  const robotSame = s.robot.metric === "halfTime" ? Number.isFinite(robotA) && Math.abs(robotB - robotA) <= HALF_REL * robotA : Math.abs(robotB - robotA) <= robotTol;
  add("robot", "ロボの見る一つの数字では、AとBを区別できない", robotSame, `A ${robotA.toPrecision(4)}／B ${robotB.toPrecision(4)}`);
  let bestDiff = 0;
  let bestT = 0;
  trace.t.forEach((t, k) => {
    const d = trace.b[k]! - trace.a[k]!;
    if (Math.abs(d) > Math.abs(bestDiff)) {
      bestDiff = d;
      bestT = t;
    }
  });
  const visible = Math.abs(bestDiff) >= seeTol;
  add("visible", "別の時刻なら、違いが見える（高さの8%以上）", visible, `いちばん大きい差 ${bestDiff.toPrecision(3)}（${bestT.toPrecision(3)} ${i.timeUnit}）`);
  const ok = checks.every((c) => c.ok);
  const base = s.parts.base?.value ?? 0;
  const shifted: Trace = { t: trace.t, a: trace.a.map((v) => v + base), b: trace.b.map((v) => v + base) };
  return { ok, checks, trace: shifted, robotA: s.robot.metric === "halfTime" ? robotA : robotA + base, robotB: s.robot.metric === "halfTime" ? robotB : robotB + base, bestT, bestDiff, seeTol, robotTol };
}
