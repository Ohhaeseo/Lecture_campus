"use client";

import { useState } from "react";
import { daysUntil, formatDday, formatRangeKo, parseISODate } from "@/lib/dates";
import { eventTypeMeta, type CalendarEvent, type Course } from "@/lib/types";
import { useTodayISO } from "@/lib/useToday";
import { EventDialog } from "./EventDialog";

/** D-day 와 함께 다가오는 일정 목록. 날짜 계산은 사용자 브라우저 시간 기준 */
export function UpcomingEvents({
  events,
  courses,
  limit = 6,
  emptyText = "다가오는 일정이 없어요.",
}: {
  events: CalendarEvent[];
  courses: Course[];
  limit?: number;
  emptyText?: string;
}) {
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const todayISO = useTodayISO();
  const courseById = new Map(courses.map((c) => [c.id, c]));

  if (!todayISO) return <div className="h-24" />;
  const today = parseISODate(todayISO);

  const upcoming = events
    .filter((e) => daysUntil(e.end_date ?? e.start_date, today) >= 0)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, limit);

  if (upcoming.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-400">{emptyText}</p>;
  }

  return (
    <>
      <ul className="divide-y divide-zinc-100">
        {upcoming.map((event) => {
          const course = event.course_id ? courseById.get(event.course_id) : undefined;
          const start = daysUntil(event.start_date, today);
          const ongoing = start < 0;
          const type = eventTypeMeta(event.type);
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => setEditing(event)}
                className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-zinc-50"
              >
                <span
                  className={`w-14 shrink-0 rounded-md py-1 text-center text-xs font-bold ${
                    ongoing || start === 0
                      ? "bg-rose-600 text-white"
                      : start <= 7
                        ? "bg-rose-50 text-rose-600"
                        : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {ongoing ? "진행 중" : formatDday(start)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${type.className}`}>
                      {type.label}
                    </span>
                    <span className="truncate text-sm font-medium">{event.title}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
                    {course && (
                      <>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: course.color }}
                        />
                        <span className="truncate">{course.name}</span>
                        <span>·</span>
                      </>
                    )}
                    <span className="shrink-0">{formatRangeKo(event.start_date, event.end_date)}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <EventDialog
        open={Boolean(editing)}
        event={editing}
        courses={courses}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
