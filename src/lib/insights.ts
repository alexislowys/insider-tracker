// Outcome statistics: what actually happened after insiders bought.
// Returns are computed against the latest cached close per ticker; coverage
// is warmed for the highest-value tickers first so the page stays fast and
// upstream price requests stay bounded.

import type { Db } from "./db";
import { getDailyCloses } from "./prices";

const WARM_TICKERS = 60;

/** Ensure the top buy tickers have a fresh close cached (≤1 fetch/ticker/day). */
export async function warmPriceCoverage(db: Db): Promise<void> {
  const rows = await db.query<{ ticker: string }>(
    `SELECT c.ticker
     FROM transactions t
     JOIN filings f ON f.accession_number = t.accession_number
     JOIN companies c ON c.cik = f.company_cik
     WHERE t.code = 'P' AND t.is_derivative = FALSE
       AND t.price_per_share > 0 AND c.ticker IS NOT NULL
     GROUP BY c.ticker
     ORDER BY SUM(t.shares * t.price_per_share) DESC NULLS LAST
     LIMIT $1`,
    [WARM_TICKERS],
  );
  for (const r of rows) {
    await getDailyCloses(db, r.ticker, 30); // cache-first; cheap when warm
  }
}

export interface OutcomeStats {
  buys: number;
  tickers: number;
  avgReturnPct: number;
  winRate: number;
}

const OUTCOME_BASE = `
  WITH latest AS (
    SELECT DISTINCT ON (ticker) ticker, close
    FROM prices ORDER BY ticker, date DESC
  ),
  scored AS (
    SELECT c.ticker, i.cik AS insider_cik, i.name AS insider_name,
           fo.is_officer, fo.is_director, fo.is_ten_percent_owner,
           (l.close - t.price_per_share) / t.price_per_share * 100 AS ret
    FROM transactions t
    JOIN filings f ON f.accession_number = t.accession_number
    JOIN companies c ON c.cik = f.company_cik
    JOIN latest l ON l.ticker = c.ticker
    JOIN filing_owners fo ON fo.accession_number = f.accession_number
    JOIN insiders i ON i.cik = fo.insider_cik
    WHERE t.code = 'P' AND t.is_derivative = FALSE AND t.price_per_share > 0
  )`;

export async function overallOutcomes(db: Db): Promise<OutcomeStats | null> {
  const [row] = await db.query<{
    buys: string;
    tickers: string;
    avg_ret: string;
    win_rate: string;
  }>(
    `${OUTCOME_BASE}
     SELECT COUNT(*)::text AS buys, COUNT(DISTINCT ticker)::text AS tickers,
            ROUND(AVG(ret)::numeric, 1)::text AS avg_ret,
            ROUND(AVG(CASE WHEN ret > 0 THEN 1 ELSE 0 END)::numeric, 2)::text AS win_rate
     FROM scored`,
  );
  if (!row || row.buys === "0") return null;
  return {
    buys: Number(row.buys),
    tickers: Number(row.tickers),
    avgReturnPct: Number(row.avg_ret),
    winRate: Number(row.win_rate),
  };
}

export interface RoleOutcome {
  role: string;
  buys: string;
  avg_ret: string;
  win_rate: string;
}

export async function outcomesByRole(db: Db): Promise<RoleOutcome[]> {
  return db.query<RoleOutcome>(
    `${OUTCOME_BASE}
     SELECT role, COUNT(*)::text AS buys,
            ROUND(AVG(ret)::numeric, 1)::text AS avg_ret,
            ROUND(AVG(CASE WHEN ret > 0 THEN 1 ELSE 0 END)::numeric, 2)::text AS win_rate
     FROM (
       SELECT ret,
              CASE WHEN is_officer THEN 'Officers'
                   WHEN is_director THEN 'Directors'
                   WHEN is_ten_percent_owner THEN '10% owners'
                   ELSE 'Other' END AS role
       FROM scored
     ) s
     GROUP BY role
     ORDER BY AVG(ret) DESC`,
  );
}

export interface InsiderLeader {
  insider_cik: string;
  insider_name: string;
  buys: string;
  avg_ret: string;
}

export async function topInsiders(db: Db, limit = 10): Promise<InsiderLeader[]> {
  return db.query<InsiderLeader>(
    `${OUTCOME_BASE}
     SELECT insider_cik, MAX(insider_name) AS insider_name,
            COUNT(*)::text AS buys,
            ROUND(AVG(ret)::numeric, 1)::text AS avg_ret
     FROM scored
     GROUP BY insider_cik
     HAVING COUNT(*) >= 2
     ORDER BY AVG(ret) DESC
     LIMIT $1`,
    [limit],
  );
}
