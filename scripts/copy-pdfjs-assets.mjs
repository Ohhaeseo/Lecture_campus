// pdf.js 워커와 cMap(한글 등 비라틴 문자용), 표준 폰트 파일을 public/pdfjs 로 복사합니다.
// npm install / dev / build 시 자동 실행됩니다.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const reactPdfEntry = require.resolve("react-pdf");
const pdfjsPkg = require.resolve("pdfjs-dist/package.json", {
  paths: [path.dirname(reactPdfEntry)],
});
const pdfjsDir = path.dirname(pdfjsPkg);
const target = path.join(process.cwd(), "public", "pdfjs");

mkdirSync(target, { recursive: true });
cpSync(
  path.join(pdfjsDir, "build", "pdf.worker.min.mjs"),
  path.join(target, "pdf.worker.min.mjs"),
);
for (const dir of ["cmaps", "standard_fonts"]) {
  const src = path.join(pdfjsDir, dir);
  if (existsSync(src)) cpSync(src, path.join(target, dir), { recursive: true });
}
console.log(`[pdfjs] ${path.relative(process.cwd(), pdfjsDir)} -> public/pdfjs`);
