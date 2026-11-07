// つづきの謎の生成（CLAUDE.md 1e-4）。①このページを開いた人の Claude（公開ページの sample）②（サーバーから API：キーが入りしだい）
// ③どちらも使えなければ、AIが 11/5 に生成した記録（tests/fixtures/ai-nets の確かめに通ったもの）。どれも確かめは計算プログラムがその場で行う。
import { verifyNetPuzzle, type Check, type NetPuzzleSpec, type NetVerdict } from "../../server/model/partsNet.js";
import { netPrompt, netRetryPrompt } from "../../server/puzzle/netPrompt.js";
import { reviewPrompt, reviewRetryPrompt } from "../../server/puzzle/reviewPrompt.js";
import { checkReview, reviewFailures, type Review } from "../../server/model/review.js";
import VerifyWorker from "./verifyWorker.ts?worker&inline";
import heart from "../../tests/fixtures/ai-nets/heart.v4.json";
import lung from "../../tests/fixtures/ai-nets/lung.v4.json";
import temp from "../../tests/fixtures/ai-nets/temp.v4.json";
import kidney from "../../tests/fixtures/ai-nets/kidney.v4.json";
import chain from "../../tests/fixtures/ai-nets/chain-heart-lung.v4.json";
import rvHeart from "../../tests/fixtures/ai-reviews/heart.json";
import rvLung from "../../tests/fixtures/ai-reviews/lung.json";
import rvTemp from "../../tests/fixtures/ai-reviews/temp.json";
import rvKidney from "../../tests/fixtures/ai-reviews/kidney.json";
import rvChain from "../../tests/fixtures/ai-reviews/chain-heart-lung.json";

export type MadeSource = "live" | "record";
export interface Attempt {
  spec: unknown;
  verdict: NetVerdict;
  /** 先生役の Claude の確かめ（計算プログラムに通ったときだけ。CLAUDE.md 1e-5） */
  review?: Review;
}
/** この一回が通ったか（計算プログラムと先生役の両方） */
export const attemptOk = (a: Attempt): boolean => a.verdict.ok && !!a.review?.pass;
export interface Made {
  spec: NetPuzzleSpec;
  verdict: NetVerdict;
  review: Review;
  source: MadeSource;
  attempts: Attempt[];
  topic: string;
}

interface Rec {
  topic: string;
  output: unknown;
  expectOk: boolean;
  /** 先生役の Claude の出力の記録（tests/fixtures/ai-reviews） */
  review?: unknown;
}
const REVIEWS: unknown[] = [rvHeart, rvLung, rvTemp, rvKidney, rvChain].map((r) => (r as { output: unknown }).output);
const RECORDS = ([heart, lung, temp, kidney, chain] as unknown as Rec[]).map((r, i) => ({ ...r, review: REVIEWS[i] })).filter((r) => r.expectOk);

type Sample = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & { json: (input: string, opts?: Record<string, unknown>) => Promise<unknown> };
let samplePromise: Promise<Sample | null> | null = null;
/** 公開ページで開いたときだけ使える（開いた人の Claude）。使えなければ null */
export function getSample(): Promise<Sample | null> {
  if (!samplePromise) {
    const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
    samplePromise = c ? (c.use("sample").catch(() => null) as Promise<Sample | null>) : Promise.resolve(null);
  }
  return samplePromise;
}

/** 記録の中に、この前の謎・この題材のものがあるか */
export function recordFor(topic: string, prev: NetPuzzleSpec): Rec | undefined {
  return RECORDS.find((r) => r.topic === topic && (r.output as NetPuzzleSpec).link?.fromTitle === prev.title);
}

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const waiting = new Map<number, { res: (v: NetVerdict) => void; spec: unknown; prev?: NetPuzzleSpec }>();
/** 裏の処理が使えないとき（公開ページの制限など）は、待っているものをその場で確かめる */
function fallBack(): void {
  workerBroken = true;
  worker?.terminate();
  worker = null;
  for (const [id, w] of waiting) {
    waiting.delete(id);
    w.res(verifyNetPuzzle(w.spec, w.prev));
  }
}
/** 確かめ（裏の処理で。使えなければその場で） */
export function verifyAsync(spec: unknown, prev?: NetPuzzleSpec): Promise<NetVerdict> {
  if (workerBroken) return new Promise((res) => setTimeout(() => res(verifyNetPuzzle(spec, prev)), 30));
  try {
    if (!worker) {
      worker = new VerifyWorker();
      worker.onmessage = (e: MessageEvent<{ id: number; verdict?: NetVerdict; error?: string }>) => {
        const w = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        if (w) w.res(e.data.verdict ?? verifyNetPuzzle(w.spec, w.prev));
      };
      worker.onerror = () => fallBack();
      worker.onmessageerror = () => fallBack();
    }
    const id = ++seq;
    return new Promise((res) => {
      waiting.set(id, { res, spec, prev });
      worker!.postMessage({ id, spec, prev });
      // 応答が来ないまま長く止まらないように（心臓でも裏の処理なら十数秒以内）
      setTimeout(() => {
        if (waiting.has(id)) fallBack();
      }, 45000);
    });
  } catch {
    workerBroken = true;
    return Promise.resolve(verifyNetPuzzle(spec, prev));
  }
}

