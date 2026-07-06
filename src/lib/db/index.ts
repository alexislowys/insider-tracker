// Database access. DATABASE_URL set (Neon/any Postgres) → pg Pool.
// Unset → PGlite, an in-process Postgres persisted to ./.pglite (dev only).
// Both speak the same SQL and $n parameters.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Db {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Multi-statement execution (migrations). No params, no rows back. */
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

let instance: Db | null = null;

export async function getDb(): Promise<Db> {
  if (instance) return instance;

  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    instance = {
      async query<T>(text: string, params?: unknown[]) {
        const res = await pool.query(text, params);
        return res.rows as T[];
      },
      async exec(text: string) {
        await pool.query(text);
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const pglite = new PGlite(
      join(process.cwd(), process.env.PGLITE_DIR ?? ".pglite"),
    );
    instance = {
      async query<T>(text: string, params?: unknown[]) {
        const res = await pglite.query<T>(text, params);
        return res.rows;
      },
      async exec(text: string) {
        await pglite.exec(text);
      },
      close: () => pglite.close(),
    };
  }

  await migrate(instance);
  return instance;
}

async function migrate(db: Db): Promise<void> {
  const schema = readFileSync(
    join(process.cwd(), "src/lib/db/schema.sql"),
    "utf8",
  );
  await db.exec(schema);
}
