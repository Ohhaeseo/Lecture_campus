"use client";

import { ArrowLeft, Check, Copy, FileText, LoaderCircle, Mic, Sparkles, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatFileSize, formatTimestamp } from "@/lib/dates";
import { deleteRecording, formatDuration } from "@/lib/recordings";
import { createClient } from "@/lib/supabase/client";
import type { Course, Recording } from "@/lib/types";
import { Markdown } from "../Markdown";

export function RecordingDetail({
  recording,
  course,
  audioUrl,
  transcribeEnabled,
  aiEnabled,
}: {
  recording: Recording;
  course: Pick<Course, "id" | "name" | "color">;
  audioUrl: string | null;
  transcribeEnabled: boolean;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tab, setTab] = useState<"summary" | "transcript">(recording.summary ? "summary" : "transcript");
  const [transcribing, setTranscribing] = useState(false);
  const [summary, setSummary] = useState(recording.summary ?? "");
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState(recording.error_message ?? "");
  const [copied, setCopied] = useState(false);

  const hasTranscript = Boolean(recording.transcript?.trim());

  async function transcribe() {
    setTranscribing(true);
    setError("");
    try {
      const res = await fetch("/api/recordings/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: recording.id }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `받아쓰기에 실패했어요. (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "받아쓰기에 실패했어요.");
    } finally {
      setTranscribing(false);
    }
  }

  async function summarize() {
    setSummarizing(true);
    setSummary("");
    setError("");
    setTab("summary");
    try {
      const res = await fetch("/api/recordings/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: recording.id }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `요약에 실패했어요. (${res.status})`);
      }

      // 서버가 한 줄에 JSON 하나씩(NDJSON) 보낸다
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
          if (event.type === "text" && event.text) setSummary((prev) => prev + event.text);
          else if (event.type === "error") throw new Error(event.message);
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요약에 실패했어요.");
    } finally {
      setSummarizing(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`'${recording.title}' 을(를) 삭제할까요?`)) return;
    const message = await deleteRecording(createClient(), recording);
    if (message) return setError(`삭제하지 못했어요: ${message}`);
    router.push(`/courses/${course.id}`);
    router.refresh();
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    audio.play().catch(() => {});
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <Link
        href={`/courses/${course.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-indigo-600"
      >
        <ArrowLeft size={15} />
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
        {course.name}
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{recording.title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-zinc-500">
            {recording.duration_seconds ? <span>{formatDuration(recording.duration_seconds)}</span> : null}
            {recording.file_size ? <span>{formatFileSize(recording.file_size)}</span> : null}
            <span suppressHydrationWarning>{formatTimestamp(recording.created_at)}</span>
          </p>
        </div>
        <button type="button" className="btn btn-secondary text-rose-600" onClick={handleDelete}>
          <Trash size={15} /> 삭제
        </button>
      </header>

      {audioUrl && (
        <audio ref={audioRef} controls src={audioUrl} className="mb-5 w-full" preload="metadata" />
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {recording.storage_path && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={transcribe}
            disabled={transcribing || !transcribeEnabled}
            title={transcribeEnabled ? undefined : "DEEPGRAM_API_KEY 가 설정되지 않았어요"}
          >
            {transcribing ? <LoaderCircle size={15} className="animate-spin" /> : <Mic size={15} />}
            {transcribing ? "받아쓰는 중..." : hasTranscript ? "다시 받아쓰기" : "받아쓰기 시작"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={summarize}
          disabled={summarizing || !hasTranscript || !aiEnabled}
          title={aiEnabled ? undefined : "OPENAI_API_KEY 가 설정되지 않았어요"}
        >
          {summarizing ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {summarizing ? "요약하는 중..." : summary ? "요약 다시 만들기" : "AI 요약 만들기"}
        </button>
      </div>

      {transcribing && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          받아쓰는 중이에요. 3시간 녹음은 1~2분 정도 걸려요. 이 화면을 닫지 말고 기다려 주세요.
        </p>
      )}
      {!transcribeEnabled && recording.storage_path && !hasTranscript && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          받아쓰기를 쓰려면 .env.local 에 DEEPGRAM_API_KEY 를 넣고 서버를 다시 시작하세요.
        </p>
      )}
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="card overflow-hidden">
        <div className="flex border-b border-zinc-200 px-2">
          <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
            <Sparkles size={15} /> AI 요약
          </TabButton>
          <TabButton active={tab === "transcript"} onClick={() => setTab("transcript")}>
            <FileText size={15} /> 받아쓴 내용
          </TabButton>
          {tab === "summary" && summary && !summarizing && (
            <button type="button" className="btn btn-ghost ml-auto px-2 text-xs" onClick={copySummary}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "복사됨" : "복사"}
            </button>
          )}
        </div>

        <div className="p-5">
          {tab === "summary" ? (
            summary ? (
              <Markdown>{summary}</Markdown>
            ) : summarizing ? (
              <p className="flex items-center gap-2 py-8 text-sm text-zinc-400">
                <LoaderCircle size={16} className="animate-spin" /> 강의를 읽고 정리하는 중...
              </p>
            ) : (
              <p className="py-10 text-center text-sm leading-6 text-zinc-400">
                {hasTranscript
                  ? "위의 'AI 요약 만들기' 를 누르면 강의 흐름, 핵심 개념, 시험 포인트를 정리해 줘요."
                  : "먼저 받아쓰기를 끝내면 AI 요약을 만들 수 있어요."}
              </p>
            )
          ) : recording.segments && recording.segments.length > 0 ? (
            <ul className="space-y-2">
              {recording.segments.map((segment, index) => (
                <li key={index} className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => seek(segment.start)}
                    className="shrink-0 text-xs font-medium text-indigo-600 tabular-nums hover:underline"
                    title="이 부분부터 듣기"
                  >
                    {formatDuration(segment.start)}
                  </button>
                  <p className="text-sm leading-7 text-zinc-700">{segment.text}</p>
                </li>
              ))}
            </ul>
          ) : hasTranscript ? (
            <p className="text-sm leading-7 whitespace-pre-wrap text-zinc-700">{recording.transcript}</p>
          ) : (
            <p className="py-10 text-center text-sm text-zinc-400">아직 받아쓴 내용이 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
        active ? "border-indigo-600 font-semibold text-indigo-700" : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
