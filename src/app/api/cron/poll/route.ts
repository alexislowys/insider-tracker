// Near-real-time ingestion: reads EDGAR's current-filings feed and ingests
// any Form 4 not yet in the database. Hit every few minutes by GitHub
// Actions (Vercel Hobby crons are daily-only). Idempotent — overlap with
// the daily self-heal cron is free.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestRefs } from "@/lib/ingest";
import { listCurrentForm4Filings } from "@/lib/edgar/current";
import { dispatchAlerts } from "@/lib/alerts";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  // 1-minute polling means runs overlap; concurrent ingest of the same
  // filing double-inserts transactions, so only one poll runs at a time
  const [lock] = await db.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock(721) AS locked`,
  );
  if (!lock.locked) {
    return NextResponse.json({ skipped: "another ingest holds the lock" });
  }
  try {
    const refs = await listCurrentForm4Filings();
    const stats = await ingestRefs(db, refs);
    const alerts =
      stats.ingested > 0 ? await dispatchAlerts(db) : { sent: 0, pending: 0 };
    return NextResponse.json({ stats, alerts });
  } finally {
    await db.query(`SELECT pg_advisory_unlock(721)`);
  }
}
