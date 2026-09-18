import type OpenAI from "openai";
import {
  createAiClient,
  describeAiError,
  jsonError,
  ndjsonChunk,
  NDJSON_HEADERS,
  OPENAI_MODEL,
  truncatedNote,
} from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/env";

// 긴 답변 스트리밍을 위해 실행 시간을 넉넉히 (Vercel 등 배포 환경에서 적용)
export const maxDuration = 300;

const MAX_HISTORY = 20;
// base64 로 바꾸면 용량이 약 1.33배가 되므로, OpenAI 파일 한도(50MB) 안에 들어가도록 제한
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 32000;

type ChatRequest = {
  documentId: string;
  message: string;
  page: number;
  scope: "page" | "document";
  pageText?: string;
  pageImage?: string | null;
};

type DocumentWithCourse = {
  id: string;
  title: string;
  storage_path: string;
  file_size: number | null;
  page_count: number | null;
  course: { name: string } | null;
};

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return jsonError(500, "서버에 OPENAI_API_KEY 가 설정되지 않았어요.");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return jsonError(401, "로그인이 필요해요.");

  let body: ChatRequest;
  try {
    body = parseBody(await request.json());
  } catch (err) {
    return jsonError(400, err instanceof Error ? err.message : "잘못된 요청이에요.");
  }

  // RLS 덕분에 본인 자료만 조회됨
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, storage_path, file_size, page_count, course:courses(name)")
    .eq("id", body.documentId)
    .maybeSingle<DocumentWithCourse>();
  if (!doc) return jsonError(404, "자료를 찾을 수 없어요.");

  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("document_id", doc.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  const input: OpenAI.Responses.ResponseInput = [];

  if (body.scope === "document") {
    if ((doc.file_size ?? 0) > MAX_PDF_BYTES) {
      return jsonError(
        400,
        `PDF가 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB보다 커서 'PDF 전체' 모드를 쓸 수 없어요. '현재 페이지' 모드를 사용해 주세요.`,
      );
    }
    const { data: file, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
    if (error || !file) return jsonError(500, "PDF 파일을 불러오지 못했어요.");
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");

    // PDF 는 대화 맨 앞에 둔다 (같은 앞부분이 반복되면 자동 프롬프트 캐싱이 걸림)
    input.push({
      role: "user",
      content: [
        {
          type: "input_file",
          filename: `${doc.title}.pdf`,
          file_data: `data:application/pdf;base64,${data}`,
        },
        { type: "input_text", text: "위 PDF는 이 수업의 강의자료 전체입니다." },
      ],
    });
  }

  // 이전 대화 (오래된 것부터). 첫 메시지가 assistant 로 시작하지 않도록 정리
  const history = (historyRows ?? []).reverse().filter((m) => m.content);
  while (history.length && history[0].role !== "user" && input.length === 0) history.shift();
  for (const row of history) {
    input.push({ role: row.role as "user" | "assistant", content: row.content });
  }

  input.push({ role: "user", content: buildQuestion(body) });

  await supabase.from("chat_messages").insert({
    document_id: doc.id,
    role: "user",
    content: body.message,
    page: body.page,
  });

  const client = createAiClient();
  const stream = client.responses.stream(
    {
      model: OPENAI_MODEL,
      instructions: buildSystemPrompt(doc),
      input,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      // 대화형이라 응답이 빨리 시작되는 편이 좋음
      reasoning: { effort: "low" },
    },
    { signal: request.signal },
  );

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(ndjsonChunk(event));
      let answer = "";

      stream.on("response.output_text.delta", (event) => {
        answer += event.delta;
        send({ type: "text", text: event.delta });
      });

      try {
        const final = await stream.finalResponse();
        const note = truncatedNote(final);
        if (note) {
          answer += note;
          send({ type: "text", text: note });
        }
        await saveAnswer(answer);
        send({ type: "done" });
      } catch (err) {
        if (request.signal.aborted) {
          // 사용자가 중단한 경우 받은 부분까지만 저장
          if (answer) await saveAnswer(`${answer}\n\n_(답변을 중단했어요)_`);
        } else {
          console.error("[ai/chat]", err);
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

  async function saveAnswer(content: string) {
    await supabase.from("chat_messages").insert({
      document_id: doc!.id,
      role: "assistant",
      content: content || "(빈 응답)",
      page: body.page,
    });
  }

  return new Response(responseBody, { headers: NDJSON_HEADERS });
}

function buildSystemPrompt(doc: DocumentWithCourse) {
  return `당신은 대학생이 강의자료를 공부하도록 돕는 튜터입니다.
- 수업: ${doc.course?.name ?? "(알 수 없음)"}
- 강의자료: ${doc.title}

학생은 수업을 놓친 부분이 많아서, 강의자료만 보고는 이해하기 어려운 내용을 물어봅니다.

답변 원칙:
- 한국어로, 결론부터 명확하게 설명하세요. 이해에 필요한 배경지식이 있다면 짧게 채워 주세요.
- 제공된 강의자료를 근거로 답하고, 근거가 된 페이지를 (p.12) 처럼 표시하세요. 페이지 번호는 PDF 기준입니다.
- 강의자료에 없는 내용을 덧붙일 때는 자료 밖의 일반 지식이라고 밝히세요. 확실하지 않은 내용은 추측이라고 말하세요.
- 수식은 LaTeX 로 쓰고 인라인은 $...$, 블록은 $$...$$ 로 감싸세요.
- 마크다운(목록, 표, 굵게)을 활용하되, 질문의 크기에 맞게 간결하게 답하세요.`;
}

function buildQuestion(body: ChatRequest): OpenAI.Responses.ResponseInputContent[] {
  const blocks: OpenAI.Responses.ResponseInputContent[] = [];

  if (body.scope === "page") {
    if (body.pageImage) {
      blocks.push({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${body.pageImage}`,
        detail: "auto",
      });
    }
    const text = body.pageText?.trim() || "(이 페이지에서 추출된 텍스트가 없습니다. 이미지를 참고하세요.)";
    blocks.push({
      type: "input_text",
      text: `<page number="${body.page}">\n<extracted_text>\n${text}\n</extracted_text>\n</page>`,
    });
  }

  blocks.push({
    type: "input_text",
    text: `학생이 지금 보고 있는 페이지: ${body.page}쪽\n\n질문: ${body.message}`,
  });
  return blocks;
}

function parseBody(raw: unknown): ChatRequest {
  const b = raw as Partial<ChatRequest> | null;
  if (!b || typeof b.documentId !== "string") throw new Error("documentId 가 필요해요.");
  if (typeof b.message !== "string" || !b.message.trim()) throw new Error("질문을 입력해 주세요.");
  if (b.message.length > 8000) throw new Error("질문이 너무 길어요. (최대 8000자)");
  if (b.scope !== "page" && b.scope !== "document") throw new Error("scope 값이 올바르지 않아요.");
  const page = Number.isInteger(b.page) && (b.page as number) > 0 ? (b.page as number) : 1;
  const pageImage =
    typeof b.pageImage === "string" && b.pageImage.length < 8_000_000 && /^[A-Za-z0-9+/=]+$/.test(b.pageImage)
      ? b.pageImage
      : null;
  const pageText = typeof b.pageText === "string" ? b.pageText.slice(0, 20000) : undefined;
  return { documentId: b.documentId, message: b.message.trim(), page, scope: b.scope, pageText, pageImage };
}
