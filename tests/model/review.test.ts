// CLAUDE.md 第7章のテスト15〜18と、回路図の配線の照合（レビュー16で見つかった不整合の再発防止）
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { HIDDEN_CAUSES } from "../../scenarios/material1.js";
import { _sessionsForTest, handleApi } from "../../server/app.js";
import { buildPartnerInput } from "../../server/claude/partner.js";
import { circuitVoltageAfterStop, circuitVoltageDuringCharge, parallelVoltage, toCircuit } from "../../server/model/circuit.js";
import { BASE, DEPTH, ERROR, INTRO_OBSERVATION, TEST_TOLERANCE, judgeAgainstBase } from "../../server/model/public.js";
import { forceAfterPush, forceDuringPush } from "../../server/model/sls.js";
import { Session } from "../../server/session/session.js";
import { act2Answer, circuitSvg, runAct2, type Act2Run } from "../../src/act2.js";
import { STORY, directionOfTruth, storyFor } from "../../src/story.js";
import { allSignCombos, representativeTruths } from "./helpers.js";

describe("テスト15：いつもの検査の判定は嘘にならない", () => {
  it("隠れた範囲の全代表値で、誤差を最悪ケース（±100%・0）に置いても許容差の内側", () => {
    const base = forceAfterPush(BASE, INTRO_OBSERVATION.pushSeconds, INTRO_OBSERVATION.recordAt);
    let worst = 0;
    for (const t of representativeTruths()) {
      for (const sign of [-1, 0, 1]) {
        const measured = forceAfterPush(t.params, INTRO_OBSERVATION.pushSeconds, INTRO_OBSERVATION.recordAt) + sign * ERROR;
        const j = judgeAgainstBase(measured, base);
        worst = Math.max(worst, Math.abs(j.diff));
        expect(j.indistinguishable).toBe(true);
      }
    }
    expect(worst).toBeLessThanOrEqual(TEST_TOLERANCE);
  });

  it("乱数の種1〜1000（各隠れ原因）で、表示する差は実際の測定値から計算され、許容差の内側", () => {
    for (const c of HIDDEN_CAUSES) {
      for (let seed = 1; seed <= 1000; seed++) {
        const r = new Session("t", { seed, cause: c.id }).introResult();
        expect(r.diff).toBeCloseTo(r.force - r.base, 12);
        expect(r.indistinguishable).toBe(true);
        expect(r.tolerance).toBe(TEST_TOLERANCE);
      }
    }
  });

  it("許容差の外側なら「区別できない」にならない（固定表示ではない）", () => {
    expect(judgeAgainstBase(1.05, 1).indistinguishable).toBe(false);
    expect(judgeAgainstBase(0.95, 1).indistinguishable).toBe(false);
  });
});

