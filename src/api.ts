// 画面からAPIを呼ぶ。サーバーから受け取るのは公開ビュー（公開型と証拠型）だけ。
import type { Hint } from "../server/session/hints.js";
import type { Debrief, PublicSessionView, PredictionChoice, Reflection } from "../server/session/session.js";
import type { Translation } from "../server/claude/partner.js";
import type { ObservationSpec } from "../server/model/public.js";

export type { Hint, Debrief, PublicSessionView, PredictionChoice, Reflection, Translation };

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "通信に失敗しました");
  return data as T;
}

export async function status(): Promise<{ claude: boolean; causes: string[] }> {
  try {
    const r = await fetch("/api/status");
    return await r.json();
  } catch {
    return { claude: false, causes: [] };
  }
}

export const api = {
  start: (body: Record<string, unknown>) => post<{ view: PublicSessionView }>("/api/session", body),
  predict: (id: string, spec: ObservationSpec, choice: PredictionChoice, reason: string) =>
    post<{ view: PublicSessionView }>(`/api/session/${id}/prediction`, { ...spec, choice, reason }),
  observe: (id: string, spec: ObservationSpec, observationId: string) =>
    post<{ view: PublicSessionView }>(`/api/session/${id}/observe`, { ...spec, observationId }),
  curvePredict: (id: string, pushSeconds: number, choice: PredictionChoice, reason: string) =>
    post<{ view: PublicSessionView }>(`/api/session/${id}/curve-prediction`, { pushSeconds, choice, reason }),
  observeCurve: (id: string, pushSeconds: number, observationId: string) =>
    post<{ view: PublicSessionView; curveId: string }>(`/api/session/${id}/observe-curve`, { pushSeconds, observationId }),
  claudeObserve: (id: string, pushSeconds: number, observationId: string) =>
    post<{ view: PublicSessionView; note: Hint; byClaude: boolean }>(`/api/session/${id}/claude-observe`, { pushSeconds, observationId }),
  measureA: (id: string, spec: ObservationSpec) =>
    post<{ view: PublicSessionView }>(`/api/session/${id}/measure-a`, { ...spec, measurementId: crypto.randomUUID() }),
  hint: (id: string) => post<{ view: PublicSessionView; hint: Hint }>(`/api/session/${id}/hint`),
  words: (id: string, text: string) => post<{ view: PublicSessionView; translation: Translation }>(`/api/session/${id}/words`, { text }),
  reflection: (id: string, r: Reflection) => post<{ view: PublicSessionView }>(`/api/session/${id}/reflection`, r),
  finish: (id: string) => post<{ view: PublicSessionView; debrief: Debrief }>(`/api/session/${id}/finish`),
};
