import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { unsubscribe } from "@/lib/alerts";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const db = await getDb();
  const removed = await unsubscribe(db, token);
  return new NextResponse(
    removed ? "Unsubscribed. You'll get no more alerts for this ticker." : "Link already used or invalid.",
    { status: removed ? 200 : 410, headers: { "Content-Type": "text/plain" } },
  );
}
