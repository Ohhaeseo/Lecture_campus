import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENTS_BUCKET } from "./supabase/env";

/**
 * 수업 삭제. DB 는 on delete cascade 로 자료/메모/일정이 함께 지워지지만
 * Storage 의 PDF 파일은 자동으로 지워지지 않으므로 먼저 삭제한다.
 */
export async function deleteCourse(supabase: SupabaseClient, courseId: string) {
  const { data: docs, error: listError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("course_id", courseId);
  if (listError) return listError.message;

  const paths = (docs ?? []).map((d) => d.storage_path as string);
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (error) return error.message;
  }

  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  return error?.message ?? null;
}

/** 강의자료 1개 삭제 (Storage 파일 + DB 행) */
export async function deleteDocument(
  supabase: SupabaseClient,
  doc: { id: string; storage_path: string },
) {
  const { error: storageError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([doc.storage_path]);
  if (storageError) return storageError.message;
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  return error?.message ?? null;
}
