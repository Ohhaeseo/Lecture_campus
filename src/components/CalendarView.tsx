"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { parseISODate, toISODate } from "@/lib/dates";
import { eventTypeMeta, type CalendarEvent, type Course } from "@/lib/types";
import { useTodayISO } from "@/lib/useToday";
import { EventDialog } from "./EventDialog";
import { UpcomingEvents } from "./UpcomingEvents";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE = 3;

/** 달력에 표시할 날짜(일요일 시작)와 날짜별 일정 목록 */
function buildMonth(first: Date, events: CalendarEvent[]) {
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  const days = Array.from(
    { length: weeks * 7 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i),
  );

  const rangeStart = toISODate(days[0]);
  const rangeEnd = toISODate(days[days.length - 1]);
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const end = event.end_date ?? event.start_date;
    if (end < rangeStart || event.start_date > rangeEnd) continue;
    const cursor = parseISODate(event.start_date > rangeStart ? event.start_date : rangeStart);
    const last = end < rangeEnd ? end : rangeEnd;
    while (toISODate(cursor) <= last) {
      const key = toISODate(cursor);
      byDate.set(key, [...(byDate.get(key) ?? []), event]);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  // 여러 날 일정을 위로
  for (const list of byDate.values()) {
    list.sort((a, b) => Number(Boolean(b.end_date)) - Number(Boolean(a.end_date)));
  }
  return { days, byDate };
}

export function CalendarView({ events, courses }: { events: CalendarEvent[]; courses: Course[] }) {
  const todayISO = useTodayISO();
  const [monthOffset, setMonthOffset] = useState(0);
  const [courseFilter, setCourseFilter] = useState("");
  const [dialog, setDialog] = useState<{ event?: CalendarEvent; date?: string } | null>(null);

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const filtered = useMemo(
    () => (courseFilter ? events.filter((e) => e.course_id === courseFilter) : events),
    [events, courseFilter],
  );

  const today = todayISO ? parseISODate(todayISO) : null;
  const month = today ? new Date(today.getFullYear(), today.getMonth() + monthOffset, 1) : null;

  const { days, byDate } = month
    ? buildMonth(month, filtered)
    : { days: [], byDate: new Map<string, CalendarEvent[]>() };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-36 text-2xl font-bold tracking-tight">
            {month ? `${month.getFullYear()}년 ${month.getMonth() + 1}월` : "캘린더"}
          </h1>
          <button type="button" className="icon-btn" onClick={() => setMonthOffset((m) => m - 1)} aria-label="이전 달">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setMonthOffset((m) => m + 1)} aria-label="다음 달">
            <ChevronRight size={18} />
          </button>
          <button type="button" className="btn btn-secondary px-2.5 py-1 text-xs" onClick={() => setMonthOffset(0)}>
            오늘
          </button>
        </div>
        <div className="flex gap-2">
          <select
            className="input w-auto py-1.5"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            aria-label="수업 필터"
          >
            <option value="">전체 수업</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ date: todayISO ?? undefined })}>
            <Plus size={15} /> 일정 추가
          </button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-semibold text-zinc-500">
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className={`py-2 ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : ""}`}
              >
                {d}
              </div>
            ))}
          </div>

          {!month ? (
            <div className="h-[600px]" />
          ) : (
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = toISODate(day);
                const inMonth = day.getMonth() === month.getMonth();
                const isToday = key === todayISO;
                const dayEvents = byDate.get(key) ?? [];
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDialog({ date: key })}
                    onKeyDown={(e) => e.key === "Enter" && setDialog({ date: key })}
                    className={`group min-h-24 cursor-pointer border-r border-b border-zinc-100 p-1 transition-colors hover:bg-indigo-50/40 sm:min-h-28 ${
                      inMonth ? "bg-white" : "bg-zinc-50/70"
                    }`}
                    aria-label={`${day.getMonth() + 1}월 ${day.getDate()}일, 일정 ${dayEvents.length}개`}
                  >
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span
                        className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs ${
                          isToday
                            ? "bg-indigo-600 font-bold text-white"
                            : !inMonth
                              ? "text-zinc-300"
                              : day.getDay() === 0
                                ? "text-rose-500"
                                : day.getDay() === 6
                                  ? "text-sky-600"
                                  : "text-zinc-700"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <Plus size={13} className="text-zinc-300 opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, MAX_VISIBLE).map((event) => {
                        const course = event.course_id ? courseById.get(event.course_id) : undefined;
                        const type = eventTypeMeta(event.type);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDialog({ event });
                            }}
                            className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-4 font-medium ${type.className} ${
                              inMonth ? "" : "opacity-60"
                            }`}
                            title={`[${type.label}] ${event.title}${course ? ` · ${course.name}` : ""}`}
                          >
                            {course && (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: course.color }}
                              />
                            )}
                            <span className="truncate">{event.title}</span>
                          </button>
                        );
                      })}
                      {dayEvents.length > MAX_VISIBLE && (
                        <p className="px-1.5 text-[11px] text-zinc-400">+{dayEvents.length - MAX_VISIBLE}개 더</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside>
          <h2 className="mb-3 text-sm font-semibold text-zinc-500">다가오는 일정</h2>
          <div className="card px-3 py-1">
            <UpcomingEvents events={filtered} courses={courses} limit={10} />
          </div>
        </aside>
      </div>

      <EventDialog
        open={Boolean(dialog)}
        event={dialog?.event}
        defaultDate={dialog?.date}
        defaultCourseId={courseFilter || null}
        courses={courses}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
