"use client";

import { Check, FileText, LoaderCircle, Pencil, Plus, Trash, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteCourse, deleteDocument } from "@/lib/courses";
import { formatFileSize, formatTimestamp } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/env";
import type { CalendarEvent, Course, DocumentRow } from "@/lib/types";
import { CourseDialog } from "./CourseDialog";
import { EventDialog } from "./EventDialog";
import { UpcomingEvents } from "./UpcomingEvents";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // Supabase 무료 플랜 업로드 한도

type UploadItem = { id: string; name: string; error?: string };

export function CourseDetail({
  userId,
  course,
  documents,
  events,
  courses,
}: {
  userId: string;
  course: Course;
  documents: DocumentRow[];
  events: CalendarEvent[];
  courses: Course[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editingCourse, setEditingCourse] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function uploadFiles(files: FileList | File[]) {
    const supabase = createClient();
    const list = Array.from(files);

    await Promise.all(
      list.map(async (file) => {
        const id = crypto.randomUUID();
        const setError = (error: string) =>
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, error } : u)));

        setUploads((prev) => [...prev, { id, name: file.name }]);

        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          return setError("PDF 파일만 올릴 수 있어요.");
        }
        if (file.size > MAX_FILE_SIZE) {
          return setError("50MB 이하 파일만 올릴 수 있어요.");
        }

        const storagePath = `${userId}/${course.id}/${id}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .upload(storagePath, file, { contentType: "application/pdf" });
        if (uploadError) return setError(uploadError.message);

        const { error: insertError } = await supabase.from("documents").insert({
          id,
          course_id: course.id,
          title: file.name.replace(/\.pdf$/i, ""),
          storage_path: storagePath,
          file_size: file.size,
        });
        if (insertError) {
          await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
          return setError(insertError.message);
        }

        setUploads((prev) => prev.filter((u) => u.id !== id));
      }),
    );
    router.refresh();
  }

  async function handleRename(doc: DocumentRow) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === doc.title) return;
    setBusyId(doc.id);
    const { error } = await createClient().from("documents").update({ title }).eq("id", doc.id);
    setBusyId(null);
    if (error) return alert(`이름을 바꾸지 못했어요: ${error.message}`);
    router.refresh();
  }

  async function handleDeleteDocument(doc: DocumentRow) {
    if (!confirm(`'${doc.title}' 자료를 삭제할까요?\n이 자료의 메모와 AI 대화도 함께 삭제돼요.`)) return;
    setBusyId(doc.id);
    const error = await deleteDocument(createClient(), doc);
    setBusyId(null);
    if (error) return alert(`삭제하지 못했어요: ${error}`);
    router.refresh();
  }

  async function handleDeleteCourse() {
    if (!confirm(`'${course.name}' 수업을 삭제할까요?\n강의자료, 메모, AI 대화, 일정이 모두 함께 삭제돼요.`)) {
      return;
    }
    const error = await deleteCourse(createClient(), course.id);
    if (error) return alert(`삭제하지 못했어요: ${error}`);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 h-8 w-1.5 rounded-full" style={{ backgroundColor: course.color }} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{course.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {[course.professor, course.semester].filter(Boolean).join(" · ") || "교수님과 학기 정보를 추가해 보세요"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingCourse(true)}>
            <Pencil size={15} /> 수정
          </button>
          <button type="button" className="btn btn-secondary text-rose-600" onClick={handleDeleteCourse}>
            <Trash size={15} /> 삭제
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-500">강의자료</h2>
            <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
              <Upload size={15} /> PDF 올리기
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
            className={`card overflow-hidden transition ${dragOver ? "border-indigo-400 ring-4 ring-indigo-500/10" : ""}`}
          >
            {uploads.length > 0 && (
              <ul className="divide-y divide-zinc-100 border-b border-zinc-100 bg-zinc-50/60">
                {uploads.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {u.error ? (
                      <X size={16} className="text-rose-500" />
                    ) : (
                      <LoaderCircle size={16} className="animate-spin text-indigo-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    {u.error ? (
                      <>
                        <span className="text-xs text-rose-600">{u.error}</span>
                        <button
                          type="button"
                          className="icon-btn h-6 w-6"
                          onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}
                          aria-label="닫기"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-zinc-400">업로드 중...</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {documents.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 px-4 py-14 text-sm text-zinc-400 hover:text-indigo-600"
              >
                <Upload size={24} />
                강의자료 PDF를 여기로 끌어다 놓거나 클릭해서 올리세요
              </button>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className={`group flex items-center gap-3 px-4 py-3 ${busyId === doc.id ? "opacity-50" : ""}`}
                  >
                    <FileText size={20} className="shrink-0 text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      {renamingId === doc.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleRename(doc);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            className="input py-1"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Escape" && setRenamingId(null)}
                            maxLength={200}
                            autoFocus
                          />
                          <button type="submit" className="icon-btn" aria-label="이름 저장">
                            <Check size={16} />
                          </button>
                        </form>
                      ) : (
                        <Link href={`/study/${doc.id}`} className="block">
                          <span className="block truncate text-sm font-medium group-hover:text-indigo-600">
                            {doc.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-zinc-400">
                            {doc.page_count ? <span>{doc.page_count}쪽</span> : null}
                            {doc.file_size ? <span>{formatFileSize(doc.file_size)}</span> : null}
                            <span suppressHydrationWarning>{formatTimestamp(doc.created_at)} 업로드</span>
                            {doc.page_count && doc.last_page > 1 ? (
                              <span className="text-indigo-500">{doc.last_page}쪽까지 봄</span>
                            ) : null}
                          </span>
                        </Link>
                      )}
                    </div>
                    {renamingId !== doc.id && (
                      <div className="flex shrink-0 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => {
                            setRenameValue(doc.title);
                            setRenamingId(doc.id);
                          }}
                          aria-label="이름 바꾸기"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn hover:text-rose-600"
                          onClick={() => handleDeleteDocument(doc)}
                          aria-label="자료 삭제"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-500">이 수업 일정</h2>
            <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setAddingEvent(true)}>
              <Plus size={14} /> 일정 추가
            </button>
          </div>
          <div className="card px-3 py-1">
            <UpcomingEvents
              events={events}
              courses={courses}
              limit={20}
              emptyText="시험, 과제 일정을 추가해 보세요."
            />
          </div>
        </section>
      </div>

      <CourseDialog open={editingCourse} course={course} onClose={() => setEditingCourse(false)} />
      <EventDialog
        open={addingEvent}
        courses={courses}
        defaultCourseId={course.id}
        onClose={() => setAddingEvent(false)}
      />
    </div>
  );
}
