import type { Metadata } from "next";
import Link from "next/link";
import { CourseGrid, type CourseWithCount } from "@/components/CourseGrid";
import { UpcomingEvents } from "@/components/UpcomingEvents";
import { shiftISODate, toISODate } from "@/lib/dates";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/lib/types";

export const metadata: Metadata = { title: "대시보드 · 강의노트" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  // 서버와 사용자의 시간대가 다를 수 있어 하루 여유를 두고 가져온 뒤 브라우저에서 D-day 계산
  const yesterday = shiftISODate(toISODate(new Date()), -1);

  const [{ data: courses }, { data: events }] = await Promise.all([
    supabase
      .from("courses")
      .select("*, documents(count)")
      .order("created_at", { ascending: true })
      .overrideTypes<CourseWithCount[], { merge: false }>(),
    supabase
      .from("events")
      .select("*")
      .or(`start_date.gte.${yesterday},end_date.gte.${yesterday}`)
      .order("start_date", { ascending: true })
      .limit(30)
      .overrideTypes<CalendarEvent[], { merge: false }>(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">안녕하세요, {user?.username}님</h1>
        <p className="mt-1 text-sm text-zinc-500">오늘 볼 강의자료를 골라 정리를 시작해 보세요.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-zinc-500">내 수업</h2>
          <CourseGrid courses={courses ?? []} />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-500">다가오는 일정</h2>
            <Link href="/calendar" className="text-xs font-medium text-indigo-600 hover:underline">
              캘린더 보기
            </Link>
          </div>
          <div className="card px-3 py-1">
            <UpcomingEvents events={events ?? []} courses={courses ?? []} />
          </div>
        </section>
      </div>
    </div>
  );
}
