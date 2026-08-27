import { Client } from "pg";
import { describe, expect, it } from "vitest";

describe("Supabase 解題資料庫結構", () => {
  it("具備 app_users 身分橋接與完整學習資料表，且可唯讀查驗", async () => {
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10_000 });
    await client.connect();
    try {
      const result = await client.query<{ name: string }>("select tablename as name from pg_tables where schemaname = 'public' and tablename = any($1::text[]) order by tablename", [["app_users", "daily_usage", "math_attachments", "math_attempts", "math_conversations", "practice_results", "teacher_escalations", "teacher_units", "approved_contents"]]);
      expect(result.rows.map(row => row.name)).toEqual(["app_users", "approved_contents", "daily_usage", "math_attachments", "math_attempts", "math_conversations", "practice_results", "teacher_escalations", "teacher_units"]);
    } finally { await client.end(); }
  }, 15_000);
});
