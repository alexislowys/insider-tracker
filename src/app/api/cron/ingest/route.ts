// Daily ingestion endpoint, hit by Vercel Cron (vercel.json). Ingests the
// last 3 days each run so weekend gaps and late filings self-heal —
// idempotent, so overlap is free.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestDay } from "@/lib/ingest";
import { dispatchAlerts } from "@/lib/alerts";
import { warmPriceCoverage } from "@/lib/insights";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const results = [];
  const day = new Date();
  for (let i = 0; i < 3; i++) {
    day.setUTCDate(day.getUTCDate() - 1);
    const stats = await ingestDay(db, day);
    results.push({ day: day.toISOString().slice(0, 10), ...stats });
  }
  const alerts = await dispatchAlerts(db);
  await warmPriceCoverage(db); // keeps /insights and charts fresh
  return NextResponse.json({ results, alerts });
}
