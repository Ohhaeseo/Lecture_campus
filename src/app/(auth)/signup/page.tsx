import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "회원가입 · 강의노트" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
