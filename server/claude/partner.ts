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

export { specText };
