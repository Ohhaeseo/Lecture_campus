import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_MODEL,
  describeAnthropicError,
  fallbackOptions,
  jsonError,
  ndjsonChunk,
  NDJSON_HEADERS,
} from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/env";

// 긴 답변 스트리밍을 위해 실행 시간을 넉넉히 (Vercel 등 배포 환경에서 적용)
export const maxDuration = 300;

const MAX_HISTORY = 20;
// base64 로 바꾸면 용량이 약 1.33배가 되므로, 22MB 까지만 허용해야 API 요청 한도(32MB) 안에 들어간다
const MAX_PDF_BYTES = 22 * 1024 * 1024;
const MAX_PDF_PAGES = 600;

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
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(500, "서버에 ANTHROPIC_API_KEY 가 설정되지 않았어요.");
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

  const messages: Anthropic.Beta.BetaMessageParam[] = [];

  if (body.scope === "document") {
    if ((doc.file_size ?? 0) > MAX_PDF_BYTES) {
      return jsonError(
        400,
        `PDF가 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB보다 커서 'PDF 전체' 모드를 쓸 수 없어요. '현재 페이지' 모드를 사용해 주세요.`,
      );
    }
    if ((doc.page_count ?? 0) > MAX_PDF_PAGES) {
      return jsonError(400, `${MAX_PDF_PAGES}쪽이 넘는 PDF는 'PDF 전체' 모드를 쓸 수 없어요.`);
    }
    const { data: file, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
    if (error || !file) return jsonError(500, "PDF 파일을 불러오지 못했어요.");
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");

    // PDF 는 대화 맨 앞에 두고 캐시해서, 같은 자료로 이어서 질문할 때 비용과 시간을 줄인다
    messages.push({
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
          title: doc.title,
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: "위 PDF는 이 수업의 강의자료 전체입니다." },
      ],
    });
  }

  // 이전 대화 (API 는 user 로 시작해야 하고, 연속된 같은 역할 메시지는 자동으로 합쳐짐)
  const history = (historyRows ?? []).reverse().filter((m) => m.content);
  while (history.length && history[0].role !== "user" && messages.length === 0) history.shift();
  for (const row of history) {
    messages.push({ role: row.role as "user" | "assistant", content: row.content });
  }

  messages.push({ role: "user", content: buildQuestion(body) });

  await supabase.from("chat_messages").insert({
    document_id: doc.id,
    role: "user",
    content: body.message,
    page: body.page,
  });

  const client = new Anthropic();
  const stream = client.beta.messages.stream(
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 64000,
      system: buildSystemPrompt(doc),
      messages,
      ...fallbackOptions(),
    },
    { signal: request.signal },
  );

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(ndjsonChunk(event));
      let answer = "";

      stream.on("text", (delta) => {
        answer += delta;
        send({ type: "text", text: delta });
      });

      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n_(이 질문에는 답변할 수 없어요. 질문을 바꿔서 다시 시도해 주세요.)_";
          answer += note;
          send({ type: "text", text: note });
        } else if (final.stop_reason === "max_tokens") {
          const note = "\n\n_(답변이 너무 길어 중간에 끊겼어요.)_";
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
  // 자료별로 고정된 내용만 넣어 프롬프트 캐시가 유지되게 한다 (현재 페이지 번호 등은 질문에 포함)
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

function buildQuestion(body: ChatRequest): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];

  if (body.scope === "page") {
    if (body.pageImage) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: body.pageImage },
      });
    }
    const text = body.pageText?.trim() || "(이 페이지에서 추출된 텍스트가 없습니다. 이미지를 참고하세요.)";
    blocks.push({
      type: "text",
      text: `<page number="${body.page}">\n<extracted_text>\n${text}\n</extracted_text>\n</page>`,
    });
  }

  blocks.push({
    type: "text",
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
