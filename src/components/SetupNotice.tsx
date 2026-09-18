export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-12">
      <div className="card p-6">
        <h1 className="text-lg font-bold">Supabase 연결이 필요해요</h1>
        <p className="mt-2 text-sm text-zinc-600">
          프로젝트 루트에 <code className="rounded bg-zinc-100 px-1">.env.local</code> 파일을 만들고
          아래 값을 채운 뒤 개발 서버를 다시 시작하세요. 자세한 순서는 README.md 에 있습니다.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs leading-6 text-zinc-100">
          {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
OPENAI_API_KEY=sk-...`}
        </pre>
      </div>
    </main>
  );
}
