begin;

-- 新的 Vercel／Supabase Auth 使用者沒有既有受管帳號的數字 ID。
-- 保留舊欄位與 unique 約束作為已移轉資料的相容識別，但允許新帳號僅以
-- auth.users UUID（supabase_auth_user_id）建立 app_users 紀錄。
alter table public.app_users alter column legacy_user_id drop not null;
alter table public.app_users alter column legacy_open_id drop not null;

commit;
