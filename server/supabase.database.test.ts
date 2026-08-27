import { Client } from "pg";
import { describe, expect, it } from "vitest";

describe("Supabase PostgreSQL migration connection", () => {
  it("can perform a server-only read-only health query", async () => {
    const connectionString = process.env.SUPABASE_DB_URL;
    expect(connectionString).toMatch(/^postgres(?:ql)?:\/\//i);

    const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
    await client.connect();
    try {
      const result = await client.query<{ current_database: string }>("select current_database()");
      expect(result.rows[0]?.current_database).toBeTruthy();
    } finally {
      await client.end();
    }
  }, 15_000);
});
