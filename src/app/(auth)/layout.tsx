import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-[#f7f7f8] px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="lg" />
        <p className="mt-3 text-sm text-zinc-500">
          강의자료 보면서 메모하고, 모르는 건 바로 AI에게 물어보세요.
        </p>
      </div>
      <div className="card w-full max-w-sm p-6 shadow-sm">{children}</div>
    </main>
  );
}
