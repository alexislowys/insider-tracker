import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toUpperCase() ?? "";
  const dest = q ? `/company/${encodeURIComponent(q)}` : "/";
  return NextResponse.redirect(new URL(dest, req.nextUrl));
}
