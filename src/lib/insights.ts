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
  // SPY is the benchmark for market-adjusted returns; 2y covers old buy dates
  await getDailyCloses(db, "SPY", 730);
  for (const r of rows) {
    await getDailyCloses(db, r.ticker, 30); // cache-first; cheap when warm
  }
}

export interface OutcomeStats {
  buys: number;
  tickers: number;
  medianReturnPct: number; // headline — robust to penny-stock outliers
  medianMktReturnPct: number | null; // vs SPY over same holding period
  avgReturnPct: number; // shown as secondary; skewed by microcap moonshots
  beatMarketRate: number | null; // share of priced buys that beat SPY
  winRate: number; // share of buys positive (raw)
}

// `ret` = raw return since the buy. `mkt_ret` = market-adjusted return: the
// stock's return minus SPY's return over the exact same holding period, i.e.
// how much the insider beat (or lagged) just buying the index. mkt_ret is
// NULL for buys older than the cached SPY history and excluded from its stats.
const OUTCOME_BASE = `
  WITH latest AS (
    SELECT DISTINCT ON (ticker) ticker, close
    FROM prices ORDER BY ticker, date DESC
  ),
  spy_latest AS (
    SELECT close FROM prices WHERE ticker = 'SPY' ORDER BY date DESC LIMIT 1
  ),
  scored AS (
    SELECT c.ticker, i.cik AS insider_cik, i.name AS insider_name,
           fo.is_officer, fo.is_director, fo.is_ten_percent_owner,
           (l.close - t.price_per_share) / t.price_per_share * 100 AS ret,
           CASE WHEN spy_buy.close IS NOT NULL THEN
             ((l.close / t.price_per_share) - (sl.close / spy_buy.close)) * 100
           END AS mkt_ret
    FROM transactions t
    JOIN filings f ON f.accession_number = t.accession_number
    JOIN companies c ON c.cik = f.company_cik
    JOIN latest l ON l.ticker = c.ticker
    JOIN filing_owners fo ON fo.accession_number = f.accession_number
    JOIN insiders i ON i.cik = fo.insider_cik
    CROSS JOIN spy_latest sl
    LEFT JOIN LATERAL (
      SELECT close FROM prices
      WHERE ticker = 'SPY' AND date <= t.transaction_date
      ORDER BY date DESC LIMIT 1
    ) spy_buy ON TRUE
    WHERE t.code = 'P' AND t.is_derivative = FALSE AND t.price_per_share > 0
  )`;

export async function overallOutcomes(db: Db): Promise<OutcomeStats | null> {
  const [row] = await db.query<{
    buys: string;
    tickers: string;
    median_ret: string;
    median_mkt: string | null;
    avg_ret: string;
    beat_mkt: string | null;
    win_rate: string;
  }>(
    `${OUTCOME_BASE}
     SELECT COUNT(*)::text AS buys, COUNT(DISTINCT ticker)::text AS tickers,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ret)::numeric, 1)::text AS median_ret,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mkt_ret)::numeric, 1)::text AS median_mkt,
            ROUND(AVG(ret)::numeric, 1)::text AS avg_ret,
            ROUND(AVG(CASE WHEN mkt_ret > 0 THEN 1 ELSE 0 END) FILTER (WHERE mkt_ret IS NOT NULL)::numeric, 2)::text AS beat_mkt,
            ROUND(AVG(CASE WHEN ret > 0 THEN 1 ELSE 0 END)::numeric, 2)::text AS win_rate
     FROM scored`,
  );
  if (!row || row.buys === "0") return null;
  return {
    buys: Number(row.buys),
    tickers: Number(row.tickers),
    medianReturnPct: Number(row.median_ret),
    medianMktReturnPct: row.median_mkt == null ? null : Number(row.median_mkt),
    avgReturnPct: Number(row.avg_ret),
    beatMarketRate: row.beat_mkt == null ? null : Number(row.beat_mkt),
    winRate: Number(row.win_rate),
  };
}

export interface RoleOutcome {
  role: string;
  buys: string;
  median_ret: string;
  win_rate: string;
}

export async function outcomesByRole(db: Db): Promise<RoleOutcome[]> {
  return db.query<RoleOutcome>(
    `${OUTCOME_BASE}
     SELECT role, COUNT(*)::text AS buys,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ret)::numeric, 1)::text AS median_ret,
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
     ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ret) DESC`,
  );
}

export interface InsiderLeader {
  insider_cik: string;
  insider_name: string;
  buys: string;
  median_ret: string;
}

export async function topInsiders(db: Db, limit = 10): Promise<InsiderLeader[]> {
  // Median + min 3 buys: one penny-stock moonshot can't crown someone with
  // two lucky trades the way an average would
  return db.query<InsiderLeader>(
    `${OUTCOME_BASE}
     SELECT insider_cik, MAX(insider_name) AS insider_name,
            COUNT(*)::text AS buys,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ret)::numeric, 1)::text AS median_ret
     FROM scored
     GROUP BY insider_cik
     HAVING COUNT(*) >= 3
     ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ret) DESC
     LIMIT $1`,
    [limit],
  );
}
