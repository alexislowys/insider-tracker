import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDailyCloses } from "@/lib/prices";

export async function GET(req: NextRequest) {
  const tickers = (req.nextUrl.searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z.\-]{1,10}$/.test(t))
    .slice(0, 50);
  if (tickers.length === 0) return NextResponse.json([]);

  const db = await getDb();
  const out = [];
  for (const ticker of tickers) {
    const [company] = await db.query<{ cik: string; name: string }>(
      `SELECT cik, name FROM companies WHERE ticker = $1`,
      [ticker],
    );
    const closes = company ? await getDailyCloses(db, ticker, 8) : [];
    const latest = closes.at(-1)?.close ?? null;
    const prev = closes.at(-2)?.close ?? null;
    const activity = company
      ? await db.query<{ code: string; n: string; last: string }>(
          `SELECT t.code, COUNT(*)::text AS n, MAX(t.transaction_date)::text AS last
           FROM transactions t
           JOIN filings f ON f.accession_number = t.accession_number
           WHERE f.company_cik = $1 AND t.code IN ('P','S') AND t.is_derivative = FALSE
             AND t.transaction_date > CURRENT_DATE - INTERVAL '30 days'
           GROUP BY t.code`,
          [company.cik],
        )
      : [];
    out.push({
      ticker,
      name: company?.name ?? null,
      close: latest,
      changePct:
        latest && prev ? Math.round(((latest - prev) / prev) * 1000) / 10 : null,
      buys30d: Number(activity.find((a) => a.code === "P")?.n ?? 0),
      sells30d: Number(activity.find((a) => a.code === "S")?.n ?? 0),
      lastFiling:
        activity
          .map((a) => a.last.slice(0, 10))
          .sort()
          .at(-1) ?? null,
    });
  }
  return NextResponse.json(out);
}
