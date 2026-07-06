// Discover Form 4 filings via EDGAR daily form index files.
// https://www.sec.gov/Archives/edgar/daily-index/{year}/QTR{q}/form.{yyyymmdd}.idx

import { edgarFetch, edgarJson, edgarText } from "./client";

export interface FilingRef {
  cik: string; // numeric string, no padding
  companyName: string;
  dateFiled: string; // YYYY-MM-DD
  accessionNumber: string; // with dashes: 0001234567-26-000123
}

function quarter(month: number): number {
  return Math.floor(month / 3) + 1;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** List Form 4 filings for one day. Returns [] on weekends/holidays (404). */
export async function listForm4Filings(day: Date): Promise<FilingRef[]> {
  const y = day.getUTCFullYear();
  const q = quarter(day.getUTCMonth());
  const url = `https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${q}/form.${fmt(day)}.idx`;

  let body: string;
  try {
    body = await edgarText(url);
  } catch (e) {
    // EDGAR answers 403 (not 404) for weekend/holiday index files that don't exist
    if (e instanceof Error && /EDGAR (403|404)/.test(e.message)) return [];
    throw e;
  }

  const refs: FilingRef[] = [];
  for (const line of body.split("\n")) {
    // Fixed-width columns: Form Type | Company Name | CIK | Date Filed | File Name
    if (!/^4\s/.test(line)) continue; // exactly form "4", excludes 4/A, 424B5 etc.
    const m = line.match(
      /^4\s+(.+?)\s+(\d+)\s+(\d{4}-?\d{2}-?\d{2})\s+(edgar\/data\/\d+\/(\S+)\.txt)/,
    );
    if (!m) continue;
    const dateFiled = m[3].includes("-")
      ? m[3]
      : `${m[3].slice(0, 4)}-${m[3].slice(4, 6)}-${m[3].slice(6, 8)}`;
    refs.push({
      companyName: m[1].trim(),
      cik: m[2],
      dateFiled,
      accessionNumber: m[5],
    });
  }
  return refs;
}

/** List Form 4 filings across the most recent N business days that have data. */
export async function listRecentForm4Filings(
  maxFilings: number,
  lookbackDays = 10,
): Promise<FilingRef[]> {
  const out: FilingRef[] = [];
  const day = new Date();
  for (let i = 0; i < lookbackDays && out.length < maxFilings; i++) {
    day.setUTCDate(day.getUTCDate() - 1);
    const refs = await listForm4Filings(day);
    out.push(...refs);
  }
  return out.slice(0, maxFilings);
}

interface FilingIndex {
  directory: { item: { name: string }[] };
}

/** Fetch the ownership-document XML for a filing. */
export async function fetchForm4Xml(ref: FilingRef): Promise<string> {
  const accNoDashes = ref.accessionNumber.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${ref.cik}/${accNoDashes}`;
  const index = await edgarJson<FilingIndex>(`${base}/index.json`);
  const files = index.directory.item.map((i) => i.name);
  const xml =
    files.find((f) => /form4/i.test(f) && f.endsWith(".xml")) ??
    files.find((f) => f === "primary_doc.xml") ??
    files.find((f) => f.endsWith(".xml"));
  if (!xml) throw new Error(`No XML in filing ${ref.accessionNumber}`);
  const res = await edgarFetch(`${base}/${xml}`);
  return res.text();
}
