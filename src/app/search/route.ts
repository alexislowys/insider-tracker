import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toUpperCase() ?? "";
  if (!q) return NextResponse.redirect(new URL("/", req.nextUrl));

  let ticker = q; // fall back to the raw query (→ 404 page) if the lookup fails
  try {
    const db = await getDb();
    const rows = await db.query<{ ticker: string }>(
      `SELECT ticker FROM companies
       WHERE ticker IS NOT NULL
         AND (ticker = $1 OR ticker LIKE $1 || '%' OR UPPER(name) LIKE '%' || $1 || '%')
       ORDER BY (ticker = $1) DESC, LENGTH(ticker)
       LIMIT 1`,
      [q],
    );
    if (rows[0]) ticker = rows[0].ticker;
  } catch (e) {
    console.error("[search redirect] failed:", e instanceof Error ? e.message : e);
  }
  return NextResponse.redirect(new URL(`/company/${encodeURIComponent(ticker)}`, req.nextUrl));
}
