"use client";

import { ArrowLeft, Check, Copy, ExternalLink, FileUp, LoaderCircle, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { streamRecordingSummary } from "@/lib/recordings";
import { SUMMARY_SECTIONS } from "@/lib/summaryTemplate";
import { createClient } from "@/lib/supabase/client";
import type { Course } from "@/lib/types";
import { Markdown } from "../Markdown";
import { ErrorText } from "../Modal";

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * 전사문을 붙여넣으면 정해진 틀로 수업을 요약해 주는 화면.
 * PDF 나 오디오 없이 수업만 있으면 쓸 수 있고, 결과는 recordings 에 (source: text) 로 저장된다.
 */
export function SummaryStudio({
  course,
  aiEnabled,
}: {
  course: Pick<Course, "id" | "name" | "color">;
  aiEnabled: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  // 한 번 저장한 뒤 다시 요약하면 같은 항목을 덮어쓴다
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadFile(file: File) {
    setError("");
    if (file.size > MAX_TEXT_FILE_BYTES) return setError("5MB 이하 텍스트 파일만 불러올 수 있어요.");
    const text = await file.text();
    if (text.includes("\u0000")) return setError("텍스트 파일(.txt, .md, .srt, .vtt)만 불러올 수 있어요.");
    setTranscript(text);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 200));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = transcript.trim();
    if (!text) return setError("전사문을 붙여넣어 주세요.");

    setRunning(true);
    setError("");
    setSummary("");

    const supabase = createClient();
    const row = { title: title.trim() || "수업 요약", transcript: text };
    let id = recordingId;
    if (id) {
      const { error: updateError } = await supabase.from("recordings").update(row).eq("id", id);
      if (updateError) {
        setRunning(false);
        return setError(`저장하지 못했어요: ${updateError.message}`);
      }
    } else {
      const { data, error: insertError } = await supabase
        .from("recordings")
        .insert({ ...row, course_id: course.id, source: "text", status: "transcribed" })
        .select("id")
        .single<{ id: string }>();
      if (insertError) {
        setRunning(false);
        return setError(`저장하지 못했어요: ${insertError.message}`);
      }
      id = data.id;
      setRecordingId(id);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamRecordingSummary(id, (chunk) => setSummary((prev) => prev + chunk), controller.signal);
    } catch (err) {
      // 사용자가 중단한 경우는 받은 부분까지 서버가 저장한다
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "요약에 실패했어요.");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <Link
        href={`/courses/${course.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-indigo-600"
      >
        <ArrowLeft size={15} />
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
        {course.name}
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">AI 수업 요약</h1>
        <p className="mt-1 text-sm text-zinc-500">
          녹음을 받아쓴 전사문을 보내면 정해진 틀에 맞춰 수업 내용을 자세히 정리해 줘요. 강의자료 PDF가 없어도 돼요.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <form onSubmit={handleSubmit} className="card space-y-4 p-5 lg:col-span-2">
          <div>
            <label className="label" htmlFor="summary-title">
              제목
            </label>
            <input
              id="summary-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 3주차 — 프로세스와 스레드"
              maxLength={200}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label mb-0" htmlFor="summary-transcript">
                전사문
              </label>
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                onClick={() => fileInput.current?.click()}
                disabled={running}
              >
                <FileUp size={13} /> 텍스트 파일 불러오기
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,text/vtt"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) loadFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            <textarea
              id="summary-transcript"
              className="input min-h-80 resize-y font-mono text-xs leading-5"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="녹음 후에 나온 전사문을 여기에 붙여넣으세요."
              disabled={running}
            />
            <p className="mt-1 text-right text-xs text-zinc-400">{transcript.length.toLocaleString()}자</p>
          </div>

          <ErrorText>{error}</ErrorText>
          {!aiEnabled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              요약을 쓰려면 .env.local 에 OPENAI_API_KEY 를 넣고 서버를 다시 시작하세요.
            </p>
          )}

          {running ? (
            <button type="button" className="btn btn-secondary w-full" onClick={() => abortRef.current?.abort()}>
              <Square size={14} /> 중단
            </button>
          ) : (
            <button type="submit" className="btn btn-primary w-full" disabled={!transcript.trim() || !aiEnabled}>
              <Sparkles size={15} /> {recordingId ? "다시 요약하기" : "AI에게 보내서 요약하기"}
            </button>
          )}
        </form>

        <section className="card overflow-hidden lg:col-span-3">
          <div className="flex min-h-11 items-center gap-2 border-b border-zinc-200 px-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-700">
              {running ? <LoaderCircle size={15} className="animate-spin text-indigo-500" /> : <Sparkles size={15} />}
              {running ? "정리하는 중..." : "요약"}
            </h2>
            {summary && !running && (
              <div className="ml-auto flex gap-1">
                <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={copySummary}>
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "복사됨" : "복사"}
                </button>
                {recordingId && (
                  <Link href={`/recordings/${recordingId}`} className="btn btn-ghost px-2 py-1 text-xs">
                    <ExternalLink size={13} /> 저장된 요약 열기
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="p-5">
            {summary ? (
              <Markdown>{summary}</Markdown>
            ) : running ? (
              <p className="flex items-center gap-2 py-8 text-sm text-zinc-400">
                <LoaderCircle size={16} className="animate-spin" /> 전사문을 읽고 있어요. 긴 수업은 1~2분 걸릴 수 있어요.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-zinc-500">요약은 항상 아래 틀로 만들어져요.</p>
                <ol className="space-y-2">
                  {SUMMARY_SECTIONS.map((section, index) => (
                    <li key={section.title} className="flex gap-3 rounded-lg bg-zinc-50 px-3 py-2.5">
                      <span className="text-sm font-semibold text-indigo-600 tabular-nums">{index + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-zinc-800">{section.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{section.hint}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
