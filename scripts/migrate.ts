/**
 * Apply every SQL file in `supabase/migrations/` (in lexicographic order)
 * against a Postgres connection. Idempotent for files that use
 * `CREATE TABLE IF NOT EXISTS` etc; for non-idempotent statements you should
 * point this at a fresh project.
 *
 * Connection string is read from (in order):
 *   POSTGRES_URL_NON_POOLING  (preferred — direct connection, supports DDL)
 *   STORAGE_POSTGRES_URL_NON_POOLING
 *   POSTGRES_URL
 *   STORAGE_POSTGRES_URL
 *
 * Usage:
 *   npm run migrate
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.STORAGE_POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL ??
  process.env.STORAGE_POSTGRES_URL;

if (!connectionString) {
  console.error(
    "No Postgres connection string found. Set POSTGRES_URL_NON_POOLING (or the STORAGE_ prefixed equivalent) in .env.local.",
  );
  process.exit(1);
}

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  // Strip `sslmode` from the URL — recent versions of pg-connection-string
  // alias `require` → `verify-full`, which then ignores our explicit
  // `rejectUnauthorized: false` and fails on Supabase's self-signed pooler
  // chain. We supply the SSL config separately instead.
  const sanitized = connectionString!
    .replace(/([?&])sslmode=[^&]*&?/i, "$1")
    .replace(/[?&]$/, "");
  console.log(`→ Connecting to ${sanitized.replace(/:[^:@]+@/, ":***@")}`);
  const client = new Client({
    connectionString: sanitized,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    for (const file of files) {
      const path = join(MIGRATIONS_DIR, file);
      const sql = readFileSync(path, "utf8");
      process.stdout.write(`→ ${file} … `);
      try {
        await client.query(sql);
        console.log("ok");
      } catch (err) {
        console.log("FAILED");
        console.error(err);
        throw err;
      }
    }
    console.log(`✓ Applied ${files.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
