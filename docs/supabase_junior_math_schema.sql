-- 國中數學解題教練：Supabase PostgreSQL 初始結構
-- 執行位置：Supabase Dashboard → SQL Editor → New query
-- 注意：先在 development 專案執行與測試，再對 production 套用。

create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.grade_level as enum ('seven', 'eight', 'nine');
create type public.tutor_mode as enum ('guided', 'step_by_step', 'check');
create type public.attachment_status as enum ('pending', 'readable', 'unclear', 'rejected');
create type public.content_type as enum ('concept', 'example', 'misconception', 'rubric');
create type public.practice_status as enum ('not_attempted', 'correct', 'incorrect', 'needs_review');
create type public.escalation_reason as enum ('wrong_answer', 'unclear_photo', 'teacher_help', 'safety_concern');
create type public.escalation_status as enum ('new', 'reviewing', 'resolved');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 所有使用者以 Supabase Auth UUID 為主鍵；不要以可由學生更新的 user_metadata 存角色。
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email, '學生'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('teacher', 'admin')
  );
$$;

create table public.teacher_units (
  id uuid primary key default gen_random_uuid(),
  grade public.grade_level not null,
  unit_key text not null check (char_length(unit_key) between 1 and 80),
  name text not null check (char_length(name) between 1 and 160),
  teaching_rules text not null check (char_length(teaching_rules) between 30 and 5000),
  is_approved boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grade, unit_key)
);

create table public.approved_contents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.teacher_units(id) on delete cascade,
  type public.content_type not null,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 20 and 12000),
  is_approved boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.math_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  grade public.grade_level not null,
  unit_key text not null check (char_length(unit_key) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 只保存私有 bucket 物件路徑與 metadata；不要把影像 bytes 寫入資料庫。
create table public.math_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'math-problems',
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  recognition_status public.attachment_status not null default 'pending',
  -- 學生確認／編輯後的題目辨識文字，讓附件在移出前端暫存後仍可被續問或編輯（見遷移 20260831_13）。
  transcription text,
  -- 此附件第一次成功解題時建立／延續的對話串，讓 solve 可只憑 attachmentId 自動延續正確的對話。
  conversation_id uuid references public.math_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.math_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.math_conversations(id) on delete cascade,
  grade public.grade_level not null,
  unit_key text not null check (char_length(unit_key) between 1 and 80),
  mode public.tutor_mode not null,
  question_text text not null check (char_length(question_text) between 1 and 4000),
  attachment_id uuid references public.math_attachments(id) on delete set null,
  response_markdown text not null,
  response_json jsonb not null,
  confidence integer not null check (confidence between 0 and 100),
  needs_clarification boolean not null default false,
  error_tags jsonb not null default '[]'::jsonb,
  model text not null check (char_length(model) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.practice_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_attempt_id uuid not null references public.math_attempts(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  student_answer text,
  status public.practice_status not null default 'not_attempted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teacher_escalations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null references public.math_attempts(id) on delete cascade,
  reason public.escalation_reason not null,
  detail text check (detail is null or char_length(detail) <= 1200),
  priority text not null default 'standard' check (priority in ('standard', 'high')),
  status public.escalation_status not null default 'new',
  notification_delivered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  last_requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger teacher_units_set_updated_at before update on public.teacher_units
  for each row execute procedure public.set_updated_at();
create trigger approved_contents_set_updated_at before update on public.approved_contents
  for each row execute procedure public.set_updated_at();
create trigger math_conversations_set_updated_at before update on public.math_conversations
  for each row execute procedure public.set_updated_at();
create trigger math_attachments_set_updated_at before update on public.math_attachments
  for each row execute procedure public.set_updated_at();
create trigger practice_results_set_updated_at before update on public.practice_results
  for each row execute procedure public.set_updated_at();
create trigger teacher_escalations_set_updated_at before update on public.teacher_escalations
  for each row execute procedure public.set_updated_at();
create trigger daily_usage_set_updated_at before update on public.daily_usage
  for each row execute procedure public.set_updated_at();

-- 支援學生本人資料列存取、教師工作台查詢與用量／案件查詢的索引。
create index math_conversations_user_created_idx on public.math_conversations (user_id, created_at desc);
create index math_attachments_user_created_idx on public.math_attachments (user_id, created_at desc);
create index math_attachments_conversation_idx on public.math_attachments (conversation_id);
create index math_attempts_user_created_idx on public.math_attempts (user_id, created_at desc);
create index math_attempts_conversation_idx on public.math_attempts (conversation_id, created_at desc);
create index practice_results_user_created_idx on public.practice_results (user_id, created_at desc);
create index teacher_escalations_status_created_idx on public.teacher_escalations (status, created_at desc);
create index teacher_escalations_user_created_idx on public.teacher_escalations (user_id, created_at desc);
create index approved_contents_unit_approved_idx on public.approved_contents (unit_id, is_approved);

-- RLS：公開 API 只給必要的讀取權限。學生資料的建立／更新由驗證後的 Vercel API 服務處理。
alter table public.profiles enable row level security;
alter table public.teacher_units enable row level security;
alter table public.approved_contents enable row level security;
alter table public.math_conversations enable row level security;
alter table public.math_attachments enable row level security;
alter table public.math_attempts enable row level security;
alter table public.practice_results enable row level security;
alter table public.teacher_escalations enable row level security;
alter table public.daily_usage enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on public.profiles to authenticated;
grant select on public.teacher_units to authenticated;
grant select on public.approved_contents to authenticated;
grant select on public.math_conversations to authenticated;
grant select on public.math_attachments to authenticated;
grant select on public.math_attempts to authenticated;
grant select on public.practice_results to authenticated;
grant select on public.teacher_escalations to authenticated;
grant select on public.daily_usage to authenticated;

create policy "students read own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "students read approved units teachers read all units"
on public.teacher_units for select to authenticated
using (is_approved or public.is_staff());

create policy "students read approved content teachers read all content"
on public.approved_contents for select to authenticated
using (
  public.is_staff()
  or (
    is_approved and exists (
      select 1 from public.teacher_units u
      where u.id = unit_id and u.is_approved
    )
  )
);

create policy "students read own conversations"
on public.math_conversations for select to authenticated
using ((select auth.uid()) = user_id);

create policy "students read own attachment metadata"
on public.math_attachments for select to authenticated
using ((select auth.uid()) = user_id);

create policy "students read own attempts"
on public.math_attempts for select to authenticated
using ((select auth.uid()) = user_id);

create policy "students read own practice results"
on public.practice_results for select to authenticated
using ((select auth.uid()) = user_id);

create policy "students read own reports teachers read all reports"
on public.teacher_escalations for select to authenticated
using ((select auth.uid()) = user_id or public.is_staff());

create policy "students read own daily usage"
on public.daily_usage for select to authenticated
using ((select auth.uid()) = user_id);

-- 私有題目照片 bucket：前端不直接上傳；受保護 Vercel API 以 server-only Secret key 處理。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('math-problems', 'math-problems', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 建議：暫時不授與 anon 或 authenticated 對 storage.objects 的直接存取權。
-- Vercel API 驗證使用者與檔案後，以 SUPABASE_SECRET_KEY 寫入／建立 signed URL。

-- 初次設定完成後，請到 Authentication → Users 建立自己的帳號，
-- 再執行：update public.profiles set role = 'admin' where id = '<你的 auth UUID>';
