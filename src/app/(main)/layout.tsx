import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .order("created_at", { ascending: true })
    .overrideTypes<Course[], { merge: false }>();

  return (
    <AppShell username={user.username} courses={courses ?? []}>
      {children}
    </AppShell>
  );
}
