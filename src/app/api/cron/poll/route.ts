// Near-real-time ingestion: reads EDGAR's current-filings feed and ingests
// any Form 4 not yet in the database. Hit ~every minute by GitHub Actions
// (Vercel Hobby crons are daily-only). Idempotent — overlap with the daily
// self-heal cron is free.
//
// This runs ~1440×/day and is self-healing: a transient failure (Neon cold
// start, an EDGAR 403, a momentary timeout) is fixed by the very next run a
// minute later. So it must NOT surface those as HTTP 5xx — `curl -fsS` in the
// workflow would fail the job and email "all jobs failed" on every blip. We
// catch everything, log it server-side, and return 200 with {ok:false}.
// Genuine persistent breakage shows up as stale data and via the daily cron.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestRefs } from "@/lib/ingest";
import { listCurrentForm4Filings } from "@/lib/edgar/current";
import { dispatchAlerts } from "@/lib/alerts";

export const maxDuration = 300;

const LOCK_KEY = 721;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const db = await getDb();
    // 1-minute polling means runs overlap; concurrent ingest of the same
    // filing double-inserts transactions, so only one poll runs at a time
    const [lock] = await db.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [LOCK_KEY],
    );
    if (!lock?.locked) {
      return NextResponse.json({ ok: true, skipped: "another ingest holds the lock" });
    }
    try {
      const refs = await listCurrentForm4Filings();
      const stats = await ingestRefs(db, refs);
      const alerts =
        stats.ingested > 0 ? await dispatchAlerts(db) : { sent: 0, pending: 0 };
      return NextResponse.json({ ok: true, stats, alerts });
    } finally {
      // Never let unlock (a dead connection) throw out of the handler
      await db
        .query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY])
        .catch((e) => console.error("[poll] unlock failed:", e));
    }
  } catch (e) {
    // Recoverable — the next run self-heals. Soft-fail so we don't spam alarms.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[poll] recoverable failure:", msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}
