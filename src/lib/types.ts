export type Course = {
  id: string;
  user_id: string;
  name: string;
  professor: string | null;
  semester: string | null;
  color: string;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  storage_path: string;
  file_size: number | null;
  page_count: number | null;
  last_page: number;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  user_id: string;
  document_id: string;
  page: number | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  document_id: string;
  role: "user" | "assistant";
  content: string;
  page: number | null;
  created_at: string;
};

export type EventType = "exam" | "assignment" | "quiz" | "presentation" | "etc";

export type CalendarEvent = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  type: EventType;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export const EVENT_TYPES: { value: EventType; label: string; className: string }[] = [
  { value: "exam", label: "시험", className: "bg-rose-100 text-rose-700" },
  { value: "assignment", label: "과제", className: "bg-amber-100 text-amber-800" },
  { value: "quiz", label: "퀴즈", className: "bg-violet-100 text-violet-700" },
  { value: "presentation", label: "발표", className: "bg-sky-100 text-sky-700" },
  { value: "etc", label: "기타", className: "bg-zinc-100 text-zinc-700" },
];

export function eventTypeMeta(type: EventType) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
}

export const COURSE_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#64748b", // slate
];

export type RecordingSource = "recording" | "upload" | "text";
export type RecordingStatus = "ready" | "transcribing" | "transcribed" | "failed";

/** 받아쓰기 구간 (Deepgram 문단 단위) */
export type TranscriptSegment = { start: number; end: number; text: string };

export type Recording = {
  id: string;
  user_id: string;
  course_id: string;
  document_id: string | null;
  title: string;
  source: RecordingSource;
  status: RecordingStatus;
  storage_path: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  transcript: string | null;
  segments: TranscriptSegment[] | null;
  summary: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