describe("テスト16：答え合わせと第2幕の言葉の向きが、真の値の大小と一致する", () => {
  const expected = { instantUp: ["大きい", "小さい"], instantDown: ["小さい", "大きい"], relaxSlow: ["遅い", "速い"], relaxFast: ["速い", "遅い"] } as const;
  it("四つの原因それぞれ", () => {
    for (const t of representativeTruths()) {
      const d = directionOfTruth(t.params, BASE);
      expect(d).toBe(t.cause);
      const s = storyFor(t.params, BASE);
      const [yes, no] = expected[t.cause];
      expect(s.summary).toContain(`Aより${yes}`);
      expect(s.summary).not.toContain(`Aより${no}`);
    }
    // 第2幕の接続：遅い↔通りにくい、速い↔通りやすい
    expect(STORY.relaxSlow.membraneLink).toContain("通りにくい");
    expect(STORY.relaxFast.membraneLink).toContain("通りやすい");
    // 問いに答える前の文には、答え（通りやすさと戻る速さの向き）を書かない
    for (const k of Object.keys(STORY) as (keyof typeof STORY)[]) expect(STORY[k].membrane).not.toMatch(/通りやすい膜|通りにくい膜|時定数が(長|短)/);
    expect(STORY.relaxFast.summary).not.toContain("時間がかかる");
    // 回路：上乗せのかたさが大きい↔C1が小さい（C1=1/E1）
    expect(STORY.instantUp.circuit).toContain("C1 がAより小さく");
    expect(STORY.instantDown.circuit).toContain("C1 がAより大きく");
  });

  it("回路の説明の向きは、対応表で変換した値と一致する", () => {
    const a = toCircuit(BASE);
    for (const t of representativeTruths()) {
      const b = toCircuit(t.params);
      const s = storyFor(t.params, BASE).circuit;
      // R の大小の向きも文と一致する
      if (b.r > a.r) expect(s).toMatch(/抵抗 R[^。、]*?がAより大き/);
      if (b.r < a.r) expect(s).toMatch(/抵抗 R[^。、]*?がAより小さ/);
      if (t.cause === "relaxSlow") expect(b.r * b.c1).toBeGreaterThan(a.r * a.c1);
      if (t.cause === "relaxFast") expect(b.r * b.c1).toBeLessThan(a.r * a.c1);
      if (t.cause === "instantUp" || t.cause === "instantDown") expect(b.r * b.c1).toBeCloseTo(a.r * a.c1, 12);
      if (t.cause === "instantUp") expect(b.c1).toBeLessThan(a.c1);
      if (t.cause === "instantDown") expect(b.c1).toBeGreaterThan(a.c1);
    }
  });
});

describe("テスト17：第2幕の問いの判定は、「そのまま」と「通りやすい」の両方を実行したときだけ出る", () => {
  it("組み合わせごと", () => {
    const run = (p: Act2Run["perm"]) => runAct2(p);
    expect(act2Answer([])).toBeNull();
    expect(act2Answer([run("same")])).toBeNull();
    expect(act2Answer([run("easier")])).toBeNull();
    expect(act2Answer([run("harder"), run("same")])).toBeNull();
    expect(act2Answer([run("harder"), run("easier")])).toBeNull();
    expect(act2Answer([run("same"), run("easier")])).toBe("faster");
    expect(act2Answer([run("easier"), run("harder"), run("same")])).toBe("faster");
  });
});

function fakeReq(method: string, url: string, body?: unknown): IncomingMessage {
  const r = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(r, { method, url });
  return r;
}

function fakeRes(): { res: ServerResponse; out: () => { status: number; body: any } } {
  let status = 0;
  let text = "";
  const res = {
    writeHead: (s: number) => {
      status = s;
    },
    end: (t: string) => {
      text = t;
    },
  } as unknown as ServerResponse;
  return { res, out: () => ({ status, body: JSON.parse(text) }) };
}

async function call(method: string, url: string, body?: unknown) {
  const { res, out } = fakeRes();
  await handleApi(fakeReq(method, url, body), res);
  return out();
}

