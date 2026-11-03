// Claude（作品内のAI）＝隠れた正解を知らない実験の相棒。
// 入力は publicView() から許可リストで組み立てる（公開型と証拠型だけ）。
// 出力は構造化し、数字を含む自由文・存在しないID・範囲外の観察提案は破棄して定型ヒントに戻す。
import Anthropic from "@anthropic-ai/sdk";
import { CANDIDATE_IDS, isCandidateId, isPushSeconds, isRecordAt, type CandidateId, type ObservationSpec } from "../model/public.js";
import { specText, type Hint } from "../session/hints.js";
import type { PublicSessionView, Session } from "../session/session.js";

export interface PartnerOutput {
  readonly evidenceIds: string[];
  readonly interpretation: string;
  readonly nextSuggestion: string;
  readonly hintStage: 1 | 2 | 3 | 4;
  readonly candidateIds?: CandidateId[];
  readonly proposedObservation?: ObservationSpec;
}

export interface Translation {
  readonly candidateIds: CandidateId[];
  readonly confirmQuestion: string;
  readonly source: "claude" | "template";
}

/** 差し替え可能な呼び出し口（テストでは偽物を入れる） */
export type PartnerCaller = (system: string, user: string, tool: Anthropic.Tool) => Promise<unknown>;

let caller: PartnerCaller | null = null;
let inFlight = 0;

export function setPartnerCaller(c: PartnerCaller | null): void {
  caller = c;
}

