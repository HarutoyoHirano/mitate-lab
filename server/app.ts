// API：応答は Session.publicView()（公開型と証拠型だけ）から組み立てる。秘密は finish の解説でだけ返す。
import { randomInt, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HIDDEN_CAUSES, type HiddenCauseId } from "../scenarios/material1.js";
import { isCandidateId, isPushSeconds, isRecordAt, type CandidateId, type ObservationSpec, type PushSeconds } from "./model/public.js";
import { Session, SessionError, type PredictionChoice, type Reflection } from "./session/session.js";
import { claudeHint, claudeObserve, claudeTranslate, claudeAvailable } from "./claude/partner.js";

const MAX_SESSIONS = 500;
const sessions = new Map<string, Session>();

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 10_000) reject(new SessionError("リクエストが大きすぎます", 413));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        const v = JSON.parse(data);
        resolve(v && typeof v === "object" ? v : {});
      } catch {
        reject(new SessionError("JSONが正しくない"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function specFrom(body: Record<string, unknown>): ObservationSpec {
  const pushSeconds = Number(body.pushSeconds);
  const recordAt = Number(body.recordAt);
  if (!isPushSeconds(pushSeconds) || !isRecordAt(recordAt)) throw new SessionError("許可されていない押し方・記録時刻です");
  return { pushSeconds, recordAt };
}

function pushFrom(body: Record<string, unknown>): PushSeconds {
  const T = Number(body.pushSeconds);
  if (!isPushSeconds(T)) throw new SessionError("許可されていない押し方です");
  return T;
}

function getSession(id: string): Session {
  const s = sessions.get(id);
  if (!s) throw new SessionError("セッションが見つかりません", 404);
  return s;
}

export function createSession(body: Record<string, unknown>): Session {
  const pass = process.env.TEACHER_PASSPHRASE;
  const teacher = !!pass && typeof body.teacherPassphrase === "string" && body.teacherPassphrase === pass;
  if (body.teacherPassphrase !== undefined && !teacher) throw new SessionError("合言葉が違います", 403);
  const cause = teacher && typeof body.cause === "string" ? (body.cause as HiddenCauseId) : undefined;
  if (cause && !HIDDEN_CAUSES.some((c) => c.id === cause)) throw new SessionError("指定された原因がありません");
  const seed = teacher && Number.isInteger(body.seed) ? Number(body.seed) : randomInt(1, 2 ** 31 - 1);
  const value = teacher && typeof body.value === "number" ? body.value : undefined;
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
  const s = new Session(randomUUID(), { seed, cause, value, teacherMode: teacher, maxHints: envInt("MAX_HINTS_PER_SESSION", 10) });
  sessions.set(s.id, s);
  return s;
}

/** /api/ で始まる要求を処理する。処理したら true */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  try {
    const parts = url.pathname.split("/").filter(Boolean); // ["api", "session", id, action]
    if (req.method === "GET" && url.pathname === "/api/status") {
      send(res, 200, { claude: claudeAvailable(), causes: HIDDEN_CAUSES.map((c) => c.id) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/session") {
      const s = createSession(await readBody(req));
      send(res, 200, { view: s.publicView() });
      return true;
    }
    if (parts[0] !== "api" || parts[1] !== "session" || !parts[2]) throw new SessionError("見つかりません", 404);
    const s = getSession(parts[2]);
    const action = parts[3] ?? "";
    if (req.method === "GET" && action === "") {
      send(res, 200, { view: s.publicView() });
      return true;
    }
    if (req.method !== "POST") throw new SessionError("見つかりません", 404);
    const body = await readBody(req);
    switch (action) {
      case "prediction": {
        s.savePrediction(specFrom(body), body.choice as PredictionChoice, typeof body.reason === "string" ? body.reason : "");
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "observe": {
        const rec = s.observe(specFrom(body), String(body.observationId ?? ""));
        send(res, 200, { view: s.publicView(), recordId: rec.id });
        return true;
      }
      case "curve-prediction": {
        s.saveCurvePrediction(pushFrom(body), body.choice as PredictionChoice, typeof body.reason === "string" ? body.reason : "");
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "observe-curve": {
        // 予想と理由は「押す」時点でまとめて保存する（画面に書いた内容と記録を一致させる）
        if (body.choice !== undefined) s.saveCurvePrediction(pushFrom(body), body.choice as PredictionChoice, typeof body.reason === "string" ? body.reason : "");
        const rec = s.observeCurve(pushFrom(body), String(body.observationId ?? ""));
        send(res, 200, { view: s.publicView(), curveId: rec.id });
        return true;
      }
      case "claude-observe": {
        if (body.choice !== undefined) s.saveCurvePrediction(pushFrom(body), body.choice as PredictionChoice, typeof body.reason === "string" ? body.reason : "");
        const out = await claudeObserve(s, pushFrom(body), String(body.observationId ?? ""));
        send(res, 200, { view: s.publicView(), recordId: out.recordId, note: out.note, byClaude: out.byClaude });
        return true;
      }
      case "pick": {
        const pick = body.pick === "unsure" ? "unsure" : Array.isArray(body.pick) ? (body.pick as unknown[]).filter(isCandidateId) : null;
        if (!pick) throw new SessionError("説明の選び方が正しくない");
        s.pickExcluded(String(body.curveId ?? ""), pick as CandidateId[] | "unsure");
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "run": {
        const rec = s.run(Number(body.period));
        send(res, 200, { view: s.publicView(), runId: rec.id });
        return true;
      }
      case "run-photo": {
        s.takeRunPhoto(String(body.runId ?? ""), Number(body.step), String(body.phase ?? "") as never);
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "photo": {
        s.takePhoto(String(body.curveId ?? ""), Number(body.h));
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "confirm": {
        if (!isCandidateId(body.candidateId)) throw new SessionError("候補が正しくない");
        s.confirmCandidate(body.candidateId);
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "measure-a": {
        s.measureA(specFrom(body), String(body.measurementId ?? randomUUID()));
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "hint": {
        const hint = await claudeHint(s);
        send(res, 200, { view: s.publicView(), hint });
        return true;
      }
      case "words": {
        const text = String(body.text ?? "").slice(0, envInt("MAX_FREE_TEXT_CHARS", 200));
        s.addStudentWords(text);
        const translation = await claudeTranslate(s, text);
        send(res, 200, { view: s.publicView(), translation });
        return true;
      }
      case "reflection": {
        s.saveReflection(body as unknown as Reflection);
        send(res, 200, { view: s.publicView() });
        return true;
      }
      case "finish": {
        const debrief = s.finish();
        send(res, 200, { view: s.publicView(), debrief });
        return true;
      }
      default:
        throw new SessionError("見つかりません", 404);
    }
  } catch (e) {
    if (e instanceof SessionError) send(res, e.status, { error: e.message });
    else {
      console.error("APIエラー", e instanceof Error ? e.message : "不明");
      send(res, 500, { error: "サーバーで問題が起きました" });
    }
    return true;
  }
}

/** テスト用 */
export function _sessionsForTest(): Map<string, Session> {
  return sessions;
}
