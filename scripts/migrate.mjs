import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
    throw new Error("DATABASE_URL is required for migrations");
const migrationUrl = new URL("../db/migrations/001_lead_submissions.sql", import.meta.url);
const migration = await readFile(fileURLToPath(migrationUrl), "utf8");
const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
    await sql.unsafe(migration);
    console.log("Lead database migration completed.");
}
finally {
    await sql.end({ timeout: 5 });
}
