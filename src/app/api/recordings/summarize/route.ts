import {
  createAiClient,
  describeAiError,
  jsonError,
  ndjsonChunk,
  NDJSON_HEADERS,
  OPENAI_MODEL,
  truncatedNote,
} from "@/lib/ai";
import { formatDuration } from "@/lib/recordings";
import { buildSummaryInstructions } from "@/lib/summaryTemplate";
import { createClient } from "@/lib/supabase/server";
import type { Recording, TranscriptSegment } from "@/lib/types";

export const maxDuration = 300;

// 3시간 강의 받아쓰기도 여유 있게 들어가는 길이 (대략 30만 자)
const MAX_TRANSCRIPT_CHARS = 300_000;
const MAX_OUTPUT_TOKENS = 32000;

type RecordingRow = Pick<Recording, "id" | "title" | "transcript" | "segments"> & {
  course: { name: string } | null;
};

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return jsonError(500, "서버에 OPENAI_API_KEY 가 설정되지 않았어요.");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return jsonError(401, "로그인이 필요해요.");

  const body = (await request.json().catch(() => null)) as { recordingId?: string } | null;
  if (!body?.recordingId) return jsonError(400, "recordingId 가 필요해요.");

  const { data: recording } = await supabase
    .from("recordings")
    .select("id, title, transcript, segments, course:courses(name)")
    .eq("id", body.recordingId)
    .maybeSingle<RecordingRow>();
  if (!recording) return jsonError(404, "녹음을 찾을 수 없어요.");
  if (!recording.transcript?.trim()) return jsonError(400, "먼저 받아쓰기를 끝내야 요약할 수 있어요.");

  const client = createAiClient();
  const stream = client.responses.stream(
    {
      model: OPENAI_MODEL,
      instructions: buildSummaryInstructions(),
      input: [
        {
          role: "user",
          content: `수업: ${recording.course?.name ?? "(알 수 없음)"}\n제목: ${recording.title}\n\n<transcript>\n${buildTranscript(recording)}\n</transcript>\n\n위 강의 전사문을 정해진 틀에 맞춰 정리해 주세요.`,
        },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: "medium" },
      // 한 번 쓰고 마는 긴 입력이라 캐시에 쓰지 않도록 (캐시 쓰기 요금 방지)
      prompt_cache_options: { mode: "explicit" },
    },
    { signal: request.signal },
  );

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(ndjsonChunk(event));
      let summary = "";

      stream.on("response.output_text.delta", (event) => {
        summary += event.delta;
        send({ type: "text", text: event.delta });
      });

      try {
        const final = await stream.finalResponse();
        const note = truncatedNote(final);
        if (note) {
          summary += note;
          send({ type: "text", text: note });
        }
        if (summary.trim()) {
          await supabase.from("recordings").update({ summary }).eq("id", recording.id);
        }
        send({ type: "done" });
      } catch (err) {
        if (request.signal.aborted) {
          if (summary.trim()) {
            await supabase
              .from("recordings")
              .update({ summary: `${summary}\n\n_(요약을 중단했어요)_` })
              .eq("id", recording.id);
          }
        } else {
          console.error("[recordings/summarize]", err);
          send({ type: "error", message: describeAiError(err) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // 이미 닫힌 스트림
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(responseBody, { headers: NDJSON_HEADERS });
}

/** 타임스탬프가 있으면 [시:분:초] 를 붙여서 모델이 시각을 인용할 수 있게 한다 */
function buildTranscript(recording: RecordingRow) {
  const segments = recording.segments as TranscriptSegment[] | null;
  const text =
    segments && segments.length > 0
      ? segments.map((s) => `[${formatDuration(s.start)}] ${s.text}`).join("\n")
      : (recording.transcript ?? "");
  return text.length > MAX_TRANSCRIPT_CHARS
    ? `${text.slice(0, MAX_TRANSCRIPT_CHARS)}\n\n(받아쓰기가 너무 길어 이후 내용은 잘렸습니다)`
    : text;
}
