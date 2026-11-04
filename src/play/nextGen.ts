// つづきの謎の生成（CLAUDE.md 1e-4）。①このページを開いた人の Claude（公開ページの sample）②（サーバーから API：キーが入りしだい）
// ③どちらも使えなければ、AIが 11/5 に生成した記録（tests/fixtures/ai-nets の確かめに通ったもの）。どれも確かめは計算プログラムがその場で行う。
import { verifyNetPuzzle, type Check, type NetPuzzleSpec, type NetVerdict } from "../../server/model/partsNet.js";
import { netPrompt, netRetryPrompt } from "../../server/puzzle/netPrompt.js";
import VerifyWorker from "./verifyWorker.ts?worker&inline";
import heart from "../../tests/fixtures/ai-nets/heart.v4.json";
import lung from "../../tests/fixtures/ai-nets/lung.v4.json";
import temp from "../../tests/fixtures/ai-nets/temp.v4.json";
import kidney from "../../tests/fixtures/ai-nets/kidney.v4.json";
import chain from "../../tests/fixtures/ai-nets/chain-heart-lung.v4.json";

export type MadeSource = "live" | "record";
export interface Attempt {
  spec: unknown;
  verdict: NetVerdict;
}
export interface Made {
  spec: NetPuzzleSpec;
  verdict: NetVerdict;
  source: MadeSource;
  attempts: Attempt[];
  topic: string;
}

interface Rec {
  topic: string;
  output: unknown;
  expectOk: boolean;
}
const RECORDS = ([heart, lung, temp, kidney, chain] as unknown as Rec[]).filter((r) => r.expectOk);

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
let seq = 0;
const waiting = new Map<number, (v: NetVerdict) => void>();
/** 確かめ（裏の処理で。使えなければその場で） */
export function verifyAsync(spec: unknown, prev?: NetPuzzleSpec): Promise<NetVerdict> {
  try {
    if (!worker) {
      worker = new VerifyWorker();
      worker.onmessage = (e: MessageEvent<{ id: number; verdict?: NetVerdict; error?: string }>) => {
        const f = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        if (f) f(e.data.verdict ?? verifyNetPuzzle(spec, prev));
      };
    }
    const id = ++seq;
    return new Promise((res) => {
      waiting.set(id, res);
      worker!.postMessage({ id, spec, prev });
    });
  } catch {
    return Promise.resolve(verifyNetPuzzle(spec, prev));
  }
}

export interface MakeHooks {
  onStatus: (s: string, who: "cl" | "calc" | "ai") => void;
  signal?: AbortSignal;
}

/** 題材と前の謎から、次の謎をつくる。live が使えなければ記録。どれも確かめに通らなければ null */
export async function makeNext(topic: string, prev: NetPuzzleSpec, h: MakeHooks): Promise<{ made: Made | null; attempts: Attempt[] }> {
  const sample = await getSample();
  const attempts: Attempt[] = [];
  if (sample) {
    h.onStatus("Claude が、部品箱から部品を選んで模型を組み立てています。", "ai");
    let spec = await sample.json(netPrompt(topic, prev), { signal: h.signal, cache: false });
    h.onStatus("計算プログラムが、組み立てた模型を計算して確かめています。", "calc");
    let verdict = await verifyAsync(spec, prev);
    attempts.push({ spec, verdict });
    if (!verdict.ok) {
      const failed: Check[] = verdict.checks.filter((c) => !c.ok);
      h.onStatus("確かめに通らなかった点を伝えて、一度だけ組み立て直してもらっています。", "ai");
      spec = await sample.json(netRetryPrompt(topic, prev, spec, failed), { signal: h.signal, cache: false });
      verdict = await verifyAsync(spec, prev);
      attempts.push({ spec, verdict });
    }
    return { made: verdict.ok ? { spec: spec as NetPuzzleSpec, verdict, source: "live", attempts, topic } : null, attempts };
  }
  const rec = recordFor(topic, prev);
  if (!rec) return { made: null, attempts };
  h.onStatus("この場ではAIを呼べないので、AIが11/5に組み立てた記録を使います。確かめは、いま計算プログラムが行います。", "calc");
  const verdict = await verifyAsync(rec.output, prev);
  attempts.push({ spec: rec.output, verdict });
  return { made: verdict.ok ? { spec: rec.output as NetPuzzleSpec, verdict, source: "record", attempts, topic } : null, attempts };
}
