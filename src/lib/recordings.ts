import type { SupabaseClient } from "@supabase/supabase-js";
import { RECORDINGS_BUCKET } from "./supabase/env";
import type { Recording, RecordingSource } from "./types";

/** Supabase 무료 플랜 업로드 한도 */
export const MAX_RECORDING_BYTES = 50 * 1024 * 1024;

/** 브라우저가 지원하는 녹음 형식 중 하나를 고른다 (사파리는 mp4 만 되는 버전이 있음) */
export function pickRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/** 'audio/webm;codecs=opus' -> { contentType: 'audio/webm', extension: 'webm' } */
export function describeAudioType(mimeType: string) {
  const contentType = (mimeType.split(";")[0] || "audio/webm").toLowerCase();
  const extension =
    {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/aac": "aac",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/flac": "flac",
    }[contentType] ?? "webm";
  return { contentType, extension };
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds && seconds !== 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

type SaveInput = {
  userId: string;
  courseId: string;
  title: string;
  blob: Blob;
  mimeType: string;
  durationSeconds: number | null;
  source: RecordingSource;
};

/** 오디오를 Storage 에 올리고 recordings 행을 만든다. 성공하면 id, 실패하면 error 를 돌려준다 */
export async function saveRecording(
  supabase: SupabaseClient,
  { userId, courseId, title, blob, mimeType, durationSeconds, source }: SaveInput,
): Promise<{ id?: string; error?: string }> {
  if (blob.size === 0) return { error: "녹음된 소리가 없어요." };
  if (blob.size > MAX_RECORDING_BYTES) {
    return { error: "50MB 이하만 올릴 수 있어요. 더 짧게 나눠서 녹음해 주세요." };
  }

  const id = crypto.randomUUID();
  const { contentType, extension } = describeAudioType(mimeType || blob.type);
  const storagePath = `${userId}/${courseId}/${id}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(storagePath, blob, { contentType });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await supabase.from("recordings").insert({
    id,
    course_id: courseId,
    title: title.trim() || "제목 없는 녹음",
    source,
    storage_path: storagePath,
    file_size: blob.size,
    duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
  });
  if (insertError) {
    await supabase.storage.from(RECORDINGS_BUCKET).remove([storagePath]);
    return { error: insertError.message };
  }
  return { id };
}

/** 녹음 삭제 (Storage 파일 + DB 행) */
export async function deleteRecording(
  supabase: SupabaseClient,
  recording: Pick<Recording, "id" | "storage_path">,
) {
  if (recording.storage_path) {
    const { error } = await supabase.storage
      .from(RECORDINGS_BUCKET)
      .remove([recording.storage_path]);
    if (error) return error.message;
  }
  const { error } = await supabase.from("recordings").delete().eq("id", recording.id);
  return error?.message ?? null;
}
