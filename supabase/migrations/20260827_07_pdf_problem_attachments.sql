begin;

alter table public.math_attachments
  drop constraint if exists math_attachments_mime_type_check;

alter table public.math_attachments
  add constraint math_attachments_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));

update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  where id = 'math-problems';

commit;
