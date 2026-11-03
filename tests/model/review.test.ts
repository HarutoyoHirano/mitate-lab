// CLAUDE.md 第7章のテスト15〜18と、回路図の配線の照合（レビュー16で見つかった不整合の再発防止）
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
import { representativeTruths } from "./helpers.js";

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