function defaultCaller(): PartnerCaller | null {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL;
  if (!key || !model) return null;
  const client = new Anthropic({ apiKey: key, timeout: 20_000, maxRetries: 1 });
  return async (system, user, tool) => {
    const msg = await client.messages.create({
      model,
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    return block && block.type === "tool_use" ? block.input : null;
  };
}

export function claudeAvailable(): boolean {
  return !!(caller ?? defaultCaller());
}

const SYSTEM = `あなたは「ミカタ・ラボ」の実験の相棒「Claude（AI）」です。
学生は、押して待つと同じ力に落ち着く二つの仮想素材AとBの違いを、押す時間と記録する時刻を選んで調べています。
あなたは隠れた正解を知りません。学生と同じ証拠と、プログラムが計算した判定・実験計画の支援だけを見ています。

守ること：
- 文章に数字（算用数字・全角数字）を書かない。値は画面が証拠IDから表示する。値に触れたいときは証拠IDを evidenceIds に入れ、「この記録」「押し終わった直後の記録」のように言葉で指す
- 正解を言わない。判定の言葉（全体の状態・候補ごとの状態）は、与えられたものをそのまま使う
- 計画支援の結果（どの観察で分かれるか）は、ヒントの段階が三以上のときだけ使う
- 学生の予想や理由に応え、次にどこを見ると説明が分かれるかを問い返す。一度に一つの問いにする
- 素材の切り分けと、力学・電気・化学・生物の見方の言い直し以外の話題には応じない
- 医療の診断や機器の操作の話はしない
- やさしい日本語で、二、三文以内`;

function digitsIn(s: string): boolean {
  return /[0-9０-９]/.test(s);
}

/** Claudeへの入力（許可リスト）。秘密の型はここに来ない */
export function buildPartnerInput(view: PublicSessionView): string {
  const input = {
    基準素材A: view.base,
    誤差の幅: view.error,
    全体の状態: view.overallLabel,
    候補: view.candidates.map((c) => ({ id: c.id, 名前: c.label, 状態: c.statusLabel })),
    記録: view.records.map((r) => ({
      証拠ID: r.id,
      押す時間: r.pushSeconds,
      記録時刻: r.recordAt,
      Bの力: Math.round(r.force * 1000) / 1000,
      同じ押し方でのAの予測: Math.round(r.baseForce * 1000) / 1000,
      学生の予想: r.prediction?.choice ?? null,
      学生の理由: r.prediction?.reason ?? null,
      この記録で合わなくなった候補: r.excluded,
    })),
    保存中の予想: view.pendingPrediction,
    ヒントの段階: view.hintStage,
    計画支援: view.hintStage >= 3 ? view.plan : "（段階三以上で表示）",
    学生の言葉: view.studentWords.slice(-3),
  };
  return JSON.stringify(input);
}

const RESPOND_TOOL: Anthropic.Tool = {
  name: "respond",
  description: "学生への応答を構造化して返す",
  input_schema: {
    type: "object",
    properties: {
      evidenceIds: { type: "array", items: { type: "string" }, description: "根拠にした証拠ID" },
      interpretation: { type: "string", description: "今の証拠の読み方（数字を書かない）" },
      nextSuggestion: { type: "string", description: "次に考えてほしい問い（数字を書かない）" },
      hintStage: { type: "integer", enum: [1, 2, 3, 4] },
      candidateIds: { type: "array", items: { type: "string", enum: [...CANDIDATE_IDS] } },
      proposedObservation: {
        type: "object",
        properties: { pushSeconds: { type: "number", enum: [0.2, 1, 5] }, recordAt: { type: "number", enum: [0, 0.5, 2, 5, 20] } },
        required: ["pushSeconds", "recordAt"],
      },
    },
    required: ["evidenceIds", "interpretation", "nextSuggestion", "hintStage"],
  },
};

const TRANSLATE_TOOL: Anthropic.Tool = {
  name: "translate",
  description: "学生の説明を、検証できる候補IDに翻訳し、確認の問いを返す",
  input_schema: {
    type: "object",
    properties: {
      candidateIds: { type: "array", items: { type: "string", enum: [...CANDIDATE_IDS] } },
      confirmQuestion: { type: "string", description: "学生に確認する問い（数字を書かない）" },
    },
    required: ["candidateIds", "confirmQuestion"],
  },
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; reason: "digits" | "invalid" };

/** Claude出力の検証（テスト12） */
export function validatePartnerOutput(raw: unknown, view: PublicSessionView): ValidationResult<PartnerOutput> {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid" };
  const o = raw as Record<string, unknown>;
  const ids = new Set(view.records.map((r) => r.id));
  if (!Array.isArray(o.evidenceIds) || !o.evidenceIds.every((x) => typeof x === "string" && ids.has(x)))
    return { ok: false, reason: "invalid" };
  if (typeof o.interpretation !== "string" || typeof o.nextSuggestion !== "string") return { ok: false, reason: "invalid" };
  if (![1, 2, 3, 4].includes(o.hintStage as number)) return { ok: false, reason: "invalid" };
  if (o.candidateIds !== undefined && !(Array.isArray(o.candidateIds) && o.candidateIds.every(isCandidateId)))
    return { ok: false, reason: "invalid" };
  let proposed: ObservationSpec | undefined;
  if (o.proposedObservation !== undefined) {
    const p = o.proposedObservation as Record<string, unknown>;
    if (!p || !isPushSeconds(p.pushSeconds) || !isRecordAt(p.recordAt)) return { ok: false, reason: "invalid" };
    proposed = { pushSeconds: p.pushSeconds, recordAt: p.recordAt };
  }
  if (digitsIn(o.interpretation) || digitsIn(o.nextSuggestion)) return { ok: false, reason: "digits" };
  return {
    ok: true,
    value: {
      evidenceIds: o.evidenceIds as string[],
      interpretation: o.interpretation.slice(0, 300),
      nextSuggestion: o.nextSuggestion.slice(0, 300),
      hintStage: o.hintStage as 1 | 2 | 3 | 4,
      candidateIds: o.candidateIds as CandidateId[] | undefined,
      proposedObservation: proposed,
    },
  };
}

export function validateTranslation(raw: unknown): ValidationResult<Translation> {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid" };
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.candidateIds) || !o.candidateIds.every(isCandidateId)) return { ok: false, reason: "invalid" };
  if (typeof o.confirmQuestion !== "string") return { ok: false, reason: "invalid" };
  if (digitsIn(o.confirmQuestion)) return { ok: false, reason: "digits" };
  return { ok: true, value: { candidateIds: [...new Set(o.candidateIds)], confirmQuestion: o.confirmQuestion.slice(0, 300), source: "claude" } };
}

