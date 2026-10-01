import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SummaryStudio } from "@/components/recordings/SummaryStudio";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";

export const metadata: Metadata = { title: "AI 수업 요약 · 강의노트" };

export default async function CourseSummaryPage({ params }: PageProps<"/courses/[courseId]/summary">) {
  const { courseId } = await params;
  const supabase = await createClient();

  // RLS 덕분에 본인 수업만 조회됨
  const { data: course } = await supabase
    .from("courses")
    .select("id, name, color")
    .eq("id", courseId)
    .maybeSingle<Pick<Course, "id" | "name" | "color">>();
  if (!course) notFound();

  return <SummaryStudio course={course} aiEnabled={Boolean(process.env.OPENAI_API_KEY)} />;
}