describe("テスト18：予想と理由は「押す」時点で保存され、記録とClaudeへの入力に残る", () => {
  it("予想を選ぶ→理由を書く→押す、の順でも理由が残る", async () => {
    const start = await call("POST", "/api/session", {});
    const id = start.body.view.sessionId as string;
    // 押すときに、予想と理由をまとめて送る
    const r = await call("POST", `/api/session/${id}/observe-curve`, { pushSeconds: 0.2, observationId: "obs-1", choice: "higher", reason: "すばやいと強く押し返しそう" });
    expect(r.status).toBe(200);
    const curve = r.body.view.curves[0];
    expect(curve.prediction).toEqual({ pushSeconds: 0.2, choice: "higher", reason: "すばやいと強く押し返しそう" });
    expect(typeof curve.predictionHit).toBe("boolean");
    const s = _sessionsForTest().get(id)!;
    expect(buildPartnerInput(s.publicView())).toContain("すばやいと強く押し返しそう");
  });

  it("「まだ分からない」も保存でき、正誤は出さない。本人の選択と確認した候補もClaudeへの入力に残る", () => {
    const s = new Session("t", { seed: 7, cause: "relaxSlow", value: 3 });
    s.saveCurvePrediction(1, "unknown", "");
    const c = s.observeCurve(1, "c1");
    expect(c.predictionHit).toBeNull();
    s.pickExcluded("c1", ["same", "overall"]);
    s.confirmCandidate("relax");
    const v = s.publicView();
    expect(v.curves[0]!.studentPick).toEqual(["same", "overall"]);
    expect(v.confirmedCandidates).toEqual(["relax"]);
    const input = buildPartnerInput(v);
    expect(input).toContain("学生が合わないと選んだ候補");
    expect(input).toContain("学生が確認した説明");
  });

  it("予想の正誤は、押し終わりの測定値と基準Aの差（許容差）で決まる", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = new Session("t", { seed, cause: "instantUp", value: 2 });
      s.saveCurvePrediction(0.2, "higher", "");
      const c = s.observeCurve(0.2, "c");
      const end = s.publicView().records.find((r) => r.id === "c@0")!;
      const j = judgeAgainstBase(end.force, forceAfterPush(BASE, 0.2, 0));
      expect(c.endDirection).toBe(j.indistinguishable ? "same" : j.diff > 0 ? "higher" : "lower");
      expect(c.predictionHit).toBe(c.endDirection === "higher");
    }
  });
});

describe("回路への持ち越し：Bの力と回路の電圧が一致する（流している間・止めた後・並列部分）", () => {
  it("全代表値", () => {
    const T = 1;
    const I = DEPTH / T;
    for (const t of representativeTruths()) {
      const c = toCircuit(t.params);
      for (const s of [0.1, 0.5, 1]) expect(circuitVoltageDuringCharge(c, I, s)).toBeCloseTo(forceDuringPush(t.params, T, s), 10);
      for (const h of [0, 0.5, 2, 5, 20]) {
        expect(circuitVoltageAfterStop(c, I, T, h)).toBeCloseTo(forceAfterPush(t.params, T, h), 10);
        // 並列部分＝力から E∞·変形 を引いた上乗せ分
        expect(parallelVoltage(c, I, T, T + h)).toBeCloseTo(forceAfterPush(t.params, T, h) - t.params.eInf * DEPTH, 10);
      }
    }
  });
});

// ---------- 回路図の配線の照合 ----------
type Pt = readonly [number, number];
type Seg = readonly [Pt, Pt];

/** SVG の path（M・L・H・V は導線、l は抵抗のぎざぎざ＝部品として除く）を線分にする */
function wireSegments(svg: string): Seg[] {
  const segs: Seg[] = [];
  for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
    const toks = m[1]!.match(/[MLHVl]|-?\d+(\.\d+)?/g) ?? [];
    let x = 0;
    let y = 0;
    let cmd = "";
    for (let i = 0; i < toks.length; ) {
      const t = toks[i]!;
      if (/[MLHVl]/.test(t)) {
        cmd = t;
        i++;
        continue;
      }
      const n = (k: number) => Number(toks[i + k]);
      if (cmd === "M") {
        x = n(0);
        y = n(1);
        i += 2;
        cmd = "L";
      } else if (cmd === "L") {
        segs.push([[x, y], [n(0), n(1)]]);
        x = n(0);
        y = n(1);
        i += 2;
      } else if (cmd === "H") {
        segs.push([[x, y], [n(0), y]]);
        x = n(0);
        i += 1;
      } else if (cmd === "V") {
        segs.push([[x, y], [x, n(0)]]);
        y = n(0);
        i += 1;
      } else if (cmd === "l") {
        x += n(0);
        y += n(1);
        i += 2;
      }
    }
  }
  return segs;
}

function onSeg(p: Pt, s: Seg): boolean {
  const [[x1, y1], [x2, y2]] = s;
  const cross = (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1);
  if (Math.abs(cross) > 1e-6) return false;
  return p[0] >= Math.min(x1, x2) - 1e-6 && p[0] <= Math.max(x1, x2) + 1e-6 && p[1] >= Math.min(y1, y2) - 1e-6 && p[1] <= Math.max(y1, y2) + 1e-6;
}

