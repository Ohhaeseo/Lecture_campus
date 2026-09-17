import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { CourseGrid, type CourseWithCount } from "@/components/CourseGrid";
import { UpcomingEvents } from "@/components/UpcomingEvents";
import { shiftISODate, toISODate } from "@/lib/dates";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { CalendarEvent, Course, DocumentRow } from "@/lib/types";

type RecentDocument = Pick<DocumentRow, "id" | "title" | "page_count" | "last_page"> & {
  course: Pick<Course, "name" | "color"> | null;
};

export const metadata: Metadata = { title: "대시보드 · 강의노트" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  // 서버와 사용자의 시간대가 다를 수 있어 하루 여유를 두고 가져온 뒤 브라우저에서 D-day 계산
  const yesterday = shiftISODate(toISODate(new Date()), -1);

  const [{ data: courses }, { data: events }, { data: recentDocs }] = await Promise.all([
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
    // 마지막으로 본 페이지가 저장될 때 updated_at 이 갱신되므로 최근에 본/올린 순서
    supabase
      .from("documents")
      .select("id, title, page_count, last_page, course:courses(name, color)")
      .order("updated_at", { ascending: false })
      .limit(4)
      .overrideTypes<RecentDocument[], { merge: false }>(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">안녕하세요, {user?.username}님</h1>
        <p className="mt-1 text-sm text-zinc-500">오늘 볼 강의자료를 골라 정리를 시작해 보세요.</p>
      </header>

      {recentDocs && recentDocs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-500">최근 강의자료</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentDocs.map((doc) => {
              const progress = doc.page_count ? Math.round((doc.last_page / doc.page_count) * 100) : 0;
              return (
                <Link
                  key={doc.id}
                  href={`/study/${doc.id}`}
                  className="card group flex flex-col gap-2 p-4 transition hover:border-indigo-300 hover:shadow-md"
                >
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: doc.course?.color ?? "#a1a1aa" }}
                    />
                    <span className="truncate">{doc.course?.name}</span>
                  </span>
                  <span className="line-clamp-2 text-sm font-semibold group-hover:text-indigo-600">{doc.title}</span>
                  <span className="mt-auto flex items-center justify-between pt-1 text-xs text-zinc-400">
                    <span>{doc.page_count ? `${doc.last_page} / ${doc.page_count}쪽` : "아직 안 열어봄"}</span>
                    <span className="flex items-center gap-1 font-medium text-indigo-600">
                      <BookOpen size={13} /> {doc.page_count && doc.last_page > 1 ? "이어서 보기" : "열기"}
                    </span>
                  </span>
                  <span className="h-1 overflow-hidden rounded-full bg-zinc-100">
                    <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${progress}%` }} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

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
