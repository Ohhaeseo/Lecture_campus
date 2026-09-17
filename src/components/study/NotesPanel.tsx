"use client";

import { Check, Download, Pencil, Trash, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/dates";
import type { Note } from "@/lib/types";
import { Markdown } from "../Markdown";

type Props = {
  notes: Note[];
  currentPage: number;
  documentTitle: string;
  /** 작성 중인 메모 (PDF 인용을 넣기 위해 부모가 관리) */
  draft: string;
  onDraftChange: (value: string) => void;
  /** 값이 바뀌면 입력창에 포커스 */
  focusKey: number;
  onAdd: (content: string, page: number | null) => Promise<string | null>;
  onUpdate: (id: string, content: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
  onJump: (page: number) => void;
};

export function NotesPanel({
  notes,
  currentPage,
  documentTitle,
  draft,
  onDraftChange: setDraft,
  focusKey,
  onAdd,
  onUpdate,
  onDelete,
  onJump,
}: Props) {
  const [filter, setFilter] = useState<"all" | "page">("all");
  const [linkPage, setLinkPage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusKey) textareaRef.current?.focus();
  }, [focusKey]);

  const visible = (filter === "page" ? notes.filter((n) => n.page === currentPage) : notes)
    .slice()
    .sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.created_at.localeCompare(b.created_at));

  async function handleAdd() {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    const err = await onAdd(content, linkPage ? currentPage : null);
    setSaving(false);
    if (err) return setError(err);
    setError("");
    setDraft("");
  }

  async function handleUpdate(id: string) {
    const content = editText.trim();
    if (!content) return;
    const err = await onUpdate(id, content);
    if (err) return setError(err);
    setEditingId(null);
  }

  async function handleDelete(note: Note) {
    if (!confirm("이 메모를 삭제할까요?")) return;
    const err = await onDelete(note.id);
    if (err) setError(err);
  }

  function handleExport() {
    const sorted = notes
      .slice()
      .sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.created_at.localeCompare(b.created_at));
    const body = sorted
      .map((n) => `## ${n.page ? `p.${n.page}` : "문서 전체"}\n\n${n.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([`# ${documentTitle} 메모\n\n${body}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentTitle} 메모.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2">
        <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs">
          {(
            [
              ["all", `전체 ${notes.length}`],
              ["page", `${currentPage}쪽`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-md px-2.5 py-1 ${filter === value ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={handleExport}
          disabled={notes.length === 0}
          title="메모를 마크다운 파일로 저장"
        >
          <Download size={14} /> 내보내기
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm leading-6 text-zinc-400">
            {filter === "page" ? `${currentPage}쪽에 남긴 메모가 없어요.` : "아직 메모가 없어요."}
            <br />
            PDF에서 문장을 드래그하면 바로 인용할 수 있어요.
          </p>
        ) : (
          visible.map((note) => (
            <article key={note.id} className="group rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-1.5 flex items-center justify-between">
                {note.page ? (
                  <button
                    type="button"
                    onClick={() => onJump(note.page!)}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                      note.page === currentPage ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                    }`}
                    title="이 페이지로 이동"
                  >
                    p.{note.page}
                  </button>
                ) : (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500">
                    문서 전체
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  <span className="mr-1 text-[11px] text-zinc-400" suppressHydrationWarning>
                    {formatTimestamp(note.updated_at)}
                  </span>
                  {editingId !== note.id && (
                    <span className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        className="icon-btn h-6 w-6"
                        onClick={() => {
                          setEditingId(note.id);
                          setEditText(note.content);
                        }}
                        aria-label="메모 수정"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-6 w-6 hover:text-rose-600"
                        onClick={() => handleDelete(note)}
                        aria-label="메모 삭제"
                      >
                        <Trash size={13} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
              {editingId === note.id ? (
                <div>
                  <textarea
                    className="input min-h-28 resize-y text-sm"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleUpdate(note.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                  <div className="mt-1.5 flex justify-end gap-1">
                    <button type="button" className="icon-btn" onClick={() => setEditingId(null)} aria-label="취소">
                      <X size={15} />
                    </button>
                    <button type="button" className="icon-btn text-indigo-600" onClick={() => handleUpdate(note.id)} aria-label="저장">
                      <Check size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <Markdown>{note.content}</Markdown>
              )}
            </article>
          ))
        )}
      </div>

      <div className="border-t border-zinc-200 bg-white p-3">
        {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
        <textarea
          ref={textareaRef}
          className="input min-h-20 resize-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={linkPage ? `${currentPage}쪽에 메모 남기기 (Ctrl+Enter 저장)` : "문서 전체 메모 (Ctrl+Enter 저장)"}
        />
        <div className="mt-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input type="checkbox" checked={linkPage} onChange={(e) => setLinkPage(e.target.checked)} />
            현재 페이지({currentPage}쪽)에 연결
          </label>
          <button type="button" className="btn btn-primary px-3 py-1.5" onClick={handleAdd} disabled={!draft.trim() || saving}>
            {saving ? "저장 중..." : "메모 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
