"use client";

import { AudioLines, ClipboardPaste, LoaderCircle, Mic, Trash, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatFileSize, formatTimestamp } from "@/lib/dates";
import { deleteRecording, formatDuration, MAX_RECORDING_BYTES, saveRecording } from "@/lib/recordings";
import { createClient } from "@/lib/supabase/client";
import type { Recording, RecordingStatus } from "@/lib/types";
import { RecorderDialog } from "./RecorderDialog";
import { TranscriptDialog } from "./TranscriptDialog";

const STATUS: Record<RecordingStatus, { label: string; className: string }> = {
  ready: { label: "받아쓰기 전", className: "bg-zinc-100 text-zinc-600" },
  transcribing: { label: "받아쓰는 중", className: "bg-amber-100 text-amber-800" },
  transcribed: { label: "받아쓰기 완료", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "실패", className: "bg-rose-100 text-rose-700" },
};

export function RecordingList({
  userId,
  courseId,
  recordings,
}: {
  userId: string;
  courseId: string;
  recordings: Recording[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function uploadAudio(file: File) {
    setError("");
    if (!file.type.startsWith("audio/")) return setError("오디오 파일만 올릴 수 있어요.");
    if (file.size > MAX_RECORDING_BYTES) return setError("50MB 이하 파일만 올릴 수 있어요.");

    setUploading(file.name);
    const { id, error: saveError } = await saveRecording(createClient(), {
      userId,
      courseId,
      title: file.name.replace(/\.[^.]+$/, ""),
      blob: file,
      mimeType: file.type,
      durationSeconds: null,
      source: "upload",
    });
    setUploading(null);
    if (saveError || !id) return setError(saveError ?? "올리지 못했어요.");
    router.push(`/recordings/${id}`);
  }

  async function handleDelete(recording: Recording) {
    if (!confirm(`'${recording.title}' 을(를) 삭제할까요?\n받아쓰기와 요약도 함께 지워져요.`)) return;
    setBusyId(recording.id);
    const message = await deleteRecording(createClient(), recording);
    setBusyId(null);
    if (message) return setError(`삭제하지 못했어요: ${message}`);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-500">강의 녹음</h2>
          <p className="mt-0.5 text-xs text-zinc-400">녹음하면 받아쓰기와 AI 요약을 만들 수 있어요.</p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className="btn btn-primary" onClick={() => setRecorderOpen(true)}>
            <Mic size={15} /> 녹음하기
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> <span className="hidden sm:inline">오디오 올리기</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setTranscriptOpen(true)}>
            <ClipboardPaste size={15} /> <span className="hidden sm:inline">붙여넣기</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAudio(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {error && (
          <p className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            <span className="flex-1">{error}</span>
            <button type="button" className="icon-btn h-6 w-6" onClick={() => setError("")} aria-label="닫기">
              <X size={14} />
            </button>
          </p>
        )}
        {uploading && (
          <p className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-sm">
            <LoaderCircle size={16} className="animate-spin text-indigo-500" />
            <span className="min-w-0 flex-1 truncate">{uploading}</span>
            <span className="text-xs text-zinc-400">올리는 중...</span>
          </p>
        )}

        {recordings.length === 0 && !uploading ? (
          <button
            type="button"
            onClick={() => setRecorderOpen(true)}
            className="flex w-full flex-col items-center gap-2 px-4 py-12 text-sm text-zinc-400 hover:text-indigo-600"
          >
            <Mic size={24} />
            수업을 녹음해 보세요
          </button>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recordings.map((recording) => {
              const status = STATUS[recording.status];
              return (
                <li
                  key={recording.id}
                  className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-indigo-50/40 ${
                    busyId === recording.id ? "opacity-50" : ""
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
                    <AudioLines size={20} />
                  </span>
                  <Link href={`/recordings/${recording.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-indigo-600">
                      {recording.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                      {recording.summary && <span className="text-indigo-500">요약 있음</span>}
                      {recording.duration_seconds ? <span>{formatDuration(recording.duration_seconds)}</span> : null}
                      {recording.file_size ? <span>{formatFileSize(recording.file_size)}</span> : null}
                      <span suppressHydrationWarning>{formatTimestamp(recording.created_at)}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="icon-btn shrink-0 opacity-100 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => handleDelete(recording)}
                    aria-label="녹음 삭제"
                  >
                    <Trash size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RecorderDialog
        open={recorderOpen}
        onClose={() => setRecorderOpen(false)}
        userId={userId}
        courseId={courseId}
      />
      <TranscriptDialog open={transcriptOpen} onClose={() => setTranscriptOpen(false)} courseId={courseId} />
    </>
  );
}
