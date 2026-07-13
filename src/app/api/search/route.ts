import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toUpperCase() ?? "";
  if (q.length < 1) return NextResponse.json([]);

  const db = await getDb();
  const rows = await db.query<{ ticker: string; name: string }>(
    `SELECT ticker, name FROM companies
     WHERE ticker IS NOT NULL
       AND (ticker LIKE $1 || '%' OR UPPER(name) LIKE '%' || $1 || '%')
     ORDER BY (ticker = $1) DESC, LENGTH(ticker)
     LIMIT 8`,
    [q],
  );
  return NextResponse.json(rows);
}
