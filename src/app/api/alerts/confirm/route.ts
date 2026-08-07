import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { confirmSubscription } from "@/lib/alerts";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  try {
    const db = await getDb();
    const confirmed = await confirmSubscription(db, token);
    return new NextResponse(
      confirmed
        ? "Alerts confirmed. You'll be emailed when a new insider filing lands for this ticker."
        : "Link already used or invalid.",
      { status: confirmed ? 200 : 410, headers: { "Content-Type": "text/plain" } },
    );
  } catch (e) {
    console.error("[alerts] confirm failed:", e instanceof Error ? e.message : e);
    return new NextResponse("Temporarily unavailable — please try the link again shortly.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
