import OpenAI from "openai";

/** 기본 모델: 이미지 입력 지원 + 100만 토큰 컨텍스트. 저렴하게 쓰려면 gpt-5.6-luna */
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";

export function createAiClient() {
  // 스트리밍 도중 재시도가 걸리면 답변이 중복되므로 재시도를 끈다
  return new OpenAI({ maxRetries: 0 });
}

export function describeAiError(err: unknown) {
  if (err instanceof OpenAI.AuthenticationError) return "OpenAI API 키가 올바르지 않아요.";
  if (err instanceof OpenAI.PermissionDeniedError) return "이 API 키로는 해당 모델을 사용할 수 없어요.";
  if (err instanceof OpenAI.RateLimitError) return "AI 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  if (err instanceof OpenAI.BadRequestError) return `AI 요청이 거절됐어요: ${err.message}`;
  if (err instanceof OpenAI.APIConnectionTimeoutError) return "AI 서버 응답이 너무 늦어요.";
  if (err instanceof OpenAI.APIConnectionError) return "AI 서버에 연결하지 못했어요.";
  if (err instanceof OpenAI.APIError) return `AI 서버 오류가 발생했어요. (${err.status ?? "?"})`;
  return "답변을 만드는 중 오류가 발생했어요.";
}

/** 답변이 길어 잘렸는지 확인 */
export function truncatedNote(response: { status?: string | null; incomplete_details?: { reason?: string | null } | null }) {
  return response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens"
    ? "\n\n_(답변이 너무 길어 중간에 끊겼어요.)_"
    : "";
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
