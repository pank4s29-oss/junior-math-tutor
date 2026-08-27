begin;

alter table public.math_attempts
  add column if not exists student_marked_wrong boolean not null default false,
  add column if not exists student_mistake_note text,
  add column if not exists student_marked_wrong_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'math_attempts_student_mistake_note_length_check'
      and conrelid = 'public.math_attempts'::regclass
  ) then
    alter table public.math_attempts
      add constraint math_attempts_student_mistake_note_length_check
      check (student_mistake_note is null or char_length(student_mistake_note) <= 600);
  end if;
end $$;

create index if not exists math_attempts_user_marked_wrong_idx
  on public.math_attempts (user_id, student_marked_wrong_at desc)
  where student_marked_wrong = true;

commit;
