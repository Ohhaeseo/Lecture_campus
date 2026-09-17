"use client";

import { FileText, Pencil, Plus, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteCourse } from "@/lib/courses";
import { createClient } from "@/lib/supabase/client";
import type { Course } from "@/lib/types";
import { CourseDialog } from "./CourseDialog";

export type CourseWithCount = Course & { documents: { count: number }[] };

export function CourseGrid({ courses }: { courses: CourseWithCount[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ course: Course | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(course: Course) {
    if (!confirm(`'${course.name}' 수업을 삭제할까요?\n강의자료, 메모, AI 대화, 일정이 모두 함께 삭제돼요.`)) {
      return;
    }
    setDeletingId(course.id);
    const error = await deleteCourse(createClient(), course.id);
    setDeletingId(null);
    if (error) return alert(`삭제하지 못했어요: ${error}`);
    router.refresh();
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((course) => (
          <div
            key={course.id}
            className={`card group relative overflow-hidden transition hover:shadow-md ${
              deletingId === course.id ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <div className="h-1.5" style={{ backgroundColor: course.color }} />
            <Link href={`/courses/${course.id}`} className="block p-4">
              <h3 className="truncate pr-16 font-semibold">{course.name}</h3>
              <p className="mt-0.5 truncate text-sm text-zinc-500">
                {[course.professor, course.semester].filter(Boolean).join(" · ") || " "}
              </p>
              <p className="mt-4 flex items-center gap-1 text-xs text-zinc-400">
                <FileText size={13} /> 강의자료 {course.documents?.[0]?.count ?? 0}개
              </p>
            </Link>
            <div className="absolute top-3.5 right-2 flex opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setDialog({ course })}
                aria-label={`${course.name} 수정`}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="icon-btn hover:text-rose-600"
                onClick={() => handleDelete(course)}
                aria-label={`${course.name} 삭제`}
              >
                <Trash size={15} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setDialog({ course: null })}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 text-sm text-zinc-400 transition hover:border-indigo-300 hover:text-indigo-600"
        >
          <Plus size={20} />
          새 수업 추가
        </button>
      </div>

      <CourseDialog open={Boolean(dialog)} course={dialog?.course} onClose={() => setDialog(null)} />
    </>
  );
}
