# 인수인계 문서 — 강의노트 (Lecture Campus)

> 최종 업데이트: 2026-09-18 · 기준 브랜치: `main`
>
> 사용법과 기능 소개는 [README.md](README.md) 에 있고, 이 문서는 **이어서 개발할 사람**을 위한 현재 상태 · 설계 이유 · 주의사항 · 남은 일을 정리합니다.

---

## 1. 한눈에 보기

| 항목 | 내용 |
| --- | --- |
| 무엇 | 강의자료 PDF를 보면서 페이지별 메모 + AI(Claude) 질문 + 시험 일정 관리를 하는 웹앱 |
| 스택 | Next.js 16.3 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Supabase · react-pdf 11 (pdf.js 6) · `@anthropic-ai/sdk` |
| 저장소 | https://github.com/Ohhaeseo/Lecture_campus (public, 기본 브랜치 `main`) |
| Supabase | https://supabase.com/dashboard/project/pgegkwvwnuhtskgkjhya (프로젝트 이름 `Lecture_campus`, 무료 플랜) |
| 배포 | **아직 안 함** (로컬 `npm run dev` 로만 사용 중) |
| AI 키 | **아직 없음** — `ANTHROPIC_API_KEY` 미설정이라 AI 답변은 실제로 받아본 적 없음 |

---

## 2. 현재 상태

### 기능별 완료 · 검증 여부

| 기능 | 구현 | 검증 수준 |
| --- | :---: | --- |
| 회원가입 / 로그인 / 로그아웃 | ✅ | **실제 Supabase 에서 확인** — 사용자가 직접 가입, `auth.users` 에 1명 저장 (`users.localtest.me` 도메인, username 메타데이터 있음) |
| 수업 CRUD | ✅ | 실제 DB 에서 수업 1개 생성 확인. **수정/삭제는 미확인** |
| PDF 업로드 | ✅ | **실제 확인** — 3.4MB PDF 1개가 Storage + `documents` 에 저장됨 |
| PDF 뷰어 (연속 스크롤, 확대, 페이지 이동, 지연 렌더링) | ✅ | **실제 55쪽 PDF 로 확인** (서명 URL 로 로딩, 페이지 이동, 보이는 페이지만 렌더링) |
| 메모 (페이지 연결, 수정/삭제, 인용, .md 내보내기) | ✅ | 목업으로 UI 만 확인. **실제 DB 저장은 미확인** |
| AI 질문 (현재 페이지 / PDF 전체, 스트리밍, 기록 저장) | ✅ | 페이지 이미지(JPEG)+텍스트 추출 → API 호출까지 확인. **Claude 실제 응답은 미확인** (키 없음) |
| 텍스트 드래그 → AI 질문 / 메모 인용 | ✅ | 목업으로 확인 |
| 캘린더 · 일정 · D-day | ✅ | 목업으로 UI 확인. **실제 DB 저장은 미확인** |
| 대시보드 최근 강의자료 | ✅ | 실제 계정에서 표시 확인 |
| 넓은 화면 "PDF 넓게 보기" / 좁은 화면 패널 오버레이 | ✅ | 목업 + 헤드리스 Edge 로 1400px / 800px 레이아웃 확인 |

### 자동화된 검사
- `npx tsc --noEmit`, `npx eslint src`, `npm run build` 모두 통과 (마지막 확인: 2026-09-18)
- **테스트 코드는 없음** (단위/E2E 모두)

---

## 3. 환경 · 계정 · 설정

### 환경변수 (`.env.local`, git 에 안 올라감)

