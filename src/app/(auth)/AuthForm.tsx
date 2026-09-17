"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthFormState } from "./actions";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    mode === "login" ? login : signup,
    {},
  );
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <h1 className="text-lg font-bold">{isSignup ? "회원가입" : "로그인"}</h1>

      <Field
        id="username"
        label="아이디"
        autoComplete="username"
        placeholder={isSignup ? "영문, 숫자, _ 4~20자" : "아이디"}
        defaultValue={state.values?.username}
        error={state.fieldErrors?.username}
      />
      <Field
        id="password"
        label="비밀번호"
        type="password"
        autoComplete={isSignup ? "new-password" : "current-password"}
        placeholder={isSignup ? "8자 이상" : "비밀번호"}
        error={state.fieldErrors?.password}
      />
      {isSignup && (
        <Field
          id="passwordConfirm"
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호를 한 번 더 입력"
          error={state.fieldErrors?.passwordConfirm}
        />
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={pending}>
        {pending ? "처리 중..." : isSignup ? "가입하기" : "로그인"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        {isSignup ? "이미 계정이 있나요? " : "처음이신가요? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-medium text-indigo-600 hover:underline"
        >
          {isSignup ? "로그인" : "회원가입"}
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  ...props
}: { id: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={`input ${error ? "border-rose-400" : ""}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
