"use client";

import { ChevronLeft, ChevronRight, LoaderCircle, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// 워커/폰트 파일은 scripts/copy-pdfjs-assets.mjs 가 public/pdfjs 로 복사해 둔다
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
const PDF_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

const PADDING = 16;
const GAP = 12;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;

export type PdfViewerApi = { scrollToPage: (page: number) => void };
export type TextSelection = { text: string; x: number; y: number };

type Props = {
  url: string;
  initialPage: number;
  apiRef: React.RefObject<PdfViewerApi | null>;
  onLoad: (pdf: PDFDocumentProxy) => void;
  onPageChange: (page: number) => void;
  onTextSelect: (selection: TextSelection | null) => void;
};

export default function PdfViewer({ url, initialPage, apiRef, onLoad, onPageChange, onTextSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ratios, setRatios] = useState<number[] | null>(null); // 페이지별 높이/너비 비율
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [loadError, setLoadError] = useState("");
  const scrollRatio = useRef(0);
  const didInitialScroll = useRef(false);

  const numPages = ratios?.length ?? 0;
  const pageWidth = Math.max(200, Math.round((box.width - PADDING * 2) * zoom));

  // 페이지별 위치 계산
  const heights = (ratios ?? []).map((r) => Math.round(pageWidth * r));
  const offsets: number[] = [];
  heights.reduce((acc, h, i) => {
    offsets[i] = acc;
    return acc + h + GAP;
  }, PADDING);

  // 컨테이너 크기 추적
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToPage = useCallback(
    (target: number) => {
      const el = scrollRef.current;
      if (!el || !numPages) return;
      const clamped = Math.min(Math.max(1, target), numPages);
      el.scrollTo({ top: offsets[clamped - 1] - PADDING });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numPages, pageWidth, ratios],
  );

  useEffect(() => {
    apiRef.current = { scrollToPage };
  }, [apiRef, scrollToPage]);

  // 처음 열 때 마지막으로 보던 페이지로 이동
  useLayoutEffect(() => {
    if (didInitialScroll.current || !numPages || !box.width) return;
    didInitialScroll.current = true;
    if (initialPage > 1) scrollToPage(initialPage);
  }, [numPages, box.width, initialPage, scrollToPage]);

  // 확대/축소 시 보던 위치 유지
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !didInitialScroll.current) return;
    el.scrollTop = scrollRatio.current * el.scrollHeight;
  }, [pageWidth]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    onTextSelect(null);
    setScrollTop(el.scrollTop);
    scrollRatio.current = el.scrollTop / Math.max(1, el.scrollHeight);

    if (!numPages) return;
    const probe = el.scrollTop + el.clientHeight * 0.35;
    let current = 1;
    for (let i = 0; i < numPages; i++) {
      if (offsets[i] <= probe) current = i + 1;
      else break;
    }
    if (current !== page) {
      setPage(current);
      setPageInput(String(current));
      onPageChange(current);
    }
  }

  function handleMouseUp() {
    // 텍스트 레이어에서 선택한 문장을 AI 질문/메모에 활용 (선택 영역이 확정된 뒤 읽기)
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || !text || selection.rangeCount === 0) return onTextSelect(null);
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      onTextSelect({ text: text.slice(0, 2000), x: rect.left + rect.width / 2, y: rect.top });
    }, 0);
  }

  async function handleLoad(pdf: PDFDocumentProxy) {
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, (_, i) =>
        pdf.getPage(i + 1).then((p) => {
          const viewport = p.getViewport({ scale: 1 });
          return viewport.height / viewport.width;
        }),
      ),
    );
    setRatios(pages);
    onLoad(pdf);
  }

  const changeZoom = (next: number) =>
    setZoom(Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)) * 100) / 100);

  // 화면에 보이는 페이지 앞뒤로만 렌더링 (페이지가 많은 자료도 가볍게)
  const renderFrom = scrollTop - box.height;
  const renderTo = scrollTop + box.height * 2;
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-100">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="icon-btn"
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 1}
            aria-label="이전 페이지"
          >
            <ChevronLeft size={18} />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(pageInput);
              if (Number.isFinite(n)) scrollToPage(n);
            }}
            className="flex items-center gap-1 text-sm text-zinc-500"
          >
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setPageInput(String(page))}
              className="w-11 rounded-md border border-zinc-200 px-1 py-0.5 text-center text-sm text-zinc-900"
              aria-label="페이지 번호"
              inputMode="numeric"
            />
            <span>/ {numPages || "-"}</span>
          </form>
          <button
            type="button"
            className="icon-btn"
            onClick={() => scrollToPage(page + 1)}
            disabled={!numPages || page >= numPages}
            aria-label="다음 페이지"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={() => changeZoom(zoom - 0.1)} aria-label="축소">
            <ZoomOut size={17} />
          </button>
          <span className="w-11 text-center text-xs text-zinc-500 tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn" onClick={() => changeZoom(zoom + 0.1)} aria-label="확대">
            <ZoomIn size={17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => changeZoom(1)}
            title="너비에 맞추기"
            aria-label="너비에 맞추기"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} onMouseUp={handleMouseUp} className="min-h-0 flex-1 overflow-auto">
        {loadError ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-rose-600">
            {loadError}
          </div>
        ) : (
          box.width > 0 && (
            <Document
              file={url}
              options={PDF_OPTIONS}
              suspense={false}
              onLoadSuccess={handleLoad}
              onLoadError={(error) => setLoadError(`PDF를 불러오지 못했어요: ${error.message}`)}
              loading={<Loading text="PDF 불러오는 중..." />}
              className="flex min-w-fit flex-col items-center"
              externalLinkTarget="_blank"
            >
              {ratios && (
                <div className="flex flex-col items-center" style={{ padding: PADDING, gap: GAP }}>
                  {ratios.map((_, i) => {
                    const visible = offsets[i] + heights[i] >= renderFrom && offsets[i] <= renderTo;
                    return (
                      <div
                        key={i}
                        data-page={i + 1}
                        className="pdf-page relative bg-white shadow-sm"
                        style={{ width: pageWidth, height: heights[i] }}
                      >
                        {visible && (
                          <Page
                            pageNumber={i + 1}
                            width={pageWidth}
                            devicePixelRatio={dpr}
                            suspense={false}
                            loading={<Loading text={`${i + 1}쪽`} />}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Document>
          )
        )}
      </div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 w-full items-center justify-center gap-2 text-sm text-zinc-400">
      <LoaderCircle size={16} className="animate-spin" />
      {text}
    </div>
  );
}
