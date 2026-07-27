// In-memory database for tests: real Postgres semantics via PGlite, same
// schema.sql as production, no disk state and no network.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "./index";

export async function createTestDb(): Promise<Db> {
  const pglite = new PGlite();
  const db: Db = {
    async query<T>(text: string, params?: unknown[]) {
      const res = await pglite.query<T>(text, params);
      return res.rows;
    },
    async exec(text: string) {
      await pglite.exec(text);
    },
    close: () => pglite.close(),
  };
  await db.exec(
    readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8"),
  );
  return db;
}

/** Route getDb() callers (queries.ts) to this instance. */
export function injectDb(db: Db): void {
  const g = globalThis as typeof globalThis & { __insiderDb?: Db };
  g.__insiderDb = db;
}

// -- fixture builders ---------------------------------------------------------

export async function addCompany(
  db: Db,
  cik: string,
  name: string,
  ticker: string | null,
): Promise<void> {
  await db.query(`INSERT INTO companies (cik, name, ticker) VALUES ($1, $2, $3)`, [
    cik,
    name,
    ticker,
  ]);
}

export async function addInsider(db: Db, cik: string, name: string): Promise<void> {
  await db.query(`INSERT INTO insiders (cik, name) VALUES ($1, $2)`, [cik, name]);
}

export async function addFiling(
  db: Db,
  accession: string,
  companyCik: string,
  opts: { daysAgo?: number; is10b51?: boolean | null } = {},
): Promise<void> {
  const { daysAgo = 2, is10b51 = null } = opts;
  await db.query(
    `INSERT INTO filings (accession_number, company_cik, filed_date, is_10b5_1)
     VALUES ($1, $2, CURRENT_DATE - ${Math.trunc(daysAgo)}, $3)`,
    [accession, companyCik, is10b51],
  );
}

export async function addOwner(
  db: Db,
  accession: string,
  insiderCik: string,
  opts: { officer?: boolean; director?: boolean; tenPercent?: boolean } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO filing_owners
       (accession_number, insider_cik, is_officer, is_director, is_ten_percent_owner)
     VALUES ($1, $2, $3, $4, $5)`,
    [accession, insiderCik, opts.officer ?? false, opts.director ?? false, opts.tenPercent ?? false],
  );
}

export async function addTransaction(
  db: Db,
  accession: string,
  opts: {
    code?: string;
    shares?: number;
    price?: number | null;
    daysAgo?: number;
    derivative?: boolean;
  } = {},
): Promise<void> {
  const { code = "P", shares = 100, price = 10, daysAgo = 2, derivative = false } = opts;
  await db.query(
    `INSERT INTO transactions
       (accession_number, security_title, transaction_date, code, shares,
        price_per_share, acquired_disposed, is_derivative)
     VALUES ($1, 'Common Stock', CURRENT_DATE - ${Math.trunc(daysAgo)}, $2, $3, $4, $5, $6)`,
    [accession, code, shares, price, code === "S" ? "D" : "A", derivative],
  );
}

/** Cached close dated today, so getDailyCloses stays cache-fresh (no fetch). */
export async function addPrice(
  db: Db,
  ticker: string,
  close: number,
  daysAgo = 0,
): Promise<void> {
  await db.query(
    `INSERT INTO prices (ticker, date, close)
     VALUES ($1, CURRENT_DATE - ${Math.trunc(daysAgo)}, $2)
     ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close`,
    [ticker, close],
  );
}
