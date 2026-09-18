import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudyView } from "@/components/study/StudyView";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, Course, DocumentRow, Note } from "@/lib/types";

export const metadata: Metadata = { title: "학습 · 강의노트" };

const SIGNED_URL_SECONDS = 60 * 60 * 6;

type DocumentWithCourse = DocumentRow & { course: Pick<Course, "id" | "name" | "color"> };

export default async function StudyPage({ params }: PageProps<"/study/[documentId]">) {
  const { documentId } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("*, course:courses(id, name, color)")
    .eq("id", documentId)
    .maybeSingle<DocumentWithCourse>();
  if (!doc) notFound();

  const [{ data: signed }, { data: notes }, { data: messages }] = await Promise.all([
    // 비공개 버킷이라 일정 시간만 유효한 서명 URL 로 PDF 를 연다
    supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS),
    supabase
      .from("notes")
      .select("*")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: true })
      .overrideTypes<Note[], { merge: false }>(),
    supabase
      .from("chat_messages")
      .select("*")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .overrideTypes<ChatMessage[], { merge: false }>(),
  ]);

  const { course, ...document } = doc;

  return (
    <StudyView
      document={document}
      course={course}
      pdfUrl={signed?.signedUrl ?? null}
      initialNotes={notes ?? []}
      initialMessages={(messages ?? []).reverse()}
      aiEnabled={Boolean(process.env.OPENAI_API_KEY)}
    />
  );
}
