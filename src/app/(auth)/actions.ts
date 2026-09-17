"use server";

import { redirect } from "next/navigation";
import {
  normalizeUsername,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  usernameToEmail,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"username" | "password" | "passwordConfirm", string>>;
  values?: { username: string };
};

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (!USERNAME_PATTERN.test(username)) {
    fieldErrors.username = "아이디는 영문, 숫자, 밑줄(_)로 4~20자여야 해요.";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    fieldErrors.password = `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`;
  }
  if (password !== passwordConfirm) {
    fieldErrors.passwordConfirm = "비밀번호가 일치하지 않아요.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values: { username } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username } },
  });

  if (error) {
    return { error: describeAuthError(error.code, error.message), values: { username } };
  }
  if (!data.session) {
    // "Confirm email" 설정이 켜져 있으면 세션이 바로 발급되지 않음
    return {
      error:
        "가입은 되었지만 로그인 세션이 발급되지 않았어요. Supabase 대시보드 > Authentication > Sign In / Providers > Email 에서 'Confirm email' 을 꺼주세요.",
      values: { username },
    };
  }

  redirect("/dashboard");
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "아이디와 비밀번호를 입력해 주세요.", values: { username } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    return { error: describeAuthError(error.code, error.message), values: { username } };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function describeAuthError(code: string | undefined, message: string) {
  switch (code) {
    case "invalid_credentials":
      return "아이디 또는 비밀번호가 올바르지 않아요.";
    case "user_already_exists":
    case "email_exists":
      return "이미 사용 중인 아이디예요.";
    case "weak_password":
      return "비밀번호가 너무 단순해요. 다른 비밀번호를 사용해 주세요.";
    case "email_not_confirmed":
      return "Supabase 에서 'Confirm email' 설정을 꺼야 로그인할 수 있어요. (README 참고)";
    case "email_address_invalid":
      return "Supabase 가 내부 이메일 도메인을 거부했어요. .env.local 의 AUTH_EMAIL_DOMAIN 을 확인해 주세요.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    case "signup_disabled":
      return "현재 회원가입이 비활성화되어 있어요.";
    default:
      return `오류가 발생했어요: ${message}`;
  }
}
