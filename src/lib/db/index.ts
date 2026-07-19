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

// Survive dev-server hot reloads: module-level state is reset on HMR, and a
// second PGlite on the same data dir aborts. globalThis persists.
const g = globalThis as typeof globalThis & { __insiderDb?: Db | Promise<Db> };

export async function getDb(): Promise<Db> {
  if (g.__insiderDb) return g.__insiderDb;
  const pending = init();
  g.__insiderDb = pending; // synchronous set — concurrent callers share one init
  const db = await pending;
  g.__insiderDb = db;
  return db;
}

async function init(): Promise<Db> {
  let instance: Db;

  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Neon closes idle pooled connections; without a listener that error
    // event crashes the whole process (long-running scripts especially)
    pool.on("error", (e) => console.error(`[pg pool] ${e.message}`));
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
