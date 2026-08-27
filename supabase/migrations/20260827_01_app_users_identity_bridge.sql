begin;

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  legacy_user_id bigint not null unique,
  legacy_open_id text not null unique,
  display_name text,
  email text,
  role public.app_role not null default 'student',
  supabase_auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_legacy_open_id_idx on public.app_users (legacy_open_id);
create index if not exists app_users_role_idx on public.app_users (role);

-- Current Supabase learning tables are empty; reroute their owner foreign keys
-- from future Supabase Auth profiles to the compatibility identity bridge.
alter table public.daily_usage drop constraint if exists daily_usage_user_id_fkey;
alter table public.math_attachments drop constraint if exists math_attachments_user_id_fkey;
alter table public.math_attempts drop constraint if exists math_attempts_user_id_fkey;
alter table public.math_conversations drop constraint if exists math_conversations_user_id_fkey;
alter table public.practice_results drop constraint if exists practice_results_user_id_fkey;
alter table public.teacher_escalations drop constraint if exists teacher_escalations_user_id_fkey;

alter table public.daily_usage
  add constraint daily_usage_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.math_attachments
  add constraint math_attachments_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.math_attempts
  add constraint math_attempts_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.math_conversations
  add constraint math_conversations_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.practice_results
  add constraint practice_results_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.teacher_escalations
  add constraint teacher_escalations_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;

-- The current application uses protected server routes. Prevent direct browser
-- reads/writes of student learning records until a future Supabase Auth client
-- migration creates matching, tested per-user RLS policies.
revoke all on public.app_users from anon, authenticated;
revoke all on public.math_conversations from anon, authenticated;
revoke all on public.math_attachments from anon, authenticated;
revoke all on public.math_attempts from anon, authenticated;
revoke all on public.practice_results from anon, authenticated;
revoke all on public.teacher_escalations from anon, authenticated;
revoke all on public.daily_usage from anon, authenticated;

commit;
