import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 정적 파일, 이미지, pdf.js 리소스는 제외
    "/((?!_next/static|_next/image|favicon.ico|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|bcmap|pfb|ttf|pdf)$).*)",
  ],
};
