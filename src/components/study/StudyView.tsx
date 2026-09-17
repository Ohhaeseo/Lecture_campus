"use client";

import { ArrowLeft, Bookmark, MessageSquare, PanelRightClose, PanelRightOpen, Sparkles, StickyNote } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractPageContext } from "@/lib/pdfContext";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, Course, DocumentRow, Note } from "@/lib/types";
import { AiChatPanel } from "./AiChatPanel";
import { NotesPanel } from "./NotesPanel";
import type { PdfViewerApi, TextSelection } from "./PdfViewer";

// pdf.js 는 브라우저 전용이라 서버 렌더링에서 제외
const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <div className="h-full bg-zinc-100" />,
});

const PANEL_MIN = 320;
const PANEL_MAX = 760;
const PANEL_WIDTH_KEY = "study-panel-width";

type Props = {
  document: DocumentRow;
  course: Pick<Course, "id" | "name" | "color">;
  pdfUrl: string | null;
  initialNotes: Note[];
  initialMessages: ChatMessage[];
  aiEnabled: boolean;
};

export function StudyView({ document: doc, course, pdfUrl, initialNotes, initialMessages, aiEnabled }: Props) {
  const [supabase] = useState(createClient);
  const viewerApi = useRef<PdfViewerApi | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  const [currentPage, setCurrentPage] = useState(Math.max(1, doc.last_page));
  const [tab, setTab] = useState<"notes" | "ai">("ai");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(420);
  const [notes, setNotes] = useState(initialNotes);
  const [noteDraft, setNoteDraft] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [focusKey, setFocusKey] = useState({ notes: 0, ai: 0 });
  const [selection, setSelection] = useState<TextSelection | null>(null);

  // 패널 너비 기억 (브라우저별)
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved >= PANEL_MIN && saved <= PANEL_MAX) setPanelWidth(saved);
    } catch {
      // 저장소를 쓸 수 없는 환경
    }
  }, []);

  // 마지막으로 본 페이지 저장 (스크롤이 멈춘 뒤)
  useEffect(() => {
    if (currentPage === doc.last_page) return;
    const timer = setTimeout(() => {
      supabase.from("documents").update({ last_page: currentPage }).eq("id", doc.id).then();
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentPage, doc.id, doc.last_page, supabase]);

  // ← → 키로 페이지 이동 (입력 중에는 제외)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") viewerApi.current?.scrollToPage(currentPage + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") viewerApi.current?.scrollToPage(currentPage - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPage]);

  const handleLoad = useCallback(
    (pdf: PDFDocumentProxy) => {
      pdfRef.current = pdf;
      if (doc.page_count !== pdf.numPages) {
        supabase.from("documents").update({ page_count: pdf.numPages }).eq("id", doc.id).then();
      }
    },
    [doc.id, doc.page_count, supabase],
  );

  const jumpTo = useCallback((page: number) => viewerApi.current?.scrollToPage(page), []);

  const getPageContext = useCallback(async (page: number) => {
    if (!pdfRef.current) return null;
    try {
      return await extractPageContext(pdfRef.current, page);
    } catch {
      return null;
    }
  }, []);

  async function addNote(content: string, page: number | null) {
    const { data, error } = await supabase
      .from("notes")
      .insert({ document_id: doc.id, content, page })
      .select()
      .single<Note>();
    if (error) return `메모를 저장하지 못했어요: ${error.message}`;
    setNotes((prev) => [...prev, data]);
    return null;
  }

  async function updateNote(id: string, content: string) {
    const { data, error } = await supabase.from("notes").update({ content }).eq("id", id).select().single<Note>();
    if (error) return `메모를 수정하지 못했어요: ${error.message}`;
    setNotes((prev) => prev.map((n) => (n.id === id ? data : n)));
    return null;
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) return `메모를 삭제하지 못했어요: ${error.message}`;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    return null;
  }

  function applySelection(target: "notes" | "ai") {
    if (!selection) return;
    const text = selection.text;
    if (target === "notes") {
      const quote = text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      setNoteDraft((prev) => `${prev ? `${prev}\n\n` : ""}${quote}\n\n`);
    } else {
      setAiInput(`"${text}"\n\n이 부분이 무슨 뜻인지 설명해줘.`);
    }
    setTab(target);
    setPanelOpen(true);
    setFocusKey((k) => ({ ...k, [target]: k[target] + 1 }));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    let width = startWidth;
    const onMove = (ev: PointerEvent) => {
      width = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startWidth + (startX - ev.clientX)));
      setPanelWidth(width);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(PANEL_WIDTH_KEY, String(width));
      } catch {
        // 무시
      }
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-2 sm:px-3">
        <Link href={`/courses/${course.id}`} className="icon-btn" aria-label={`${course.name}(으)로 돌아가기`}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
          <Link href={`/courses/${course.id}`} className="hidden shrink-0 text-sm text-zinc-500 hover:underline sm:inline">
            {course.name}
          </Link>
          <span className="hidden text-zinc-300 sm:inline">/</span>
          <h1 className="truncate text-sm font-semibold">{doc.title}</h1>
        </div>
        <button
          type="button"
          className="icon-btn hidden md:inline-flex"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label={panelOpen ? "오른쪽 패널 닫기" : "오른쪽 패널 열기"}
          title={panelOpen ? "패널 닫기" : "패널 열기"}
        >
          {panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="relative min-h-0 min-w-0 flex-1 basis-3/5 md:basis-auto">
          {pdfUrl ? (
            <PdfViewer
              url={pdfUrl}
              initialPage={currentPage}
              apiRef={viewerApi}
              onLoad={handleLoad}
              onPageChange={setCurrentPage}
              onTextSelect={setSelection}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-zinc-100 text-sm text-rose-600">
              PDF 파일 주소를 만들지 못했어요. 새로고침해 보세요.
            </div>
          )}

          {selection && (
            <div
              className="fixed z-30 flex -translate-x-1/2 -translate-y-full gap-1 rounded-lg bg-zinc-900 p-1 shadow-lg"
              style={{ left: selection.x, top: Math.max(56, selection.y - 8) }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white hover:bg-white/15"
                onClick={() => applySelection("ai")}
              >
                <Sparkles size={13} /> AI에게 질문
              </button>
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white hover:bg-white/15"
                onClick={() => applySelection("notes")}
              >
                <Bookmark size={13} /> 메모에 인용
              </button>
            </div>
          )}
        </section>

        {panelOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="패널 너비 조절"
              onPointerDown={startResize}
              className="hidden w-1.5 shrink-0 cursor-col-resize bg-zinc-200 transition-colors hover:bg-indigo-400 md:block"
            />
            <aside
              className="flex min-h-0 basis-2/5 flex-col border-t border-zinc-200 md:basis-auto md:border-t-0 md:w-(--panel-w)"
              style={{ "--panel-w": `${panelWidth}px` } as React.CSSProperties}
            >
              <div className="flex shrink-0 border-b border-zinc-200 px-2">
                <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
                  <MessageSquare size={15} /> AI 질문
                </TabButton>
                <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
                  <StickyNote size={15} /> 메모
                  {notes.length > 0 && (
                    <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] text-zinc-500">{notes.length}</span>
                  )}
                </TabButton>
              </div>
              {/* 탭을 바꿔도 입력 중인 내용이 유지되도록 둘 다 마운트해 둔다 */}
              <div className={`min-h-0 flex-1 ${tab === "ai" ? "" : "hidden"}`}>
                <AiChatPanel
                  documentId={doc.id}
                  initialMessages={initialMessages}
                  currentPage={currentPage}
                  aiEnabled={aiEnabled}
                  input={aiInput}
                  onInputChange={setAiInput}
                  focusKey={focusKey.ai}
                  getPageContext={getPageContext}
                  onSaveNote={addNote}
                  onJump={jumpTo}
                />
              </div>
              <div className={`min-h-0 flex-1 ${tab === "notes" ? "" : "hidden"}`}>
                <NotesPanel
                  notes={notes}
                  currentPage={currentPage}
                  documentTitle={doc.title}
                  draft={noteDraft}
                  onDraftChange={setNoteDraft}
                  focusKey={focusKey.notes}
                  onAdd={addNote}
                  onUpdate={updateNote}
                  onDelete={deleteNote}
                  onJump={jumpTo}
                />
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
        active ? "border-indigo-600 font-semibold text-indigo-700" : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