export interface MakeHooks {
  onStatus: (s: string, who: "cl" | "calc" | "ai" | "teach") => void;
  /** 確かめが一回終わるたびに呼ぶ（画面が、落ちた理由と作り直しを見せるため） */
  onAttempt?: (a: Attempt, index: number) => void;
  /** 計算プログラムに通ったところ（先生役の確かめを待つあいだ、計算の結果を見せるため） */
  onVerified?: (a: Attempt, index: number) => void;
  signal?: AbortSignal;
}

/** 題材と前の謎から、次の謎をつくる。組み立て役 → 計算プログラム → 先生役の Claude。
 *  どちらかに落ちたら理由を戻して一度だけ作り直す。live が使えなければ記録（先生役の出力も記録）。 */
export async function makeNext(topic: string, prev: NetPuzzleSpec, h: MakeHooks): Promise<{ made: Made | null; attempts: Attempt[] }> {
  const sample = await getSample();
  const attempts: Attempt[] = [];
  if (sample) {
    let failed: Check[] = [];
    let last: unknown = null;
    for (let k = 0; k < 2; k++) {
      h.onStatus(k === 0 ? "Claude が、部品箱から部品を選んで模型を組み立てています。" : "落ちた理由を伝えて、一度だけ組み立て直してもらっています。", "ai");
      const spec = k === 0 ? await sample.json(netPrompt(topic, prev), { signal: h.signal, cache: false }) : await sample.json(netRetryPrompt(topic, prev, last, failed), { signal: h.signal, cache: false });
      last = spec;
      h.onStatus("計算プログラムが、組み立てた模型を計算して確かめています。", "calc");
      const verdict = await verifyAsync(spec, prev);
      const at: Attempt = { spec, verdict };
      if (verdict.ok) {
        h.onVerified?.(at, k);
        h.onStatus("計算には通った。次に、先生役の Claude が、体の見立てと出典が合っているかを確かめています。", "teach");
        const raw = await sample.json(reviewPrompt(spec as NetPuzzleSpec), { signal: h.signal, cache: false }).catch(() => null);
        at.review = checkReview(raw, spec as NetPuzzleSpec);
        // 形が読めなかったのは先生役の書き方の問題なので、組み立て直しではなく、先生役に一度だけ書き直してもらう
        if (!at.review.readable) {
          const raw2 = await sample.json(reviewRetryPrompt(spec as NetPuzzleSpec, at.review.problems), { signal: h.signal, cache: false }).catch(() => null);
          at.review = checkReview(raw2, spec as NetPuzzleSpec);
        }
      }
      attempts.push(at);
      h.onAttempt?.(at, k);
      if (attemptOk(at)) return { made: { spec: spec as NetPuzzleSpec, verdict, review: at.review!, source: "live", attempts, topic }, attempts };
      failed = verdict.ok ? reviewFailures(at.review!) : verdict.checks.filter((c) => !c.ok);
    }
    return { made: null, attempts };
  }
  const rec = recordFor(topic, prev);
  if (!rec) return { made: null, attempts };
  h.onStatus("この場ではAIを呼べないので、AIが組み立てた記録を使います。確かめは、いま計算プログラムが行います。", "calc");
  const verdict = await verifyAsync(rec.output, prev);
  const at: Attempt = { spec: rec.output, verdict };
  if (verdict.ok) at.review = checkReview(rec.review, rec.output as NetPuzzleSpec);
  attempts.push(at);
  h.onAttempt?.(at, 0);
  return { made: attemptOk(at) ? { spec: rec.output as NetPuzzleSpec, verdict, review: at.review!, source: "record", attempts, topic } : null, attempts };
}
