import { readFile } from "node:fs/promises";
import pg from "pg";

const migrationPath = process.argv[2];
if (!migrationPath) throw new Error("Usage: node scripts/apply-supabase-migration.mjs <migration.sql>");

const { Client } = pg;
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
try {
  const sql = await readFile(migrationPath, "utf8");
  await client.connect();
  await client.query(sql);
  console.log(`Applied migration: ${migrationPath}`);
} finally {
  await client.end();
}
