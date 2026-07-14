// One-off: fetch the Form 4 XML for filings whose is_10b5_1 is still NULL
// and fill the flag. Safe to interrupt and rerun — only NULL rows are fetched.
// Run: npx tsx scripts/backfill-10b51.ts [--limit 500]

import { getDb } from "../src/lib/db";
import { fetchForm4Xml } from "../src/lib/edgar/daily";
import { parseForm4 } from "../src/lib/edgar/form4";

function arg(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
}

async function main() {
  const limit = arg("limit") ?? 100000;
  const db = await getDb();
  const rows = await db.query<{ accession_number: string; cik: string }>(
    `SELECT f.accession_number, c.cik
     FROM filings f JOIN companies c ON c.cik = f.company_cik
     WHERE f.is_10b5_1 IS NULL
     ORDER BY f.filed_date DESC
     LIMIT $1`,
    [limit],
  );
  console.log(`${rows.length} filings need the 10b5-1 flag`);

  let done = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const xml = await fetchForm4Xml({
        cik: String(Number(r.cik)), // strip zero-padding for the URL
        accessionNumber: r.accession_number,
        companyName: "",
        dateFiled: "",
      });
      const filing = parseForm4(xml, r.accession_number);
      await db.query(`UPDATE filings SET is_10b5_1 = $1 WHERE accession_number = $2`, [
        filing.is10b51,
        r.accession_number,
      ]);
      done++;
      if (done % 250 === 0) console.log(`${done}/${rows.length}`);
    } catch (e) {
      failed++;
      if (failed <= 5)
        console.error(`${r.accession_number}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`done: ${done}, failed: ${failed}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
