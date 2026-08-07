import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toUpperCase() ?? "";
  if (q.length < 1) return NextResponse.json([]);

  try {
    const db = await getDb();
    const rows = await db.query<{ ticker: string; name: string }>(
      `SELECT ticker, name FROM companies
       WHERE ticker IS NOT NULL
         AND (ticker LIKE $1 || '%' OR UPPER(name) LIKE '%' || $1 || '%')
       ORDER BY (ticker = $1) DESC, LENGTH(ticker)
       LIMIT 8`,
      [q],
    );
    return NextResponse.json(rows, {
      // Same-prefix searches from many users share one CDN-cached response
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (e) {
    console.error("[search] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json([]); // autocomplete degrades silently to no suggestions
  }
}
