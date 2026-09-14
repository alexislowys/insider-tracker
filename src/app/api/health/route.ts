import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Freshness probe for external monitoring. The poller soft-fails with 200
// {ok:false} by design, so job status alone can't detect stale data — this
// exposes the data's own age. Filed dates are public EDGAR metadata.
export async function GET() {
  try {
    const db = await getDb();
    const [row] = await db.query<{ newest: string | null }>(
      `SELECT MAX(filed_date)::text AS newest FROM filings`,
    );
    return NextResponse.json({ ok: true, newest_filed_date: row?.newest ?? null });
  } catch (e) {
    console.error("[health]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
