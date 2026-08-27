begin;

-- 將第一次 Supabase Auth 登入初始化為原子操作：profile 與 app_users
-- 皆以最低 student 權限建立，教師／管理者提升只能由受保護的資料庫操作進行。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, '學生'),
    'student'
  )
  on conflict (id) do nothing;

  insert into public.app_users (supabase_auth_user_id, display_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, '學生'),
    new.email,
    'student'
  )
  on conflict (supabase_auth_user_id) do nothing;

  return new;
end;
$$;

commit;
