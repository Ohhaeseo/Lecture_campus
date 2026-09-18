"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ErrorText, Modal } from "../Modal";

type Props = { open: boolean; onClose: () => void; courseId: string };

/** 이미 가지고 있는 받아쓰기(전사문)를 붙여넣어 바로 요약할 수 있게 하는 창 */
export function TranscriptDialog(props: Props) {
  if (!props.open) return null;
  return <TranscriptDialogInner {...props} />;
}

function TranscriptDialogInner({ open, onClose, courseId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = transcript.trim();
    if (!text) return setError("내용을 붙여넣어 주세요.");

    setSaving(true);
    setError("");
    const { data, error: insertError } = await createClient()
      .from("recordings")
      .insert({
        course_id: courseId,
        title: title.trim() || "붙여넣은 강의 내용",
        source: "text",
        status: "transcribed",
        transcript: text,
      })
      .select("id")
      .single<{ id: string }>();
    setSaving(false);
    if (insertError) return setError(`저장하지 못했어요: ${insertError.message}`);
    onClose();
    router.push(`/recordings/${data.id}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="강의 내용 붙여넣기" width="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-zinc-500">
          다른 곳에서 받아쓴 강의 내용이나 필기를 붙여넣으면, 녹음 없이도 AI 요약을 만들 수 있어요.
        </p>
        <div>
          <label className="label" htmlFor="transcript-title">
            제목
          </label>
          <input
            id="transcript-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 3주차 강의 필기"
            maxLength={200}
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="transcript-body">
            내용
          </label>
          <textarea
            id="transcript-body"
            className="input min-h-60 resize-y font-mono text-xs"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="강의 내용을 여기에 붙여넣으세요."
          />
          <p className="mt-1 text-right text-xs text-zinc-400">{transcript.length.toLocaleString()}자</p>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !transcript.trim()}>
            {saving ? "저장 중..." : "저장하고 열기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
