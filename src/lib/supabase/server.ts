import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없음 — proxy 가 세션을 갱신하므로 무시
        }
      },
    },
  });
}

export type SessionUser = { id: string; username: string };

/** 현재 로그인한 사용자. JWT 서명을 검증하는 getClaims() 사용 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const meta = claims.user_metadata as { username?: string } | undefined;
  const username = meta?.username ?? String(claims.email ?? "").split("@")[0];
  return { id: claims.sub, username };
}
