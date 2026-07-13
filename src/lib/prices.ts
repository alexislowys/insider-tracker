// Daily closing prices via Yahoo's chart API (free, no key), cached in the
// prices table. Refetched only when the cache is stale (>1 day old), so each
// ticker costs at most one upstream request per day.

import type { Db } from "./db";

export interface DailyClose {
  date: string; // YYYY-MM-DD
  close: number;
}

interface YahooChart {
  chart: {
    result?: {
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

async function fetchFromYahoo(ticker: string, range: string): Promise<DailyClose[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker,
  )}?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (InsiderTracker)" },
  });
  if (!res.ok) return []; // unknown/delisted ticker — chart just won't render
  const data = (await res.json()) as YahooChart;
  const result = data.chart.result?.[0];
  if (!result?.timestamp) return [];

  const closes = result.indicators.quote[0]?.close ?? [];
  const out: DailyClose[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    out.push({
      date: new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10),
      close: Math.round(c * 10000) / 10000,
    });
  }
  return out;
}

/** Daily closes for the last ~N days, cache-first. */
export async function getDailyCloses(
  db: Db,
  ticker: string,
  days = 180,
): Promise<DailyClose[]> {
  const t = ticker.toUpperCase();
  const cached = await db.query<{ date: string; close: string; latest: string }>(
    `SELECT date::text, close::text,
            MAX(date::text) OVER () AS latest
     FROM prices WHERE ticker = $1 AND date > CURRENT_DATE - $2 * INTERVAL '1 day'
     ORDER BY date`,
    [t, days],
  );

  const staleBefore = new Date(Date.now() - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  if (cached.length > 0 && cached[0].latest >= staleBefore) {
    return cached.map((r) => ({ date: r.date.slice(0, 10), close: Number(r.close) }));
  }

  const range = days <= 190 ? "6mo" : "2y";
  const fresh = await fetchFromYahoo(t, range);
  for (const p of fresh) {
    await db.query(
      `INSERT INTO prices (ticker, date, close) VALUES ($1, $2, $3)
       ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close`,
      [t, p.date, p.close],
    );
  }
  if (fresh.length === 0 && cached.length > 0) {
    // Yahoo down or ticker delisted — serve stale cache over nothing
    return cached.map((r) => ({ date: r.date.slice(0, 10), close: Number(r.close) }));
  }
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return fresh.filter((p) => p.date >= cutoff);
}
