-- =====================================================================
-- 강의노트 DB 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
-- (여러 번 실행해도 안전하도록 if not exists / or replace 를 사용합니다)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 공통: updated_at 자동 갱신 트리거
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 수업 (courses)
-- ---------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  professor   text check (char_length(professor) <= 50),
  semester    text check (char_length(semester) <= 50),
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists courses_user_id_idx on public.courses (user_id);

-- ---------------------------------------------------------------------
-- 강의자료 PDF (documents) — 파일 자체는 Storage 'documents' 버킷에 저장
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  storage_path  text not null unique,
  file_size     bigint,
  page_count    integer,
  last_page     integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists documents_course_id_idx on public.documents (course_id);

-- ---------------------------------------------------------------------
-- 메모 (notes) — PDF 페이지에 연결 가능 (page 가 null 이면 문서 전체 메모)
-- ---------------------------------------------------------------------
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id  uuid not null references public.documents (id) on delete cascade,
  page         integer,
  content      text not null check (char_length(content) between 1 and 20000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists notes_user_id_idx on public.notes (user_id);
create index if not exists notes_document_id_idx on public.notes (document_id);

-- ---------------------------------------------------------------------
-- AI 대화 기록 (chat_messages)
-- ---------------------------------------------------------------------
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id  uuid not null references public.documents (id) on delete cascade,
  role         text not null check (role in ('user', 'assistant')),
  content      text not null,
  page         integer,
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_user_id_idx on public.chat_messages (user_id);
create index if not exists chat_messages_document_id_idx on public.chat_messages (document_id, created_at);

-- ---------------------------------------------------------------------
-- 일정 (events) — 시험 기간처럼 여러 날에 걸친 일정은 end_date 사용
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id    uuid references public.courses (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 100),
  type         text not null default 'exam'
               check (type in ('exam', 'assignment', 'quiz', 'presentation', 'etc')),
  start_date   date not null,
  end_date     date,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists events_user_id_idx on public.events (user_id, start_date);
create index if not exists events_course_id_idx on public.events (course_id);

-- updated_at 트리거 연결
drop trigger if exists courses_updated_at on public.courses;
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS (Row Level Security): 본인 데이터만 읽고 쓸 수 있게
-- =====================================================================
alter table public.courses       enable row level security;
alter table public.documents     enable row level security;
alter table public.notes         enable row level security;
alter table public.chat_messages enable row level security;
alter table public.events        enable row level security;

drop policy if exists "courses_owner" on public.courses;
create policy "courses_owner" on public.courses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 자료는 본인 수업에만 추가 가능
drop policy if exists "documents_owner" on public.documents;
create policy "documents_owner" on public.documents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "notes_owner" on public.notes;
create policy "notes_owner" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))
  );

drop policy if exists "chat_messages_owner" on public.chat_messages;
create policy "chat_messages_owner" on public.chat_messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))
  );

drop policy if exists "events_owner" on public.events;
create policy "events_owner" on public.events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      course_id is null
      or exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid()))
    )
  );

-- =====================================================================
-- Storage: PDF 파일 버킷 (비공개)
-- 경로 규칙: {user_id}/{course_id}/{document_id}.pdf
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents_bucket_select" on storage.objects;
create policy "documents_bucket_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "documents_bucket_insert" on storage.objects;
create policy "documents_bucket_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "documents_bucket_update" on storage.objects;
create policy "documents_bucket_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "documents_bucket_delete" on storage.objects;
create policy "documents_bucket_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.recordings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id         uuid not null references public.courses (id) on delete cascade,
  -- 나중에 슬라이드와 연결할 때 사용 (지금은 UI 에서 쓰지 않음)
  document_id       uuid references public.documents (id) on delete set null,
  title             text not null check (char_length(title) between 1 and 200),
  -- recording: 앱에서 녹음 / upload: 오디오 파일 업로드 / text: 전사문 직접 붙여넣기
  source            text not null default 'recording' check (source in ('recording', 'upload', 'text')),
  status            text not null default 'ready'
                    check (status in ('ready', 'transcribing', 'transcribed', 'failed')),
  storage_path      text unique,
  file_size         bigint,
  duration_seconds  integer,
  transcript        text,
  -- [{ start, end, text }] 형태의 구간별 받아쓰기 (타임스탬프)
  segments          jsonb,
  summary           text,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists recordings_user_id_idx on public.recordings (user_id);
create index if not exists recordings_course_id_idx on public.recordings (course_id, created_at desc);

drop trigger if exists recordings_updated_at on public.recordings;
create trigger recordings_updated_at before update on public.recordings
  for each row execute function public.set_updated_at();

alter table public.recordings enable row level security;

drop policy if exists "recordings_owner" on public.recordings;
create policy "recordings_owner" on public.recordings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 녹음 파일 버킷 (비공개)
-- 경로 규칙: {user_id}/{course_id}/{recording_id}.{확장자}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings', 'recordings', false, 52428800,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
        'audio/x-wav', 'audio/aac', 'audio/x-m4a', 'audio/flac']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recordings_bucket_select" on storage.objects;
create policy "recordings_bucket_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recordings_bucket_insert" on storage.objects;
create policy "recordings_bucket_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recordings_bucket_update" on storage.objects;
create policy "recordings_bucket_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "recordings_bucket_delete" on storage.objects;
create policy "recordings_bucket_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
