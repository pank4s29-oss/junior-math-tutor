-- Multi-question tutoring sessions and a teacher-controlled batch cap.
-- The session is metadata only; question text and private attachments remain in existing user-owned tables.
create table if not exists public.teacher_tutor_settings (
  id boolean primary key default true check (id = true),
  max_batch_questions integer not null default 5 check (max_batch_questions in (5, 10)),
  updated_at timestamptz not null default now()
);

insert into public.teacher_tutor_settings (id, max_batch_questions)
values (true, 5)
on conflict (id) do nothing;

create table if not exists public.tutor_batch_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  grade text not null,
  unit_key text not null,
  question_count integer not null check (question_count between 1 and 10),
  max_questions integer not null check (max_questions in (5, 10)),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tutor_batch_sessions_user_created_idx
  on public.tutor_batch_sessions (user_id, created_at desc);

alter table public.teacher_tutor_settings enable row level security;
alter table public.tutor_batch_sessions enable row level security;

-- Server-side service-role access is used by the tRPC procedures. No public client policy is added.
revoke all on public.teacher_tutor_settings from anon, authenticated;
revoke all on public.tutor_batch_sessions from anon, authenticated;

create or replace function public.touch_tutor_batch_session()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tutor_batch_sessions_touch on public.tutor_batch_sessions;
create trigger tutor_batch_sessions_touch
before update on public.tutor_batch_sessions
for each row execute function public.touch_tutor_batch_session();
