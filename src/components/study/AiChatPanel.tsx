"use client";

import { Bookmark, Check, Copy, Eraser, LoaderCircle, Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PageContext } from "@/lib/pdfContext";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types";
import { Markdown } from "../Markdown";

export type AiScope = "page" | "document";

type LocalMessage = Pick<ChatMessage, "id" | "role" | "content" | "page"> & {
  pending?: boolean;
  error?: boolean;
};

const QUICK_PROMPTS = [
  "이 페이지 내용을 쉽게 설명해줘",
  "핵심만 3줄로 요약해줘",
  "시험에 나올 만한 문제 3개와 답을 만들어줘",
  "여기 나온 용어들을 정리해줘",
];

type Props = {
  documentId: string;
  initialMessages: ChatMessage[];
  currentPage: number;
  aiEnabled: boolean;
  input: string;
  onInputChange: (value: string) => void;
  focusKey: number;
  getPageContext: (page: number) => Promise<PageContext | null>;
  onSaveNote: (content: string, page: number | null) => Promise<string | null>;
  onJump: (page: number) => void;
};

export function AiChatPanel({
  documentId,
  initialMessages,
  currentPage,
  aiEnabled,
  input,
  onInputChange,
  focusKey,
  getPageContext,
  onSaveNote,
  onJump,
}: Props) {
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [scope, setScope] = useState<AiScope>("page");
  const [streaming, setStreaming] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    if (focusKey) inputRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function patchMessage(id: string, patch: (m: LocalMessage) => Partial<LocalMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)));
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;

    const page = currentPage;
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: question, page },
      { id: assistantId, role: "assistant", content: "", page, pending: true },
    ]);
    onInputChange("");
    setStreaming(true);
    stickToBottom.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const context = scope === "page" ? await getPageContext(page) : null;
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          message: question,
          page,
          scope,
          pageText: context?.text,
          pageImage: context?.image,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `요청에 실패했어요. (${res.status})`);
      }

      // 서버는 한 줄에 JSON 하나씩(NDJSON) 보낸다
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string; message?: string };
          if (event.type === "text" && event.text) {
            patchMessage(assistantId, (m) => ({ content: m.content + event.text }));
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
      patchMessage(assistantId, () => ({ pending: false }));
    } catch (err) {
      if (controller.signal.aborted) {
        patchMessage(assistantId, (m) => ({ pending: false, content: m.content || "_(답변을 중단했어요)_" }));
      } else {
        const message = err instanceof Error ? err.message : "알 수 없는 오류";
        patchMessage(assistantId, (m) => ({
          pending: false,
          error: true,
          content: m.content ? `${m.content}\n\n⚠️ ${message}` : message,
        }));
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  async function clearHistory() {
    if (!confirm("이 자료의 AI 대화 기록을 모두 지울까요?")) return;
    const { error } = await createClient().from("chat_messages").delete().eq("document_id", documentId);
    if (error) return alert(`지우지 못했어요: ${error.message}`);
    setMessages([]);
  }

  async function saveAsNote(message: LocalMessage) {
    const err = await onSaveNote(message.content, message.page);
    if (err) return alert(err);
    setSavedIds((prev) => new Set(prev).add(message.id));
  }

  async function copy(message: LocalMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1500);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2">
        <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs" role="radiogroup" aria-label="AI가 참고할 범위">
          {(
            [
              ["page", "현재 페이지", "지금 보고 있는 페이지(이미지+텍스트)를 참고해요. 빠르고 저렴해요."],
              ["document", "PDF 전체", "PDF 전체를 참고해요. 여러 페이지에 걸친 질문에 좋지만 느리고 비용이 커요."],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              title={hint}
              onClick={() => setScope(value)}
              className={`rounded-md px-2.5 py-1 ${scope === value ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={clearHistory}
          disabled={messages.length === 0 || streaming}
        >
          <Eraser size={14} /> 대화 지우기
        </button>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {!aiEnabled && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            AI 기능을 쓰려면 .env.local 에 OPENAI_API_KEY 를 설정하고 서버를 다시 시작하세요.
          </p>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <Sparkles size={20} />
            </span>
            <p className="text-sm font-medium">모르는 부분을 물어보세요</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {scope === "page"
                ? `지금 보고 있는 ${currentPage}쪽을 함께 보고 답해요.`
                : "PDF 전체를 읽고 답해요."}
              <br />
              PDF에서 문장을 드래그해서 질문할 수도 있어요.
            </p>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <div className="max-w-[90%] rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
                  {m.content}
                </div>
                {m.page && (
                  <button type="button" onClick={() => onJump(m.page!)} className="text-[11px] text-zinc-400 hover:text-indigo-600">
                    p.{m.page}에서 질문
                  </button>
                )}
              </div>
            ) : (
              <div key={m.id} className="group">
                <div
                  className={`rounded-2xl rounded-bl-md border px-3.5 py-2.5 ${
                    m.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-zinc-200 bg-white"
                  }`}
                >
                  {m.pending && !m.content ? (
                    <span className="flex items-center gap-2 text-sm text-zinc-400">
                      <LoaderCircle size={15} className="animate-spin" />
                      {scope === "document" ? "PDF 전체를 읽고 생각하는 중..." : "생각하는 중..."}
                    </span>
                  ) : (
                    <Markdown>{m.content}</Markdown>
                  )}
                </div>
                {!m.pending && !m.error && m.content && (
                  <div className="mt-1 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <button type="button" className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => copy(m)}>
                      {copiedId === m.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === m.id ? "복사됨" : "복사"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-1.5 py-0.5 text-[11px]"
                      onClick={() => saveAsNote(m)}
                      disabled={savedIds.has(m.id)}
                    >
                      {savedIds.has(m.id) ? <Check size={12} /> : <Bookmark size={12} />}
                      {savedIds.has(m.id) ? "메모에 저장됨" : "메모로 저장"}
                    </button>
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>

      <div className="border-t border-zinc-200 bg-white p-3">
        {!input && !streaming && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => send(prompt)}
                disabled={!aiEnabled}
                className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            className="input max-h-40 min-h-11 resize-none"
            rows={2}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              // 한글 입력 중(조합 중) Enter 는 무시해야 글자가 중복 전송되지 않음
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={`${scope === "page" ? `${currentPage}쪽` : "PDF 전체"}에 대해 질문하기 (Shift+Enter 줄바꿈)`}
            disabled={!aiEnabled}
          />
          {streaming ? (
            <button
              type="button"
              className="btn btn-secondary h-11 w-11 shrink-0 p-0"
              onClick={() => abortRef.current?.abort()}
              aria-label="답변 중단"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary h-11 w-11 shrink-0 p-0"
              onClick={() => send(input)}
              disabled={!input.trim() || !aiEnabled}
              aria-label="보내기"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
