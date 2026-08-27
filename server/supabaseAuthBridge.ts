import { Pool } from "pg";
import { ENV } from "./_core/env";

let pool: Pool | undefined;

function getPool() {
  if (!ENV.supabaseDbUrl) return undefined;
  if (!pool) pool = new Pool({ connectionString: ENV.supabaseDbUrl, max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  return pool;
}

/**
 * Finds a pre-existing Supabase Auth account for the signed-in user. This
 * bridge never creates password credentials or exposes auth.users to clients.
 */
export async function resolveSupabaseAuthUserId(email?: string | null) {
  if (!email) return undefined;
  const connection = getPool();
  if (!connection) return undefined;
  const result = await connection.query<{ id: string }>(
    `select u.id::text as id
     from auth.users u
     join public.profiles p on p.id = u.id
     where lower(u.email) = lower($1)
     limit 1`,
    [email],
  );
  return result.rows[0]?.id;
}
