import { jsonError } from "@/lib/anthropic";
import { RECORDINGS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Recording, TranscriptSegment } from "@/lib/types";

// 긴 녹음은 받아쓰기에 몇 분이 걸릴 수 있음 (Vercel Hobby 는 300초가 상한)
export const maxDuration = 300;

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";
const SIGNED_URL_SECONDS = 60 * 60 * 2;
const REQUEST_TIMEOUT_MS = 240_000;

type DeepgramResponse = {
  metadata?: { duration?: number };
  results?: {
    channels?: {
      alternatives?: {
        transcript?: string;
        paragraphs?: {
          transcript?: string;
          paragraphs?: { start?: number; end?: number; sentences?: { text?: string }[] }[];
        };
      }[];
    }[];
  };
};

export async function POST(request: Request) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return jsonError(500, "서버에 DEEPGRAM_API_KEY 가 설정되지 않았어요. (.env.local 확인)");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return jsonError(401, "로그인이 필요해요.");

  const body = (await request.json().catch(() => null)) as { recordingId?: string } | null;
  if (!body?.recordingId) return jsonError(400, "recordingId 가 필요해요.");

  // RLS 덕분에 본인 녹음만 조회됨
  const { data: recording } = await supabase
    .from("recordings")
    .select("id, title, storage_path, status")
    .eq("id", body.recordingId)
    .maybeSingle<Pick<Recording, "id" | "title" | "storage_path" | "status">>();
  if (!recording) return jsonError(404, "녹음을 찾을 수 없어요.");
  if (!recording.storage_path) return jsonError(400, "오디오 파일이 없는 항목이에요.");

  const { data: signed, error: signError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(recording.storage_path, SIGNED_URL_SECONDS);
  if (signError || !signed?.signedUrl) return jsonError(500, "녹음 파일 주소를 만들지 못했어요.");

  await supabase
    .from("recordings")
    .update({ status: "transcribing", error_message: null })
    .eq("id", recording.id);

  const fail = async (message: string) => {
    await supabase
      .from("recordings")
      .update({ status: "failed", error_message: message })
      .eq("id", recording.id);
    return jsonError(502, message);
  };

  // Deepgram 이 서명 URL 로 직접 파일을 받아가므로 서버가 오디오를 중계하지 않아도 된다
  const params = new URLSearchParams({
    model: "nova-3",
    language: "ko",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
    mip_opt_out: "true", // 녹음이 모델 학습에 쓰이지 않도록
  });

  let response: Response;
  try {
    response = await fetch(`${DEEPGRAM_URL}?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: signed.signedUrl }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[recordings/transcribe]", err);
    return fail(
      err instanceof Error && err.name === "TimeoutError"
        ? "받아쓰기가 너무 오래 걸려 중단했어요. 녹음을 나눠서 다시 시도해 주세요."
        : "받아쓰기 서버에 연결하지 못했어요.",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[recordings/transcribe]", response.status, detail);
    if (response.status === 401) return fail("Deepgram API 키가 올바르지 않아요.");
    if (response.status === 402) return fail("Deepgram 크레딧이 부족해요.");
    if (response.status === 429) return fail("요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
    return fail(`받아쓰기에 실패했어요. (${response.status})`);
  }

  const data = (await response.json()) as DeepgramResponse;
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  const transcript = (alternative?.paragraphs?.transcript || alternative?.transcript || "").trim();
  if (!transcript) return fail("음성에서 글자를 찾지 못했어요. 녹음 상태를 확인해 주세요.");

  const segments: TranscriptSegment[] = (alternative?.paragraphs?.paragraphs ?? [])
    .map((paragraph) => ({
      start: paragraph.start ?? 0,
      end: paragraph.end ?? 0,
      text: (paragraph.sentences ?? []).map((s) => s.text ?? "").join(" ").trim(),
    }))
    .filter((segment) => segment.text);

  const { error: updateError } = await supabase
    .from("recordings")
    .update({
      status: "transcribed",
      transcript,
      segments: segments.length > 0 ? segments : null,
      duration_seconds: data.metadata?.duration ? Math.round(data.metadata.duration) : null,
      error_message: null,
    })
    .eq("id", recording.id);
  if (updateError) return fail(`받아쓰기 결과를 저장하지 못했어요: ${updateError.message}`);

  return Response.json({
    ok: true,
    length: transcript.length,
    durationSeconds: data.metadata?.duration ?? null,
  });
}
