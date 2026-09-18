import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseDetail } from "@/components/CourseDetail";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { CalendarEvent, Course, DocumentRow, Recording } from "@/lib/types";

export const metadata: Metadata = { title: "수업 · 강의노트" };

export default async function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle<Course>();
  if (!course || !user) notFound();

  const [{ data: documents }, { data: events }, { data: courses }, { data: recordings }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .overrideTypes<DocumentRow[], { merge: false }>(),
    supabase
      .from("events")
      .select("*")
      .eq("course_id", courseId)
      .order("start_date", { ascending: true })
      .overrideTypes<CalendarEvent[], { merge: false }>(),
    supabase.from("courses").select("*").overrideTypes<Course[], { merge: false }>(),
    supabase
      .from("recordings")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .overrideTypes<Recording[], { merge: false }>(),
  ]);

  return (
    <CourseDetail
      userId={user.id}
      course={course}
      documents={documents ?? []}
      events={events ?? []}
      courses={courses ?? []}
      recordings={recordings ?? []}
    />
  );
}