async function callWithRetry<T>(
  user: string,
  tool: Anthropic.Tool,
  validate: (raw: unknown) => ValidationResult<T>,
): Promise<T | null> {
  const c = caller ?? defaultCaller();
  if (!c) return null;
  const limit = Number(process.env.MAX_CONCURRENT_CLAUDE_CALLS) || 8;
  if (inFlight >= limit) return null;
  inFlight++;
  try {
    let prompt = user;
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: unknown;
      try {
        raw = await c(SYSTEM, prompt, tool);
      } catch {
        return null; // 通信失敗・混雑：定型ヒントで続ける
      }
      const v = validate(raw);
      if (v.ok) return v.value;
      if (v.reason !== "digits") return null;
      // 数字が入っていたときだけ、理由を添えて1回だけ作り直させる
      prompt = `${user}\n\n前の応答の文章に数字が含まれていました。数字を使わず、証拠IDと言葉で指して書き直してください。`;
    }
    return null;
  } finally {
    inFlight--;
  }
}

/** ヒント：Claudeが使えれば問い返し、だめなら定型ヒント */
export async function claudeHint(session: Session): Promise<Hint> {
  const fallback = session.nextTemplateHint();
  const view = session.publicView();
  const out = await callWithRetry(
    `次の状態の学生に、ヒントの段階${"一二三四"[fallback.stage - 1]}として応答してください。\n${buildPartnerInput(view)}`,
    RESPOND_TOOL,
    (raw) => validatePartnerOutput(raw, view),
  );
  if (!out) return fallback;
  const suggestion = fallback.stage >= 4 ? (out.proposedObservation ?? fallback.suggestion) : null;
  return {
    stage: fallback.stage,
    text: `${out.interpretation} ${out.nextSuggestion}`.trim(),
    suggestion,
    source: "claude",
    evidenceIds: out.evidenceIds,
  };
}

/** 学生の言葉 → 検証できる候補（確認付き） */
export async function claudeTranslate(session: Session, text: string): Promise<Translation> {
  const view = session.publicView();
  const out = await callWithRetry(
    `学生の説明を、候補IDのどれ（複数可）に当たるかに翻訳し、学生に確認する問いを一つ返してください。候補の説明：overall＝待ったあとも残るかたさ、instant＝押した直後だけ上乗せされるかたさ、relax＝上乗せ分がやわらぐ時間、same＝違いはない。\n学生の説明：「${text}」\n状態：${buildPartnerInput(view)}`,
    TRANSLATE_TOOL,
    validateTranslation,
  );
  if (out) return out;
  return {
    candidateIds: [],
    confirmQuestion: "あなたの説明は、次のどれに近いですか？ 当てはまるものを選んでください。",
    source: "template",
  };
}

// ---------- 許可ツールでの観察の実行（学生が了承した観察だけ） ----------

/** 複数回のやり取りができる呼び出し口（テストでは偽物を入れる） */
export type AgentCaller = (
  system: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  toolName: string,
) => Promise<Anthropic.ContentBlock[] | null>;

let agentCaller: AgentCaller | null = null;

export function setAgentCaller(c: AgentCaller | null): void {
  agentCaller = c;
}

function defaultAgentCaller(): AgentCaller | null {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL;
  if (!key || !model) return null;
  const client = new Anthropic({ apiKey: key, timeout: 20_000, maxRetries: 1 });
  return async (system, messages, tools, toolName) => {
    const msg = await client.messages.create({
      model,
      max_tokens: 800,
      system,
      messages,
      tools,
      tool_choice: { type: "tool", name: toolName },
    });
    return msg.content;
  };
}

const RUN_TOOL: Anthropic.Tool = {
  name: "run_observation",
  description: "学生が了承した観察を一回だけ実行する。押す時間と記録時刻は、学生が了承したものと同じでなければならない",
  input_schema: {
    type: "object",
    properties: {
      pushSeconds: { type: "number", enum: [0.2, 1, 5] },
      recordAt: { type: "number", enum: [0, 0.5, 2, 5, 20] },
    },
    required: ["pushSeconds", "recordAt"],
  },
};

export interface ObserveOutcome {
  readonly recordId: string;
  readonly note: Hint;
  /** Claudeがツールで実行したか（false ならサーバーが直接実行した） */
  readonly byClaude: boolean;
}

/**
 * 学生が了承した観察を、Claudeに許可ツール run_observation で実行させ、結果を一緒に読む。
 * Claudeが使えない・違う引数で呼ぶ・ツールを呼ばないときは、サーバーが同じ観察を直接実行する。
 */
