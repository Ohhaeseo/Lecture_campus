"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { EVENT_TYPES, type CalendarEvent, type Course, type EventType } from "@/lib/types";
import { ErrorText, Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  courses: Course[];
  /** 수정할 일정. 없으면 새로 만들기 */
  event?: CalendarEvent | null;
  defaultDate?: string;
  defaultCourseId?: string | null;
  onChanged?: () => void;
};

export function EventDialog(props: Props) {
  if (!props.open) return null;
  return <EventDialogInner key={props.event?.id ?? `new-${props.defaultDate}`} {...props} />;
}

function EventDialogInner({
  open,
  onClose,
  courses,
  event,
  defaultDate,
  defaultCourseId,
  onChanged,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(event?.title ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "exam");
  const [courseId, setCourseId] = useState(event?.course_id ?? defaultCourseId ?? "");
  const [startDate, setStartDate] = useState(event?.start_date ?? defaultDate ?? toISODate(new Date()));
  const [isRange, setIsRange] = useState(Boolean(event?.end_date && event.end_date !== event.start_date));
  const [endDate, setEndDate] = useState(event?.end_date ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function done() {
    onChanged?.();
    onClose();
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("일정 제목을 입력해 주세요.");
    if (!startDate) return setError("날짜를 선택해 주세요.");
    if (isRange && endDate && endDate < startDate) {
      return setError("종료일은 시작일보다 빠를 수 없어요.");
    }

    setBusy(true);
    setError("");
    const supabase = createClient();
    const values = {
      title: title.trim(),
      type,
      course_id: courseId || null,
      start_date: startDate,
      end_date: isRange && endDate ? endDate : null,
      description: description.trim() || null,
    };
    const { error } = event
      ? await supabase.from("events").update(values).eq("id", event.id)
      : await supabase.from("events").insert(values);
    setBusy(false);
    if (error) return setError(`저장하지 못했어요: ${error.message}`);
    done();
  }

  async function handleDelete() {
    if (!event || !confirm(`'${event.title}' 일정을 삭제할까요?`)) return;
    setBusy(true);
    const { error } = await createClient().from("events").delete().eq("id", event.id);
    setBusy(false);
    if (error) return setError(`삭제하지 못했어요: ${error.message}`);
    done();
  }

  return (
    <Modal open={open} onClose={onClose} title={event ? "일정 수정" : "일정 추가"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="event-title">
            제목 <span className="text-rose-500">*</span>
          </label>
          <input
            id="event-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 중간고사"
            maxLength={100}
            autoFocus
          />
        </div>

        <div>
          <span className="label">종류</span>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                aria-pressed={type === t.value}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  type === t.value
                    ? `${t.className} font-semibold ring-1 ring-current`
                    : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="event-course">
            수업
          </label>
          <select
            id="event-course"
            className="input"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">수업 선택 안 함</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700" htmlFor="event-start">
              {isRange ? "기간" : "날짜"}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={isRange}
                onChange={(e) => {
                  setIsRange(e.target.checked);
                  if (e.target.checked && !endDate) setEndDate(startDate);
                }}
              />
              여러 날 (시험 기간 등)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="event-start"
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {isRange && (
              <>
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  className="input"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-label="종료일"
                />
              </>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="event-description">
            메모
          </label>
          <textarea
            id="event-description"
            className="input min-h-20 resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="시험 범위, 준비물 등"
          />
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex items-center justify-between gap-2 pt-1">
          {event ? (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={handleDelete} disabled={busy}>
              삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