function touches(a: Seg, b: Seg): boolean {
  return onSeg(a[0], b) || onSeg(a[1], b) || onSeg(b[0], a) || onSeg(b[1], a);
}

/** 導線だけでつながっているか（部品を通らずに） */
function wired(svg: string, p: Pt, q: Pt): boolean {
  const segs = wireSegments(svg);
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (touches(segs[i]!, segs[j]!)) parent[find(i)] = find(j);
  const gp = new Set(segs.map((s, i) => (onSeg(p, s) ? find(i) : -1)).filter((x) => x >= 0));
  return segs.some((s, i) => onSeg(q, s) && gp.has(find(i)));
}

describe("回路図の配線が計算と同じ節点構成（C∞ と、C1・R の並列を直列）", () => {
  for (const lens of ["circuit", "membrane"] as const) {
    it(`${lens}：並列部分の左右の節点が、導線だけで直結していない（短絡がない）`, () => {
      const svg = circuitSvg(lens);
      expect(wired(svg, [300, 80], [440, 80])).toBe(false);
      // 右の節点は、戻り線で入口の下側につながる
      expect(wired(svg, [440, 80], [50, 145])).toBe(true);
      // 入口の上下が導線だけで直結していない
      expect(wired(svg, [50, 105], [50, 145])).toBe(false);
    });
  }
  it("circuit：入口の上側と並列部分の左の節点の間に C∞ がある（導線だけではつながらない）", () => {
    expect(wired(circuitSvg("circuit"), [50, 105], [300, 80])).toBe(false);
    expect(wired(circuitSvg("membrane"), [50, 105], [300, 80])).toBe(true);
  });
});

// ---------- レビュー18：テスト19・20・22 ----------
import { decisiveNote } from "../../src/story.js";

describe("テスト19：予想を選んだ時点で、手がかりの段階が「予想済み」へ進む", () => {
  it("下書きの予想があれば、初期の案内を繰り返さない", () => {
    const s = new Session("t", { seed: 3, cause: "relaxSlow", value: 2 });
    const first = s.nextTemplateHint();
    expect(first.text).toContain("予想しましょう");
    s.saveCurvePrediction(1, "higher", ""); // 画面で予想を選んだ（下書き）
    const second = s.nextTemplateHint();
    expect(second.text).not.toContain("まず、押す速さを選んで");
    expect(second.stage).toBeGreaterThanOrEqual(2);
  });
});

describe("テスト20：判断待ちの間、手がかりとClaudeへの入力に、その曲線の判定が出ない", () => {
  it("全隠れ原因・複数の種で", () => {
    for (const c of HIDDEN_CAUSES) {
      for (const seed of [1, 9, 42]) {
        const s = new Session("t", { seed, cause: c.id });
        s.saveCurvePrediction(1, "same", "");
        const rec = s.observeCurve(1, "c1");
        expect(s.awaitingPick).toBe(true);
        const g = s.publicView({ forGuidance: true });
        // 判断待ちの曲線の除外結果は伏せ、判定はその曲線の前のもの
        expect(g.curves[0]!.excluded).toEqual([]);
        expect(g.overall).not.toBe("narrowed");
        const input = buildPartnerInput(g);
        expect(input).toContain("本人の判断待ち");
        for (const id of rec.excluded) expect(input).not.toContain(`"比較器で合わなくなった候補":["${id}`);
        for (let k = 0; k < 4; k++) {
          const h = s.nextTemplateHint();
          expect(h.text).not.toContain("絞れました");
          for (const cand of [CANDIDATES.relax.label, CANDIDATES.instant.label]) expect(h.text).not.toContain(cand);
        }
        // 判断した後は、比較器の結果がそのまま渡る
        s.pickExcluded("c1", "unsure");
        expect(s.awaitingPick).toBe(false);
        expect(s.publicView({ forGuidance: true }).curves[0]!.excluded).toEqual(rec.excluded);
      }
    }
  });
});