export async function claudeObserve(session: Session, spec: ObservationSpec, observationId: string): Promise<ObserveOutcome> {
  const before = session.publicView();
  const p = before.pendingPrediction;
  if (!p || p.pushSeconds !== spec.pushSeconds || p.recordAt !== spec.recordAt) {
    // 予想がなければ、Claudeにもサーバーにも実行させない（session.observe が拒否する）
    session.observe(spec, observationId);
  }
  const c = agentCaller ?? defaultAgentCaller();
  const limit = Number(process.env.MAX_CONCURRENT_CLAUDE_CALLS) || 8;
  const direct = (): ObserveOutcome => {
    const rec = session.observe(spec, observationId);
    return { recordId: rec.id, note: resultTemplate(session, rec.id), byClaude: false };
  };
  if (!c || inFlight >= limit) return direct();
  inFlight++;
  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `学生が次の観察を了承しました。押す時間は${spec.pushSeconds}秒、記録時刻は押し終わってから${spec.recordAt}秒後です。run_observation でこの観察を一回だけ実行してください。\n状態：${buildPartnerInput(before)}`,
      },
    ];
    let first: Anthropic.ContentBlock[] | null;
    try {
      first = await c(SYSTEM, messages, [RUN_TOOL, RESPOND_TOOL], "run_observation");
    } catch {
      return direct();
    }
    const call = first?.find((b) => b.type === "tool_use" && b.name === "run_observation");
    const args = call && call.type === "tool_use" ? (call.input as Record<string, unknown>) : null;
    if (!call || call.type !== "tool_use" || !args || args.pushSeconds !== spec.pushSeconds || args.recordAt !== spec.recordAt) {
      return direct(); // 了承と違う引数・呼ばない：Claudeには実行させない
    }
    const rec = session.observe(spec, observationId);
    const after = session.publicView();
    const toolResult = JSON.stringify({
      証拠ID: rec.id,
      Bの力: Math.round(rec.force * 1000) / 1000,
      同じ押し方でのAの基準値: Math.round(rec.baseForce * 1000) / 1000,
      学生の予想: rec.prediction?.choice ?? null,
      この観察で合わなくなった候補: rec.excluded.map((id) => after.candidates.find((x) => x.id === id)?.label),
      全体の状態: after.overallLabel,
    });
    messages.push({ role: "assistant", content: first! });
    messages.push({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: call.id, content: toolResult },
        { type: "text", text: "結果を学生と一緒に読み、respond で返してください。数字は書かず、証拠IDで指してください。正解は言わないでください。" },
      ],
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      let blocks: Anthropic.ContentBlock[] | null;
      try {
        blocks = await c(SYSTEM, messages, [RUN_TOOL, RESPOND_TOOL], "respond");
      } catch {
        break;
      }
      const resp = blocks?.find((b) => b.type === "tool_use" && b.name === "respond");
      if (!resp || resp.type !== "tool_use") break;
      const v = validatePartnerOutput(resp.input, after);
      if (v.ok) {
        return {
          recordId: rec.id,
          byClaude: true,
          note: { stage: 1, text: `${v.value.interpretation} ${v.value.nextSuggestion}`.trim(), suggestion: null, source: "claude", evidenceIds: v.value.evidenceIds },
        };
      }
      if (v.reason !== "digits") break;
      messages.push({ role: "assistant", content: blocks! });
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: resp.id, content: "文章に数字が含まれていました。数字を使わず、証拠IDと言葉で指して書き直してください。", is_error: true }],
      });
    }
    return { recordId: rec.id, note: resultTemplate(session, rec.id), byClaude: true };
  } finally {
    inFlight--;
  }
}

function resultTemplate(session: Session, recordId: string): Hint {
  const v = session.publicView();
  const rec = v.records.find((r) => r.id === recordId)!;
  const labels = rec.excluded.map((id) => `「${v.candidates.find((c) => c.id === id)?.label}」`).join("と");
  const text = labels
    ? `この観察で${labels}が合わなくなりました。全体の状態は「${v.overallLabel}」です。`
    : `この観察では、合わなくなった候補はありませんでした。全体の状態は「${v.overallLabel}」です。`;
  return { stage: 1, text, suggestion: null, source: "template", evidenceIds: [recordId] };
}

export { specText };
