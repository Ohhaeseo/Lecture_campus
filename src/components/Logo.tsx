export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 text-xl" : "h-8 w-8 text-base";
  const text = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`${box} inline-flex items-center justify-center rounded-xl bg-indigo-600 font-bold text-white`}
        aria-hidden
      >
        강
      </span>
      <span className={`${text} font-bold tracking-tight text-zinc-900`}>강의노트</span>
    </span>
  );
}
