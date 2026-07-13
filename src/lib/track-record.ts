// Insider track record: for each past open-market buy, the stock's return
// from purchase price to latest close. Prices come from the cached daily
// closes; tickers without price data are skipped rather than guessed.

import type { Db } from "./db";
import { getDailyCloses } from "./prices";

export interface ScoredBuy {
  ticker: string;
  transaction_date: string;
  pricePaid: number;
  latestClose: number;
  returnPct: number; // e.g. 12.4 = +12.4%
}

export interface TrackRecord {
  buys: ScoredBuy[];
  avgReturnPct: number | null;
  winRate: number | null; // fraction of buys currently positive
}

export async function insiderTrackRecord(
  db: Db,
  insiderCik: string,
  maxTickers = 8,
): Promise<TrackRecord> {
  const buys = await db.query<{
    ticker: string;
    transaction_date: string;
    price: string;
  }>(
    `SELECT c.ticker, t.transaction_date::text, t.price_per_share::text AS price
     FROM transactions t
     JOIN filings f ON f.accession_number = t.accession_number
     JOIN companies c ON c.cik = f.company_cik
     JOIN filing_owners fo ON fo.accession_number = f.accession_number
     WHERE fo.insider_cik = $1 AND t.code = 'P' AND t.is_derivative = FALSE
       AND t.price_per_share > 0 AND c.ticker IS NOT NULL
     ORDER BY t.transaction_date DESC
     LIMIT 25`,
    [insiderCik],
  );

  // One price fetch per distinct ticker, capped to keep the page fast
  const tickers = [...new Set(buys.map((b) => b.ticker))].slice(0, maxTickers);
  const latest = new Map<string, number>();
  for (const ticker of tickers) {
    const closes = await getDailyCloses(db, ticker, 370);
    if (closes.length > 0) latest.set(ticker, closes[closes.length - 1].close);
  }

  const scored: ScoredBuy[] = [];
  for (const b of buys) {
    const close = latest.get(b.ticker);
    const paid = Number(b.price);
    if (!close || !Number.isFinite(paid) || paid <= 0) continue;
    scored.push({
      ticker: b.ticker,
      transaction_date: b.transaction_date.slice(0, 10),
      pricePaid: paid,
      latestClose: close,
      returnPct: Math.round(((close - paid) / paid) * 1000) / 10,
    });
  }

  if (scored.length === 0) return { buys: [], avgReturnPct: null, winRate: null };
  const avg = scored.reduce((s, b) => s + b.returnPct, 0) / scored.length;
  const wins = scored.filter((b) => b.returnPct > 0).length;
  return {
    buys: scored,
    avgReturnPct: Math.round(avg * 10) / 10,
    winRate: Math.round((wins / scored.length) * 100) / 100,
  };
}
