// Filterable/sortable transaction screener. All filters optional; SQL is
// built from a whitelist — user input never reaches the query text, only
// parameters.

import { getDb } from "./db";
import type { ActivityRow } from "./queries";

export interface ScreenerFilters {
  code?: "P" | "S";
  role?: "officer" | "director" | "ten_percent";
  minValue?: number;
  days?: number;
  ticker?: string;
  sort?: "date" | "value" | "shares";
  page?: number;
}

export const PAGE_SIZE = 50;

const SORT_SQL: Record<NonNullable<ScreenerFilters["sort"]>, string> = {
  date: "t.transaction_date DESC, value DESC NULLS LAST",
  value: "value DESC NULLS LAST",
  shares: "t.shares DESC NULLS LAST",
};

export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): ScreenerFilters {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const code = one(params.code);
  const role = one(params.role);
  const sort = one(params.sort);
  const minValue = Number(one(params.minValue));
  const days = Number(one(params.days));
  const page = Number(one(params.page));
  return {
    code: code === "P" || code === "S" ? code : undefined,
    role:
      role === "officer" || role === "director" || role === "ten_percent"
        ? role
        : undefined,
    minValue: Number.isFinite(minValue) && minValue > 0 ? minValue : undefined,
    days: Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : undefined,
    ticker: one(params.ticker)?.trim().toUpperCase() || undefined,
    sort: sort === "value" || sort === "shares" ? sort : "date",
    page: Number.isFinite(page) && page > 1 ? Math.floor(page) : 1,
  };
}

export async function screen(f: ScreenerFilters): Promise<ActivityRow[]> {
  const where: string[] = ["t.is_derivative = FALSE"];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };

  if (f.code) where.push(`t.code = ${arg(f.code)}`);
  else where.push(`t.code IN ('P', 'S')`);
  if (f.ticker) where.push(`c.ticker = ${arg(f.ticker)}`);
  if (f.minValue) where.push(`t.shares * t.price_per_share >= ${arg(f.minValue)}`);
  if (f.days)
    where.push(`t.transaction_date > CURRENT_DATE - ${arg(f.days)} * INTERVAL '1 day'`);
  if (f.role === "officer") where.push(`fo.is_officer`);
  if (f.role === "director") where.push(`fo.is_director`);
  if (f.role === "ten_percent") where.push(`fo.is_ten_percent_owner`);

  const offset = ((f.page ?? 1) - 1) * PAGE_SIZE;
  const db = await getDb();
  return db.query<ActivityRow>(
    `SELECT f.accession_number, c.ticker, c.name AS company_name, c.cik AS company_cik,
            i.name AS insider_name, i.cik AS insider_cik,
            fo.officer_title, fo.is_director, fo.is_ten_percent_owner,
            t.transaction_date::text, t.code, t.shares::text,
            t.price_per_share::text,
            (t.shares * t.price_per_share)::text AS value
     FROM transactions t
     JOIN filings f ON f.accession_number = t.accession_number
     JOIN companies c ON c.cik = f.company_cik
     JOIN filing_owners fo ON fo.accession_number = f.accession_number
     JOIN insiders i ON i.cik = fo.insider_cik
     WHERE ${where.join(" AND ")}
     ORDER BY ${SORT_SQL[f.sort ?? "date"]}
     LIMIT ${PAGE_SIZE} OFFSET ${arg(offset)}`,
    args,
  );
}
