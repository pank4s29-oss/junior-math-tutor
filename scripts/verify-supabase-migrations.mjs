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
      exists (select 1 from pg_proc where proname = 'refund_tutor_quota') as quota_refund_function_exists,
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
      to_regclass('public.teacher_tutor_modes') is not null as teacher_tutor_modes_exists,
      to_regclass('public.teacher_materials') is not null as teacher_materials_exists,
      to_regclass('public.tutor_batch_sessions') is not null as tutor_batch_sessions_exists,
      to_regclass('public.teacher_tutor_settings') is not null as teacher_tutor_settings_exists,
      to_regclass('public.practice_question_bank') is not null as practice_question_bank_exists,
      exists (select 1 from pg_proc where proname = 'claim_practice_question_bank_item') as claim_practice_question_bank_item_exists,
      to_regclass('public.practice_question_bank_pool_stats') is not null as practice_question_bank_pool_stats_exists,
      exists (
        select 1 from storage.buckets
        where id = 'teacher-materials' and public = false
      ) as private_teacher_material_bucket_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'math_attempts'
          and column_name = 'mode' and data_type = 'text'
      ) as dynamic_mode_key_exists,
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
  if (!result.app_users_exists || !result.auth_identity_column_exists || !result.quota_function_exists || !result.quota_refund_function_exists || !result.student_mistake_marker_exists || !result.pdf_attachment_support_exists || !result.teacher_tutor_modes_exists || !result.teacher_materials_exists || !result.tutor_batch_sessions_exists || !result.teacher_tutor_settings_exists || !result.private_teacher_material_bucket_exists || !result.dynamic_mode_key_exists || !result.auth_bootstrap_trigger_exists || !result.practice_question_bank_exists || !result.claim_practice_question_bank_item_exists || !result.practice_question_bank_pool_stats_exists) {
    throw new Error("Supabase migration 驗證不完整：請先比對 supabase/migrations 與遠端 schema，再決定是否執行 db push 或 migration repair。\n");
  }
  console.log("Verified remote Supabase migrations: Auth identity, quota RPC with provider-failure refund, student uploads, private teacher materials, multi-question tutoring sessions, teacher batch settings, dynamic tutor modes, student mistake markers, Auth bootstrap trigger, and the practice question bank (background refill cache) schema.");
} finally {
  await client.end();
}