describe("テスト22：答え合わせの「今回の決め手」は記録から作られる", () => {
  const mk = (p: { eInf: number; e1: number; tau: number }, T: 0.2 | 1 | 5, sign = 0) => {
    const recs = [{ id: "intro-B", pushSeconds: 1 as const, recordAt: 20 as const, force: forceAfterPush(p, 1, 20) }];
    for (const h of [0, 0.5, 2, 5, 20] as const) recs.push({ id: `c@${h}`, pushSeconds: T as 1, recordAt: h as 20, force: forceAfterPush(p, T, h) + sign * ERROR });
    return recs;
  };
  it("押し終わりの一点だけで決まる素材（E1=2, τ=1）では「分けきれず」と言わない", () => {
    const note = decisiveNote(mk({ eInf: 1, e1: 2, tau: 1 }, 1), "c", true);
    expect(note).toContain("一つに絞れました");
    expect(note).not.toContain("分けきれず");
  });
  it("押し終わりが同じになる素材（H2：E1=1, τ=3）では、途中まで比べたと書く", () => {
    const note = decisiveNote(mk({ eInf: 1, e1: 1, tau: 3 }, 1), "c", true);
    expect(note).toContain("分けきれず");
  });
  it("一つに絞れていなければ、そう書く", () => {
    expect(decisiveNote(mk({ eInf: 1, e1: 1, tau: 3 }, 1), "c", false)).toContain("まだ一つに絞りきれていません");
  });
});

// ---------- テスト21：候補の予測線 ----------
import { fitToEnd } from "../../server/model/fit.js";
import { CANDIDATES } from "../../server/model/public.js";

describe("テスト21：候補の予測線は公開範囲の中で押し終わりに合わせ、真の値に依存しない", () => {
  it("H2（E1=1, τ=3）の押し終わりに instant を合わせると E1≈1.345 になり、2秒後で離れる", () => {
    const y = forceAfterPush({ eInf: 1, e1: 1, tau: 3 }, 1, 0);
    const fit = fitToEnd("instant", 1, y);
    expect(fit.matched).toBe(true);
    expect(fit.value!).toBeCloseTo(1.34532, 4);
    expect(forceAfterPush(fit.params, 1, 0)).toBeCloseTo(y, 6);
    const gap2 = forceAfterPush({ eInf: 1, e1: 1, tau: 3 }, 1, 2) - forceAfterPush(fit.params, 1, 2);
    expect(gap2).toBeGreaterThan(0.3);
  });
  it("値は公開範囲の中にあり、届かなければ matched=false", () => {
    for (const id of ["overall", "instant", "relax"] as const) {
      const [lo, hi] = CANDIDATES[id].range!;
      for (const y of [0.5, 1.2, 1.63, 2.5, 9]) {
        const fit = fitToEnd(id, 1, y);
        expect(fit.value!).toBeGreaterThanOrEqual(lo);
        expect(fit.value!).toBeLessThanOrEqual(hi);
        if (fit.matched) expect(forceAfterPush(fit.params, 1, 0)).toBeCloseTo(y, 6);
      }
    }
    // relax は τ を最大にしても E1=1 の上乗せ分を超えられない
    expect(fitToEnd("relax", 1, 2.264).matched).toBe(false);
  });
  it("同じ証拠なら同じ線（隠れた原因によらない）", () => {
    const a = new Session("t", { seed: 5, cause: "relaxSlow", value: 3 });
    a.saveCurvePrediction(1, "same", "");
    a.observeCurve(1, "c");
    const y = a.publicView().records.find((r) => r.id === "c@0")!.force;
    expect(fitToEnd("instant", 1, y)).toEqual(fitToEnd("instant", 1, y));
    // fit.ts は秘密のモジュールを読み込まない
    const src = readFileSync("server/model/fit.ts", "utf8");
    expect(src).not.toMatch(/generator|scenarios|session/);
  });
});

