import "dotenv/config";
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("缺少 SUPABASE_DB_URL，無法驗證 Auth profile trigger。");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(`
    select t.tgname, p.proname, pg_get_functiondef(p.oid) as function_definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname = 'on_auth_user_created'
      and not t.tgisinternal
  `);
  if (rows.length !== 1 || rows[0].proname !== "handle_new_user" || !rows[0].function_definition.includes("insert into public.app_users")) {
    throw new Error("找不到預期的 auth.users → public.handle_new_user profile 初始化 trigger。");
  }
  console.log("Verified Auth bootstrap trigger: on_auth_user_created → profiles + app_users");
} finally {
  await client.end();
}
