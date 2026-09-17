import type { Metadata } from "next";
import { CalendarView } from "@/components/CalendarView";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, Course } from "@/lib/types";

export const metadata: Metadata = { title: "캘린더 · 강의노트" };

export default async function CalendarPage() {
  const supabase = await createClient();
  const [{ data: events }, { data: courses }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .order("start_date", { ascending: true })
      .overrideTypes<CalendarEvent[], { merge: false }>(),
    supabase
      .from("courses")
      .select("*")
      .order("created_at", { ascending: true })
      .overrideTypes<Course[], { merge: false }>(),
  ]);

  return <CalendarView events={events ?? []} courses={courses ?? []} />;
}
