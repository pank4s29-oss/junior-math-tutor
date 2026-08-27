import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("需要 SUPABASE_DB_URL 才能驗證遠端 Supabase migration；請只放在 .env.local 或終端機環境變數。\n");
}

const { Client } = pg;
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });

try {
  await client.connect();
  const { rows } = await client.query(`
    select
      to_regclass('public.app_users') is not null as app_users_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'app_users'
          and column_name = 'supabase_auth_user_id'
      ) as auth_identity_column_exists,
      exists (select 1 from pg_proc where proname = 'consume_tutor_quota') as quota_function_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'math_attempts'
          and column_name = 'student_marked_wrong'
      ) as student_mistake_marker_exists,
      exists (
        select 1 from pg_constraint
        where conname = 'math_attachments_mime_type_check'
          and pg_get_constraintdef(oid) like '%application/pdf%'
      ) as pdf_attachment_support_exists,
      exists (
        select 1
        from pg_trigger trigger
        join pg_proc procedure on procedure.oid = trigger.tgfoid
        join pg_class relation on relation.oid = trigger.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where trigger.tgname = 'on_auth_user_created'
          and procedure.proname = 'handle_new_user'
          and namespace.nspname = 'auth'
          and relation.relname = 'users'
      ) as auth_bootstrap_trigger_exists
  `);

  const result = rows[0];
  if (!result.app_users_exists || !result.auth_identity_column_exists || !result.quota_function_exists || !result.student_mistake_marker_exists || !result.pdf_attachment_support_exists || !result.auth_bootstrap_trigger_exists) {
    throw new Error("Supabase migration 驗證不完整：請先比對 supabase/migrations 與遠端 schema，再決定是否執行 db push 或 migration repair。\n");
  }
  console.log("Verified remote Supabase migrations: Auth identity, quota RPC, PDF attachments, student mistake markers, and Auth bootstrap trigger.");
} finally {
  await client.end();
}
