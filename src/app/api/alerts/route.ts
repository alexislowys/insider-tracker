import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { subscribe } from "@/lib/alerts";

export async function POST(req: NextRequest) {
  let body: { email?: string; ticker?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.email || !body.ticker) {
    return NextResponse.json({ error: "email and ticker required" }, { status: 400 });
  }

  const db = await getDb();
  const result = await subscribe(db, body.email, body.ticker);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
