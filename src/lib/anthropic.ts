import Anthropic from "@anthropic-ai/sdk";

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// 안전 분류기에 걸린 요청을 다른 모델로 자동 재시도하는 서버 측 fallback (지원 모델에서만 사용)
const MODELS_WITH_DEFAULT_FALLBACK = new Set(["claude-opus-5", "claude-fable-5-1"]);

type FallbackOptions = {
  betas?: Anthropic.Beta.AnthropicBeta[];
  fallbacks?: Anthropic.Beta.Messages.BetaFallbacksParam;
};

export function fallbackOptions(): FallbackOptions {
  return MODELS_WITH_DEFAULT_FALLBACK.has(ANTHROPIC_MODEL)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
    : {};
}

export function describeAnthropicError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic API 키가 올바르지 않아요.";
  if (err instanceof Anthropic.PermissionDeniedError) return "이 API 키로는 해당 모델을 사용할 수 없어요.";
  if (err instanceof Anthropic.RateLimitError) return "AI 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  if (err instanceof Anthropic.BadRequestError) return `AI 요청이 거절됐어요: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "AI 서버에 연결하지 못했어요.";
  if (err instanceof Anthropic.APIError) return `AI 서버 오류가 발생했어요. (${err.status ?? "?"})`;
  return "답변을 만드는 중 오류가 발생했어요.";
}

/** 클라이언트로 보낼 NDJSON 한 줄 (한 줄에 JSON 하나) */
const encoder = new TextEncoder();
export function ndjsonChunk(event: object) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
};

export function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}