describe("テスト21の補足：正しい説明の線は、最悪ケースの誤差でも測った記録から大きく外れない", () => {
  it("隠れた範囲の代表値・3つの押し方・誤差の端で、正しい候補の線と真の値の差が 2×誤差 以内", async () => {
    const { fitCandidate } = await import("../../server/model/fit.js");
    const { compare } = await import("../../server/model/comparator.js");
    for (const t of representativeTruths()) {
      for (const T of [0.2, 1, 5] as const) {
        for (const signs of allSignCombos(3)) {
          const recs = [{ id: "intro-B", pushSeconds: 1 as const, recordAt: 20 as const, force: forceAfterPush(t.params, 1, 20) + signs[0]! * ERROR }];
          ([0, 0.5, 2, 5, 20] as const).forEach((h, i) => recs.push({ id: `c@${h}`, pushSeconds: T as 1, recordAt: h as 20, force: forceAfterPush(t.params, T, h) + signs[1 + (i % 2)]! * ERROR }));
          const iv = compare(recs).candidates[t.correct].interval;
          const fit = fitCandidate(t.correct, T, recs[1]!.force, iv);
          for (const h of [0, 0.5, 2, 5, 20]) expect(Math.abs(forceAfterPush(fit.params, T, h) - forceAfterPush(t.params, T, h))).toBeLessThanOrEqual(2 * ERROR + 1e-6);
        }
      }
    }
  });
});

// ---------- テスト23〜27：離した後の戻り・写真・初回の予想・押し方ごとの差 ----------
import { dentAfterRelease, judgePhoto, recoveryParams, RECOVERY_TIMES, SHAPE_ERROR, SHAPE_TOLERANCE } from "../../server/model/recovery.js";
import { midDiffers } from "../../server/session/session.js";
import { pushSpeedTable } from "../../src/story.js";

describe("テスト23：離した後の戻りの解析解が、微分方程式の数値積分と一致する", () => {
  it("代表値・3つの押し方", () => {
    for (const t of representativeTruths()) {
      for (const T of [0.2, 1, 5]) {
        const p = t.params;
        // 押す→保つ（変形を指定）→離す（外力ゼロ）を、上乗せ分 σ1 と変形 x の微分方程式で数値積分する
        const dt = 1e-4;
        let x = 0;
        let s1 = 0;
        for (let time = 0; time < T + 20 - 1e-12; time += dt) {
          const v = time < T ? 1 / T : 0;
          x += v * dt;
          s1 += (p.e1 * v - s1 / p.tau) * dt;
        }
        // 離した瞬間：外力ゼロになるよう瞬時に変形が戻る（σ1 も E1 倍だけ変わる）
        const F = p.eInf * x + s1;
        const jump = F / (p.eInf + p.e1);
        x -= jump;
        s1 -= p.e1 * jump;
        const checks = new Map<number, number>();
        for (let h = 0; h <= 6 + 1e-9; h += dt) {
          for (const want of [0, 1, 3, 6]) if (Math.abs(h - want) < dt / 2) checks.set(want, x);
          // 外力ゼロ：E∞x + σ1 = 0 を保ちながら σ1 が緩和する
          const xdot = s1 / (p.tau * (p.eInf + p.e1)); // E∞ẋ + σ̇1 = 0, σ̇1 = E1ẋ − σ1/τ → ẋ = σ1/(τ(E∞+E1))
          x += xdot * dt;
          s1 = -p.eInf * x;
        }
        for (const [h, num] of checks) expect(dentAfterRelease(p, T as 1, h)).toBeCloseTo(num, 2);
      }
    }
  });
});

describe("テスト24：形の戻りだけでは区別できない候補の組がある（力は違う）", () => {
  it("E∞=2,E1=1 と E∞=1,E1=0.5", () => {
    const H1 = { eInf: 2, e1: 1, tau: 1 };
    const H2 = { eInf: 1, e1: 0.5, tau: 1 };
    for (const h of [0, 0.5, 2, 5, 20]) expect(dentAfterRelease(H1, 1, h)).toBeCloseTo(dentAfterRelease(H2, 1, h), 9);
    expect(recoveryParams(H1, 1).forceBefore - recoveryParams(H2, 1).forceBefore).toBeGreaterThan(0.9);
  });
});

