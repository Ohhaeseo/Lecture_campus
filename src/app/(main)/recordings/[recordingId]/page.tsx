import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordingDetail } from "@/components/recordings/RecordingDetail";
import { RECORDINGS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Course, Recording } from "@/lib/types";

export const metadata: Metadata = { title: "강의 녹음 · 강의노트" };

const SIGNED_URL_SECONDS = 60 * 60 * 6;

type RecordingWithCourse = Recording & { course: Pick<Course, "id" | "name" | "color"> };

export default async function RecordingPage({ params }: PageProps<"/recordings/[recordingId]">) {
  const { recordingId } = await params;
  const supabase = await createClient();

  const { data: recording } = await supabase
    .from("recordings")
    .select("*, course:courses(id, name, color)")
    .eq("id", recordingId)
    .maybeSingle<RecordingWithCourse>();
  if (!recording) notFound();

  const { data: signed } = recording.storage_path
    ? await supabase.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUrl(recording.storage_path, SIGNED_URL_SECONDS)
    : { data: null };

  const { course, ...rest } = recording;

  return (
    <RecordingDetail
      recording={rest}
      course={course}
      audioUrl={signed?.signedUrl ?? null}
      transcribeEnabled={Boolean(process.env.DEEPGRAM_API_KEY)}
      aiEnabled={Boolean(process.env.OPENAI_API_KEY)}
    />
  );
}
