import type { PDFDocumentProxy } from "pdfjs-dist";

export type PageContext = { text: string; image: string | null };

const MAX_IMAGE_EDGE = 1568; // Claude 가 이미지를 축소하지 않고 보는 최대 변 길이
const MAX_TEXT_LENGTH = 20000;
const RENDER_TIMEOUT_MS = 8000;

/**
 * AI 질문에 함께 보낼 현재 페이지 정보.
 * 텍스트만으로는 도표/수식/그림을 놓치므로 페이지를 JPEG 이미지로도 렌더링해서 보낸다.
 */
export async function extractPageContext(pdf: PDFDocumentProxy, pageNumber: number): Promise<PageContext> {
  const page = await pdf.getPage(pageNumber);

  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

  let image: string | null = null;
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_IMAGE_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const task = page.render({ canvas, canvasContext: context, viewport });
      // 렌더링이 너무 오래 걸리면(탭이 백그라운드인 경우 등) 텍스트만 보낸다
      const timer = setTimeout(() => task.cancel(), RENDER_TIMEOUT_MS);
      try {
        await task.promise;
      } finally {
        clearTimeout(timer);
      }
      image = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? null;
    }
  } catch {
    image = null; // 렌더링에 실패해도 텍스트만으로 질문은 가능
  }

  return { text, image };
}
