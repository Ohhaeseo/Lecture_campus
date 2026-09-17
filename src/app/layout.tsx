import type { Metadata } from "next";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "강의노트",
  description: "강의자료 PDF를 보면서 메모하고 AI에게 질문하는 학습 정리 공간",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="h-full">{isSupabaseConfigured() ? children : <SetupNotice />}</body>
    </html>
  );
}
