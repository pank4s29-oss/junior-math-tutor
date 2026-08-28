begin;

alter table public.math_attempts
  alter column mode type text using mode::text;

alter table public.math_attempts
  drop constraint if exists math_attempts_mode_key_check;

alter table public.math_attempts
  add constraint math_attempts_mode_key_check
  check (mode ~ '^[a-z][a-z0-9_-]{1,79}$');

commit;
