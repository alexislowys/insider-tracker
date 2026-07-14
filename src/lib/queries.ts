// Read queries for the UI. All money math: shares * price_per_share, null-safe.

import { getDb } from "./db";

export interface ActivityRow {
  accession_number: string;
  ticker: string | null;
  company_name: string;
  company_cik: string;
  insider_name: string;
  insider_cik: string;
  officer_title: string | null;
  is_director: boolean;
  is_ten_percent_owner: boolean;
  transaction_date: string;
  code: string;
  is_10b5_1: boolean | null;
  shares: string | null;
  price_per_share: string | null;
  value: string | null;
}

const ACTIVITY_SELECT = `
  SELECT f.accession_number, c.ticker, c.name AS company_name, c.cik AS company_cik,
         i.name AS insider_name, i.cik AS insider_cik,
         fo.officer_title, fo.is_director, fo.is_ten_percent_owner,
         f.is_10b5_1,
         t.transaction_date::text, t.code, t.shares::text,
         t.price_per_share::text,
         (t.shares * t.price_per_share)::text AS value
  FROM transactions t
  JOIN filings f ON f.accession_number = t.accession_number
  JOIN companies c ON c.cik = f.company_cik
  JOIN filing_owners fo ON fo.accession_number = f.accession_number
  JOIN insiders i ON i.cik = fo.insider_cik
  WHERE t.is_derivative = FALSE`;

