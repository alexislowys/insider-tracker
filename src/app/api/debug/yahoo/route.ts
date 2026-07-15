// Temporary diagnostic: what does Yahoo return from this deployment's IP?

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "AAPL";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
  try {
    const started = Date.now();
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (InsiderTracker)" },
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text();
    return NextResponse.json({
      status: res.status,
      ms: Date.now() - started,
      snippet: body.slice(0, 300),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