| 변수 | 현재 값 | 비고 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 설정됨 | `https://pgegkwvwnuhtskgkjhya.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 설정됨 | Supabase → Project Settings → API Keys 에서 확인 |
| `ANTHROPIC_API_KEY` | **미설정** | 주석 처리돼 있음. 넣고 서버 재시작하면 AI 활성화 |
| `ANTHROPIC_MODEL` | 미설정 | 기본 `claude-opus-5`. 비용 절감 시 `claude-sonnet-5` |
| `AUTH_EMAIL_DOMAIN` | 미설정 | 기본 `users.localtest.me` — **이미 가입자가 있으니 바꾸면 안 됨** (아래 §6) |

새 PC 에서는 `.env.example` 을 복사해서 채우면 됩니다.

### Supabase 에 적용된 것 (2026-09-17)
- `supabase/schema.sql` 실행 완료 → 테이블 5개(`courses`, `documents`, `notes`, `chat_messages`, `events`), 모두 RLS on, 정책 5개 + Storage 정책 4개, 비공개 버킷 `documents` (파일당 50MB, PDF 만)
- Authentication → **Confirm email: 꺼짐**
- Authentication → Email → **Minimum password length: 8**
- 스키마 SQL 은 `if not exists` / `drop ... if exists` 로 작성돼 **다시 실행해도 데이터는 안 지워짐** (실행 시 대시보드가 "destructive operation" 경고를 띄우지만 정책/트리거 재생성 때문)

### 로컬 전용 설정
- `.claude/launch.json` — Claude 데스크톱 앱의 미리보기용. `.git/info/exclude` 로 **로컬에서만** 무시 중 (커밋 안 됨)

---

## 4. 실행 방법

```bash
npm install          # postinstall 이 pdf.js 워커/cMap 을 public/pdfjs 로 복사
npm run dev          # http://localhost:3000
npm run build        # 배포 전 확인
npx tsc --noEmit     # 타입 검사
npx eslint src       # 린트
```

---

## 5. 구조와 데이터 흐름

### 라우트

| 경로 | 파일 | 역할 |
| --- | --- | --- |
| `/login`, `/signup` | `src/app/(auth)/` | Server Action(`actions.ts`) + `useActionState` 폼 |
| `/dashboard` | `src/app/(main)/dashboard/page.tsx` | 최근 강의자료, 내 수업, 다가오는 일정 |
| `/courses/[courseId]` | `src/app/(main)/courses/[courseId]/page.tsx` → `components/CourseDetail.tsx` | 자료 업로드/목록, 수업 일정 |
| `/calendar` | `src/app/(main)/calendar/page.tsx` → `components/CalendarView.tsx` | 월간 캘린더 |
| `/study/[documentId]` | `src/app/study/[documentId]/page.tsx` → `components/study/StudyView.tsx` | PDF 뷰어 + AI/메모 패널 (사이드바 없는 전체 화면) |
| `POST /api/ai/chat` | `src/app/api/ai/chat/route.ts` | Claude 스트리밍 (NDJSON 응답) |

`(main)/layout.tsx` 가 로그인 확인 후 사이드바(`AppShell`)를 감쌉니다.

### 데이터 읽기/쓰기 패턴
- **읽기**: 서버 컴포넌트에서 `lib/supabase/server.ts` 의 클라이언트로 조회 → props 로 전달
- **쓰기**: 클라이언트 컴포넌트에서 `lib/supabase/client.ts` 로 직접 insert/update/delete → `router.refresh()`
- 보안은 전부 **RLS** 에 의존 (서버 API 를 거치지 않음). 새 테이블을 만들면 반드시 RLS 정책도 추가할 것
- `(select auth.uid())` 형태로 정책을 작성 (행마다 함수 재실행 방지)

### 인증 흐름
1. 아이디 → `lib/auth.ts` 의 `usernameToEmail()` 로 `아이디@users.localtest.me` 변환
2. `supabase.auth.signUp / signInWithPassword` (Server Action)
3. `src/proxy.ts` → `lib/supabase/proxy.ts` 가 매 요청마다 `getClaims()` 로 세션 갱신 + 비로그인 시 `/login` 리다이렉트
   - `/api/*` 는 리다이렉트하지 않고 라우트에서 401 반환

### PDF 흐름
- 업로드: 브라우저 → Storage 직접 업로드(`{user_id}/{course_id}/{document_id}.pdf`) → `documents` insert. insert 실패 시 파일 삭제
- 열람: 서버에서 6시간짜리 서명 URL 생성 → `PdfViewer` (react-pdf) 가 로딩
- 뷰어는 열 때 **모든 페이지의 비율을 먼저 계산**해 높이를 확정하고, 화면 앞뒤 1화면 범위의 페이지만 `<Page>` 를 렌더링
- `last_page` 는 스크롤 멈추고 1.5초 뒤 저장, `page_count` 는 처음 열 때 저장

### AI 흐름 (`api/ai/chat/route.ts`)
- **현재 페이지 모드**: 브라우저가 pdf.js 로 현재 페이지를 JPEG(긴 변 1568px) + 텍스트로 추출해 전송 (`lib/pdfContext.ts`). 렌더링이 8초 넘으면 텍스트만 보냄
- **PDF 전체 모드**: 서버가 Storage 에서 PDF 를 받아 base64 `document` 블록으로 전송, `cache_control` 로 캐싱
- 이전 대화 최근 20개를 함께 보냄 (텍스트만, 이전 페이지 이미지는 안 보냄)
- 질문은 호출 전에, 답변은 스트림 종료 후 `chat_messages` 에 저장. 사용자가 중단하면 받은 부분까지 저장
- 모델이 `claude-opus-5` / `claude-fable-5-1` 일 때만 `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) 사용 — 안전 거절 시 서버가 다른 모델로 재시도. **다른 모델로 바꾸면 이 옵션은 자동으로 빠짐**

---

## 6. 꼭 알아야 할 주의사항

1. **Next.js 16 은 예전 버전과 다릅니다.** `AGENTS.md` 지침대로 코드를 쓰기 전에 `node_modules/next/dist/docs/` 를 확인하세요.
   - `middleware.ts` → **`proxy.ts`** 로 이름이 바뀜
   - `params` / `searchParams` / `cookies()` 는 모두 **Promise** (`await` 필요)
   - `PageProps<"/경로">`, `LayoutProps<"/">` 전역 타입 사용 (`npx next typegen` 으로 생성)
2. **`AUTH_EMAIL_DOMAIN` 을 바꾸지 마세요.** 기존 가입자 이메일이 `...@users.localtest.me` 로 저장돼 있어 바꾸는 순간 로그인 불가. 바꿔야 한다면 기존 사용자 이메일을 SQL 로 일괄 변경하는 마이그레이션이 필요합니다.
   - Supabase 가 DNS 조회가 안 되는 도메인(`.local` 등)은 가입을 거부하므로, 와일드카드 DNS 인 `localtest.me` 를 쓴 것입니다.
3. **Confirm email 을 다시 켜면 가입이 막힙니다.** 가짜 이메일이라 인증 메일을 받을 수 없음. 같은 이유로 **비밀번호 재설정(메일) 기능은 구현 불가** — 필요하면 관리자가 대시보드에서 직접 변경.
4. **pdf.js 리소스는 빌드 산출물입니다.** `public/pdfjs/` 는 gitignore 대상이고 `scripts/copy-pdfjs-assets.mjs` 가 `postinstall`/`predev`/`prebuild` 때 복사합니다. 한글 PDF 가 깨지면 이 폴더(`cmaps`)가 있는지 먼저 확인하세요.
5. **Storage 파일은 DB cascade 로 안 지워집니다.** 수업/자료 삭제는 `lib/courses.ts` 에서 Storage 를 먼저 지우고 DB 를 지웁니다. 대시보드에서 사용자나 수업을 직접 지우면 **Storage 에 고아 파일이 남습니다.**
6. **시간대**: 서버는 UTC, 사용자는 KST. D-day/오늘 날짜는 `lib/useToday.ts`(브라우저 기준)로 계산하고, 서버 쿼리는 하루 여유를 둡니다. 새로 날짜 로직을 추가할 때 서버에서 `new Date()` 로 오늘을 판단하지 마세요.
7. **Supabase 무료 플랜은 1주일 동안 접속이 없으면 일시정지**됩니다. "연결이 안 돼요" 하면 대시보드에서 Restore 부터 확인.
8. **AI 비용**: 기본 모델이 Opus 라 비쌉니다. "PDF 전체" 모드는 첫 질문에 PDF 전체 토큰이 과금됩니다(5분 내 재질문은 캐시로 저렴).

---

## 7. 알려진 문제 · 기술 부채

| 우선순위 | 내용 | 위치 |
| :---: | --- | --- |
| 🟠 | 테스트 코드 없음 (특히 RLS 정책, 업로드/삭제 흐름) | — |
| 🟠 | DB 타입을 손으로 작성 (`lib/types.ts`). 스키마를 바꾸면 수동으로 맞춰야 함 → `supabase gen types` 도입 권장 | `src/lib/types.ts` |
| 🟡 | 자료 삭제 시 Storage 삭제 성공 후 DB 삭제가 실패하면 파일 없는 행이 남음 (트랜잭션 아님) | `src/lib/courses.ts` |
| 🟡 | "PDF 전체" 모드는 22MB 까지만 허용 (base64 변환 시 약 1.33배 → API 요청 한도 32MB). 업로드 한도(50MB)와 달라서, 큰 PDF 는 "현재 페이지" 모드만 가능 | `src/app/api/ai/chat/route.ts` `MAX_PDF_BYTES` |
| 🟡 | 뷰어가 열 때 전체 페이지 비율을 한 번에 계산 → 수백 쪽 PDF 는 첫 표시가 느릴 수 있음 | `src/components/study/PdfViewer.tsx` `handleLoad` |
| 🟡 | 서명 URL 6시간 만료. 페이지를 6시간 넘게 열어두면 아직 안 불러온 부분 로딩이 실패할 수 있음 (새로고침으로 해결) | `src/app/study/[documentId]/page.tsx` |
| 🟡 | 현재 페이지 모드의 이전 대화에는 그때 보던 페이지 이미지가 포함되지 않음 (답변 텍스트로만 맥락 유지) | `route.ts` |
| 🟡 | `documents.updated_at` 이 `last_page` 저장·이름 변경 모두에서 갱신 → "최근 강의자료" 순서가 이름만 바꿔도 바뀜 | `dashboard/page.tsx` |
| ⚪ | 다크 모드 미지원 | — |
| ⚪ | `.gitattributes` 없음 → 커밋 때 LF/CRLF 경고 | — |
| ⚪ | eslint 규칙 비활성화 2곳: `set-state-in-effect`(패널 너비 localStorage 복원), `exhaustive-deps`(`scrollToPage`) | `StudyView.tsx`, `PdfViewer.tsx` |

---

## 8. 검증할 때 참고

- **Claude 데스크톱 앱의 브라우저 패널은 숨겨져 있으면 화면을 그리지 않아서** 스크롤 이벤트, `ResizeObserver`, `requestAnimationFrame` 이 멈춥니다. PDF 가 안 뜨는 것처럼 보이면 앱 버그가 아닐 수 있습니다.
- 그래서 UI 는 **임시 목업 페이지**(`src/app/dev-preview/page.tsx` 를 만들고 `lib/supabase/proxy.ts` 의 `AUTH_PAGES` 에 잠깐 추가) + **헤드리스 Edge**(`playwright-core`, `channel: "msedge"`)로 캡처해 확인했습니다. **확인 후 반드시 두 곳 모두 원복**하세요.
- README 스크린샷(`docs/images/*.png`)도 같은 방식으로 만들었습니다 (목업 데이터라 실제 계정 정보 없음).
- 보안상 자동화 도구로 **계정 생성·로그인은 하지 않았고**, 실제 가입 테스트는 사용자가 직접 했습니다.

---

## 9. 다음에 할 일 (추천 순서)

1. **`ANTHROPIC_API_KEY` 설정 후 AI 질문 실제 테스트** — 현재 페이지 / PDF 전체 모드 둘 다, 수식·표 렌더링, 중단 버튼, 대화 기록 저장
2. 실제 계정으로 메모 · 일정 · 수업 수정/삭제 저장 확인 (특히 수업 삭제 시 Storage 파일까지 지워지는지)
3. Vercel 배포 — 환경변수 등록, Supabase Auth → URL Configuration 의 Site URL 변경, `maxDuration` 이 플랜에서 허용되는지 확인
4. 기능 로드맵 (README 참고): 강의 녹음 → 받아쓰기, 요약 노트 자동 생성, 퀴즈/플래시카드, 시험 범위 체크리스트, 전체 검색, 형광펜

### 강의 녹음 → 받아쓰기 기능 (검토만 끝난 상태)

2026-09-17 에 설계만 논의하고 **코드는 전혀 손대지 않았습니다.** 다시 시작할 때 참고할 결론:

- Claude API 는 오디오 입력을 못 받으므로 **외부 STT 서비스가 필요**합니다 (비동기 작업 + 웹훅 방식). Claude 는 받아쓰기 결과를 PDF 페이지와 매칭하는 데 사용합니다.
- 진행 순서 제안: ① 녹음 파일 업로드 → 받아쓰기 ② 페이지 매핑 + 학습 화면 '강의' 탭 + AI 컨텍스트 ③ 학습 화면에서 직접 녹음(페이지 넘긴 시각 기록) ④ 요약 노트
- 제약: Supabase Free 는 파일당 50MB · 전체 1GB(PDF 와 공유) → Opus 모노 24~32kbps 로 압축하고 받아쓰기 후 원본 삭제 / Vercel 요청 4.5MB · Hobby 300초 → 브라우저에서 Storage 로 직접 업로드 / iOS 는 화면이 숨겨지면 마이크가 멈춤 / 웹훅 라우트는 로그인 세션이 없어 service role 키 필요
- **미정: STT 서비스 선정** (한국어 정확도, 3시간 파일, URL 입력 + 웹훅, 타임스탬프, 가격 기준으로 비교 필요), 원본 녹음 보관 여부, Pro 플랜 전환 여부

---

## 10. 작업 이력

| 날짜 | 커밋 | 내용 |
| --- | --- | --- |
| 2026-09-17 | `328b5ce` | create-next-app 초기화 |
| 2026-09-17 | `97d215e` | 전체 기능 구현 (인증, 수업/자료, PDF 뷰어, 메모, AI, 캘린더), Supabase 스키마, README |
| 2026-09-17 | — | Supabase 프로젝트에 스키마 적용 · Confirm email 끔 · 비밀번호 최소 8자 · `.env.local` 작성 · 첫 가입 확인 |
| 2026-09-17 | `e978013` | PDF 뷰어 접근성 개선 (업로드 후 바로 열기, 열기 버튼, 최근 강의자료, PDF 넓게 보기, 좁은 화면 오버레이 패널) |
| 2026-09-17 | — | 강의 녹음 → 받아쓰기 기능 설계 검토 (코드 변경 없음, §9 참고) |
| 2026-09-18 | 이 커밋 | 인수인계 문서 작성, "PDF 전체" 모드 용량 한도 수정 (30MB → 22MB) |