/** Latest open-market buys and sells (codes P/S — the signal, not grants). */
export async function recentTrades(limit = 50): Promise<ActivityRow[]> {
  const db = await getDb();
  return db.query<ActivityRow>(
    `${ACTIVITY_SELECT} AND t.code IN ('P', 'S')
     ORDER BY t.transaction_date DESC, value DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
}

export interface ClusterBuy {
  ticker: string | null;
  company_name: string;
  company_cik: string;
  buyers: string; // count
  total_value: string | null;
  latest_date: string;
}

/**
 * Companies where 2+ insiders bought within the last N days, across 2+
 * separate filings. Requiring separate filings matters: one filing can list
 * six related co-filers for a single purchase — that's not a cluster, and
 * joining owners before summing would also multiply the dollar value.
 */
export async function clusterBuys(days = 14): Promise<ClusterBuy[]> {
  const db = await getDb();
  return db.query<ClusterBuy>(
    `WITH buys AS (
       SELECT f.company_cik, f.accession_number,
              SUM(t.shares * t.price_per_share) AS value,
              MAX(t.transaction_date) AS latest
       FROM transactions t
       JOIN filings f ON f.accession_number = t.accession_number
       WHERE t.code = 'P' AND t.is_derivative = FALSE
         AND f.is_10b5_1 IS NOT TRUE
         AND t.transaction_date > CURRENT_DATE - $1 * INTERVAL '1 day'
       GROUP BY f.company_cik, f.accession_number
     ),
     per_company AS (
       SELECT company_cik, COUNT(*) AS filings,
              SUM(value) AS total_value, MAX(latest) AS latest_date
       FROM buys GROUP BY company_cik
     ),
     buyer_counts AS (
       SELECT b.company_cik, COUNT(DISTINCT fo.insider_cik) AS buyers
       FROM buys b
       JOIN filing_owners fo ON fo.accession_number = b.accession_number
       GROUP BY b.company_cik
     )
     SELECT c.ticker, c.name AS company_name, c.cik AS company_cik,
            bc.buyers::text, pc.total_value::text, pc.latest_date::text
     FROM per_company pc
     JOIN buyer_counts bc ON bc.company_cik = pc.company_cik
     JOIN companies c ON c.cik = pc.company_cik
     WHERE bc.buyers >= 2 AND pc.filings >= 2 AND c.ticker IS NOT NULL
     ORDER BY bc.buyers DESC, pc.total_value DESC NULLS LAST`,
    [days],
  );
}

export async function companyByTicker(ticker: string) {
  const db = await getDb();
  const rows = await db.query<{ cik: string; name: string; ticker: string }>(
    `SELECT cik, name, ticker FROM companies WHERE ticker = $1`,
    [ticker.toUpperCase()],
  );
  return rows[0] ?? null;
}

export async function companyActivity(
  companyCik: string,
  limit = 200,
): Promise<ActivityRow[]> {
  const db = await getDb();
  return db.query<ActivityRow>(
    `${ACTIVITY_SELECT} AND c.cik = $1
     ORDER BY t.transaction_date DESC LIMIT $2`,
    [companyCik, limit],
  );
}

export async function insiderByCik(cik: string) {
  const db = await getDb();
  const rows = await db.query<{ cik: string; name: string }>(
    `SELECT cik, name FROM insiders WHERE cik = $1`,
    [cik],
  );
  return rows[0] ?? null;
}

export async function insiderActivity(
  insiderCik: string,
  limit = 200,
): Promise<ActivityRow[]> {
  const db = await getDb();
  return db.query<ActivityRow>(
    `${ACTIVITY_SELECT} AND i.cik = $1
     ORDER BY t.transaction_date DESC LIMIT $2`,
    [insiderCik, limit],
  );
}

/** Largest single open-market buys in the window (one row per transaction). */
export async function topBuys(days = 7, limit = 10): Promise<ActivityRow[]> {
  const db = await getDb();
  return db.query<ActivityRow>(
    `${ACTIVITY_SELECT} AND t.code = 'P'
       AND t.transaction_date > CURRENT_DATE - $1 * INTERVAL '1 day'
     ORDER BY value DESC NULLS LAST
     LIMIT $2`,
    [days, limit],
  );
}

export interface TickerLeader {
  ticker: string;
  company_name: string;
  buyers: string;
  total_value: string | null;
}

/** Tickers with the most distinct insider buyers in the window. */
export async function mostBoughtTickers(
  days = 7,
  limit = 6,
): Promise<TickerLeader[]> {
  const db = await getDb();
  return db.query<TickerLeader>(
    `WITH buys AS (
       SELECT f.company_cik, f.accession_number,
              SUM(t.shares * t.price_per_share) AS value
       FROM transactions t
       JOIN filings f ON f.accession_number = t.accession_number
       WHERE t.code = 'P' AND t.is_derivative = FALSE
         AND t.transaction_date > CURRENT_DATE - $1 * INTERVAL '1 day'
       GROUP BY f.company_cik, f.accession_number
     )
     SELECT c.ticker, c.name AS company_name, bc.buyers::text, pc.total_value::text
     FROM (SELECT company_cik, SUM(value) AS total_value FROM buys GROUP BY company_cik) pc
     JOIN (SELECT b.company_cik, COUNT(DISTINCT fo.insider_cik) AS buyers
           FROM buys b JOIN filing_owners fo ON fo.accession_number = b.accession_number
           GROUP BY b.company_cik) bc ON bc.company_cik = pc.company_cik
     JOIN companies c ON c.cik = pc.company_cik
     WHERE c.ticker IS NOT NULL
     ORDER BY bc.buyers DESC, pc.total_value DESC NULLS LAST
     LIMIT $2`,
    [days, limit],
  );
}

export interface DailyFlow {
  day: string;
  buy_value: string;
  sell_value: string;
}

/** Daily buy vs sell dollar flow for a company (for the bar chart). */
export async function companyDailyFlow(
  companyCik: string,
  days = 90,
): Promise<DailyFlow[]> {
  const db = await getDb();
  return db.query<DailyFlow>(
    `SELECT t.transaction_date::text AS day,
            COALESCE(SUM(t.shares * t.price_per_share) FILTER (WHERE t.code = 'P'), 0)::text AS buy_value,
            COALESCE(SUM(t.shares * t.price_per_share) FILTER (WHERE t.code = 'S'), 0)::text AS sell_value
     FROM transactions t
     JOIN filings f ON f.accession_number = t.accession_number
     WHERE f.company_cik = $1 AND t.is_derivative = FALSE
       AND t.code IN ('P', 'S')
       AND t.transaction_date > CURRENT_DATE - $2 * INTERVAL '1 day'
     GROUP BY t.transaction_date ORDER BY t.transaction_date`,
    [companyCik, days],
  );
}
