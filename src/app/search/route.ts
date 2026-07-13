import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toUpperCase() ?? "";
  if (!q) return NextResponse.redirect(new URL("/", req.nextUrl));

  const db = await getDb();
  const rows = await db.query<{ ticker: string }>(
    `SELECT ticker FROM companies
     WHERE ticker IS NOT NULL
       AND (ticker = $1 OR ticker LIKE $1 || '%' OR UPPER(name) LIKE '%' || $1 || '%')
     ORDER BY (ticker = $1) DESC, LENGTH(ticker)
     LIMIT 1`,
    [q],
  );

  const dest = rows[0]
    ? `/company/${encodeURIComponent(rows[0].ticker)}`
    : `/company/${encodeURIComponent(q)}`; // falls through to the 404 page
  return NextResponse.redirect(new URL(dest, req.nextUrl));
}
