// Daily ingestion endpoint, hit by Vercel Cron (vercel.json). Ingests the
// last 3 days each run so weekend gaps and late filings self-heal —
// idempotent, so overlap is free. Like the poller, transient failures are
// caught and returned as 200 {ok:false} so a momentary Neon/EDGAR blip does
// not fire a job-failed alarm; the next daily run (and the minute poller)
// self-heal, and errors are logged server-side.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestDay } from "@/lib/ingest";
import { dispatchAlerts } from "@/lib/alerts";
import { warmPriceCoverage } from "@/lib/insights";

export const maxDuration = 300;

const LOCK_KEY = 721;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const db = await getDb();
    // Same lock as the poller — concurrent ingests double-insert transactions
    const [lock] = await db.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [LOCK_KEY],
    );
    if (!lock?.locked) {
      return NextResponse.json({ ok: true, skipped: "another ingest holds the lock" });
    }
    try {
      const results = [];
      const day = new Date();
      for (let i = 0; i < 3; i++) {
        day.setUTCDate(day.getUTCDate() - 1);
        const stats = await ingestDay(db, day);
        results.push({ day: day.toISOString().slice(0, 10), ...stats });
      }
      const alerts = await dispatchAlerts(db);
      await warmPriceCoverage(db); // keeps /insights and charts fresh
      return NextResponse.json({ ok: true, results, alerts });
    } finally {
      await db
        .query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY])
        .catch((e) => console.error("[ingest] unlock failed:", e));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ingest] recoverable failure:", msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}
