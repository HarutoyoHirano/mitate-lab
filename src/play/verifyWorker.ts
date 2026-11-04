// つづきの謎の確かめを、画面を止めずに裏で計算する（CLAUDE.md 1e-4）
import { verifyNetPuzzle, type NetPuzzleSpec } from "../../server/model/partsNet.js";

self.onmessage = (e: MessageEvent<{ id: number; spec: unknown; prev?: NetPuzzleSpec }>) => {
  const { id, spec, prev } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, verdict: verifyNetPuzzle(spec, prev) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
