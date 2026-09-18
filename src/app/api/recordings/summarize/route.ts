import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_MODEL,
  describeAnthropicError,
  fallbackOptions,
  jsonError,
  ndjsonChunk,
  NDJSON_HEADERS,
} from "@/lib/anthropic";
import { formatDuration } from "@/lib/recordings";
import { createClient } from "@/lib/supabase/server";
import type { Recording, TranscriptSegment } from "@/lib/types";

export const maxDuration = 300;

// 3시간 강의 받아쓰기도 여유 있게 들어가는 길이 (대략 30만 자)
const MAX_TRANSCRIPT_CHARS = 300_000;

type RecordingRow = Pick<Recording, "id" | "title" | "transcript" | "segments"> & {
  course: { name: string } | null;
};

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(500, "서버에 ANTHROPIC_API_KEY 가 설정되지 않았어요.");
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

  const client = new Anthropic();
  const stream = client.beta.messages.stream(
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `수업: ${recording.course?.name ?? "(알 수 없음)"}\n녹음 제목: ${recording.title}\n\n<transcript>\n${buildTranscript(recording)}\n</transcript>\n\n위 강의 녹음을 정리해 주세요.`,
        },
      ],
      ...fallbackOptions(),
    },
    { signal: request.signal },
  );

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(ndjsonChunk(event));
      let summary = "";

      stream.on("text", (delta) => {
        summary += delta;
        send({ type: "text", text: delta });
      });

      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n_(이 내용은 요약할 수 없었어요.)_";
          summary += note;
          send({ type: "text", text: note });
        } else if (final.stop_reason === "max_tokens") {
          const note = "\n\n_(요약이 너무 길어 중간에 끊겼어요.)_";
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
          send({ type: "error", message: describeAnthropicError(err) });
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

const SYSTEM_PROMPT = `당신은 대학생의 강의 녹음을 정리해 주는 학습 도우미입니다.
받아쓰기(자동 음성 인식) 결과를 읽고, 수업을 놓친 학생이 이것만 봐도 따라갈 수 있게 한국어 마크다운으로 정리하세요.

다음 순서로 작성합니다.
## 한 줄 요약
## 강의 흐름
주제별로 나눠 설명하고, 받아쓰기에 [시:분:초] 표시가 있으면 각 주제 끝에 (00:12:34) 형태로 시작 시각을 적으세요.
## 핵심 개념
용어와 정의를 목록으로 정리합니다.
## 시험에 나올 만한 부분
교수님이 강조하거나 반복한 내용, 시험·과제를 언급한 부분. 해당 내용이 없으면 이 절은 생략하세요.
## 다시 확인할 점
받아쓰기가 흐릿해 확실하지 않은 부분이나, 자료를 더 봐야 하는 부분.

규칙:
- 받아쓰기 오류로 보이는 단어는 문맥으로 고쳐서 이해하되, 확신이 없으면 원문 뒤에 (?) 를 붙이세요.
- 녹음에 없는 내용을 지어내지 마세요. 잡담이나 공지는 짧게만 언급하세요.
- 수식은 인라인 $...$, 블록 $$...$$ 로 감싸세요.`;

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
