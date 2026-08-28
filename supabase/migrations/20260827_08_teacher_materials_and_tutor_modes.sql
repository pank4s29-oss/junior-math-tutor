begin;

create table if not exists public.teacher_tutor_modes (
  id uuid primary key default gen_random_uuid(),
  mode_key text not null unique check (mode_key ~ '^[a-z][a-z0-9-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null check (char_length(trim(description)) between 1 and 240),
  teaching_instructions text not null check (char_length(trim(teaching_instructions)) between 30 and 3000),
  is_approved boolean not null default false,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_materials (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.teacher_units(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  original_name text not null check (char_length(trim(original_name)) between 1 and 160),
  bucket_id text not null default 'teacher-materials' check (bucket_id = 'teacher-materials'),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'text/plain', 'text/markdown')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 3145728),
  extracted_text text not null default '',
  is_approved boolean not null default false,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_tutor_modes_student_visible_idx
  on public.teacher_tutor_modes (is_approved, mode_key);
create index if not exists teacher_materials_unit_visible_idx
  on public.teacher_materials (unit_id, is_approved, updated_at desc);

alter table public.teacher_tutor_modes enable row level security;
alter table public.teacher_materials enable row level security;
revoke all on table public.teacher_tutor_modes, public.teacher_materials from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-materials', 'teacher-materials', false, 3145728, array['application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into public.teacher_tutor_modes (mode_key, name, description, teaching_instructions, is_approved)
values
  ('guided', '引導解題', '先給下一步提示，不急著揭露答案。', '先給一個最小但有用的提示。除非學生明確要求完整解法，否則只揭露能讓他做下一步的內容；仍須保留固定欄位，但步驟欄最多列出下一步與其理由。', true),
  ('step-by-step', '逐步教學', '把推理、算式與理由完整說清楚。', '以清楚、可追蹤的方式完整教學。每一個步驟都要包含運算或推理，以及為什麼能這樣做。', true),
  ('check', '驗算訂正', '檢查你的過程，找出第一個可修正處。', '把學生提供的嘗試視為待檢查的草稿。找出第一個可辨認的問題，說明原因與修正方法；若學生沒有提供過程，請先請他貼出過程，再提供最低限度的檢查。', true)
on conflict (mode_key) do nothing;

commit;