describe("テスト25：写真で違いが見える時刻があり、最後は区別できない（最悪の誤差でも）", () => {
  it("隠れた範囲の全代表値・3つの押し方", () => {
    for (const t of representativeTruths()) {
      for (const T of [0.2, 1, 5] as const) {
        const early = RECOVERY_TIMES.filter((h) => h >= 0.5 && h <= 6);
        // 誤差を差が縮む側に最大まで置いても、どこかで判定幅を超える
        const seen = early.some((h) => {
          const d = dentAfterRelease(t.params, T, h) - dentAfterRelease(BASE, T, h);
          const worst = d - Math.sign(d) * SHAPE_ERROR;
          return judgePhoto(dentAfterRelease(BASE, T, h) + worst, dentAfterRelease(BASE, T, h)).distinguishable;
        });
        expect(seen).toBe(true);
        // 40秒後は、誤差を差が広がる側に置いても判定幅の内側
        const d40 = dentAfterRelease(t.params, T, 40) - dentAfterRelease(BASE, T, 40);
        expect(Math.abs(d40) + SHAPE_ERROR).toBeLessThanOrEqual(SHAPE_TOLERANCE);
      }
    }
  });
  it("写真の判定はセッションの記録から計算される（新しい誤差を引かない）", () => {
    const s = new Session("t", { seed: 4, cause: "relaxSlow", value: 3 });
    s.saveCurvePrediction(1, "midDiffer", "");
    const c = s.observeCurve(1, "c");
    const p1 = s.takePhoto("c", 2);
    const p2 = s.takePhoto("c", 2);
    expect(p1.dentB).toBe(p2.dentB);
    expect(p1.dentB).toBe(c.recovery.find((r) => r.h === 2)!.dent);
    expect(() => s.takePhoto("c", 2.25)).toThrow();
    expect(buildPartnerInput(s.publicView({ forGuidance: true }))).toContain("証拠写真");
  });
});

describe("テスト26：初回の三択予想の正誤は、0.5・2・5秒後のどれかが許容差を超えたかで決まる", () => {
  it("例", () => {
    const pts = (d: number[]) => [0, 0.5, 2, 5, 20].map((recordAt, i) => ({ recordAt, force: 1 + (d[i] ?? 0), baseForce: 1 }));
    expect(midDiffers(pts([0.5, 0, 0, 0, 0]))).toBe(false); // 押し終わりだけ違うのは「途中」ではない
    expect(midDiffers(pts([0, 0, 0.04, 0, 0]))).toBe(true);
    expect(midDiffers(pts([0, 0.02, -0.03, 0.01, 0.5]))).toBe(false); // 20秒後は含めない
    const s = new Session("t", { seed: 11, cause: "relaxSlow", value: 3 });
    s.saveCurvePrediction(1, "midDiffer", "");
    expect(s.observeCurve(1, "c").predictionHit).toBe(true);
  });
});

describe("テスト27：押し方ごとの差の表で、最も差が大きい押し方が計算と一致する", () => {
  it("四つの原因の代表値", () => {
    // 上乗せのかたさの違いは、すばやく押すと最も見えやすい。やわらぐ時間の違いは、すばやく押すとかえって見えにくい
    const expectBest: Record<string, 0.2 | 1 | 5> = { instantUp: 0.2, instantDown: 0.2 };
    for (const t of representativeTruths()) {
      const tb = pushSpeedTable(t.params, BASE);
      const manual = ([0.2, 1, 5] as const).reduce((a, b) => (Math.abs(forceAfterPush(t.params, b, 0) - forceAfterPush(BASE, b, 0)) > Math.abs(forceAfterPush(t.params, a, 0) - forceAfterPush(BASE, a, 0)) ? b : a));
      expect(tb.best).toBe(manual);
      if (expectBest[t.cause]) expect(tb.best).toBe(expectBest[t.cause]);
      else expect(tb.best).not.toBe(0.2);
    }
  });
});
