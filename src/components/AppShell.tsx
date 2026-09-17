"use client";

import { CalendarDays, LayoutDashboard, LogOut, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/(auth)/actions";
import type { Course } from "@/lib/types";
import { CourseDialog } from "./CourseDialog";
import { Logo } from "./Logo";

export function AppShell({
  username,
  courses,
  children,
}: {
  username: string;
  courses: Course[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <Link href="/dashboard" className="px-2 pt-1" onClick={() => setMobileOpen(false)}>
        <Logo />
      </Link>

      <div className="space-y-0.5">
        <NavLink href="/dashboard" active={pathname === "/dashboard"} onNavigate={setMobileOpen}>
          <LayoutDashboard size={17} /> 대시보드
        </NavLink>
        <NavLink href="/calendar" active={pathname === "/calendar"} onNavigate={setMobileOpen}>
          <CalendarDays size={17} /> 캘린더
        </NavLink>
      </div>

      <div className="min-h-0 flex-1">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-semibold text-zinc-400">내 수업</span>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            onClick={() => setCreating(true)}
            aria-label="수업 추가"
            title="수업 추가"
          >
            <Plus size={15} />
          </button>
        </div>
        {courses.length === 0 ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full rounded-lg px-2 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-100"
          >
            + 첫 수업을 추가해 보세요
          </button>
        ) : (
          <ul className="space-y-0.5">
            {courses.map((course) => (
              <li key={course.id}>
                <NavLink
                  href={`/courses/${course.id}`}
                  active={pathname === `/courses/${course.id}`}
                  onNavigate={setMobileOpen}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: course.color }}
                  />
                  <span className="truncate">{course.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-100 px-2 pt-4">
        <span className="truncate text-sm text-zinc-600">
          <span className="font-semibold text-zinc-800">{username}</span> 님
        </span>
        <form action={logout}>
          <button type="submit" className="icon-btn" title="로그아웃" aria-label="로그아웃">
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-zinc-200 bg-white md:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button
              type="button"
              className="icon-btn absolute top-4 right-3"
              onClick={() => setMobileOpen(false)}
              aria-label="메뉴 닫기"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={20} />
          </button>
          <Logo />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <CourseDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function NavLink({
  href,
  active,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => onNavigate(false)}
      className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
        active ? "bg-indigo-50 font-semibold text-indigo-700" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}
