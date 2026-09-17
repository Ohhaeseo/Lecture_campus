"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COURSE_COLORS, type Course } from "@/lib/types";
import { ErrorText, Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 수정할 수업. 없으면 새로 만들기 */
  course?: Course | null;
  onSaved?: (course: Course) => void;
};

export function CourseDialog(props: Props) {
  // 열릴 때마다 폼 상태를 초기화하기 위해 key 로 다시 마운트
  if (!props.open) return null;
  return <CourseDialogInner key={props.course?.id ?? "new"} {...props} />;
}

function CourseDialogInner({ open, onClose, course, onSaved }: Props) {
  const router = useRouter();
  const [name, setName] = useState(course?.name ?? "");
  const [professor, setProfessor] = useState(course?.professor ?? "");
  const [semester, setSemester] = useState(course?.semester ?? defaultSemester());
  const [color, setColor] = useState(course?.color ?? COURSE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("수업 이름을 입력해 주세요.");
    setSaving(true);
    setError("");

    const supabase = createClient();
    const values = {
      name: name.trim(),
      professor: professor.trim() || null,
      semester: semester.trim() || null,
      color,
    };
    const query = course
      ? supabase.from("courses").update(values).eq("id", course.id)
      : supabase.from("courses").insert(values);
    const { data, error } = await query.select().single<Course>();

    setSaving(false);
    if (error) return setError(`저장하지 못했어요: ${error.message}`);
    onSaved?.(data);
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={course ? "수업 수정" : "새 수업 만들기"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="course-name">
            수업 이름 <span className="text-rose-500">*</span>
          </label>
          <input
            id="course-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 자료구조"
            maxLength={100}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="course-professor">
              교수님
            </label>
            <input
              id="course-professor"
              className="input"
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              placeholder="예) 김교수"
              maxLength={50}
            />
          </div>
          <div>
            <label className="label" htmlFor="course-semester">
              학기
            </label>
            <input
              id="course-semester"
              className="input"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              placeholder="예) 2026-2학기"
              maxLength={50}
            />
          </div>
        </div>
        <div>
          <span className="label">색상</span>
          <div className="flex flex-wrap gap-2">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 transition focus-visible:ring-2"
                style={{ backgroundColor: c }}
                aria-label={`색상 ${c}`}
                aria-pressed={color === c}
              >
                {color === c && <Check size={16} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "저장 중..." : course ? "저장" : "만들기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function defaultSemester() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const term = month >= 3 && month <= 8 ? 1 : 2;
  const year = month <= 2 ? now.getFullYear() - 1 : now.getFullYear();
  return `${year}-${term}학기`;
}
