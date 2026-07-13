// Near-real-time discovery via EDGAR's "current filings" Atom feed, which
// updates continuously during EDGAR business hours. The type= param is a
// prefix match (4 also returns 425, 424B5...), so we filter on the exact
// category term. One filing can appear once per associated entity — dedupe
// by accession number.

import { edgarText } from "./client";
import type { FilingRef } from "./daily";

const FEED_URL =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&output=atom";

export async function listCurrentForm4Filings(): Promise<FilingRef[]> {
  const xml = await edgarText(FEED_URL);
  const seen = new Set<string>();
  const refs: FilingRef[] = [];

  for (const entry of xml.split("<entry>").slice(1)) {
    const term = entry.match(/term="([^"]+)"/)?.[1];
    if (term !== "4") continue;

    const href = entry.match(
      /href="https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/\d+\/([\d-]+)-index\.htm"/,
    );
    const filed = entry.match(/Filed:<\/b>\s*(\d{4}-\d{2}-\d{2})/) ??
      entry.match(/Filed:&lt;\/b&gt;\s*(\d{4}-\d{2}-\d{2})/);
    const title = entry.match(/<title>4 - (.+?) \(\d+\)/)?.[1];
    if (!href || !filed) continue;

    const accessionNumber = href[2];
    if (seen.has(accessionNumber)) continue;
    seen.add(accessionNumber);

    refs.push({
      cik: href[1],
      companyName: title ?? "Unknown",
      dateFiled: filed[1],
      accessionNumber,
    });
  }
  return refs;
}
