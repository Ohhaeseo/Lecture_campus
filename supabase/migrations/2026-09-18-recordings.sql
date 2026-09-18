-- =====================================================================
-- 강의 녹음 + 받아쓰기 + AI 요약 기능 추가 (2026-09-18)
-- 이미 supabase/schema.sql 을 실행한 프로젝트에서 이 파일만 추가로 실행하세요.
-- (새로 시작하는 경우 schema.sql 에 같은 내용이 들어 있으니 이 파일은 필요 없습니다)
-- =====================================================================

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
