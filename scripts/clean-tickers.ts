// One-off: apply normalizeTicker() to every companies.ticker already in the
// DB, so historical dirty values ("NYSE: KRC", "[NONE]", "(SIRI)", "BFA, BFB")
// get fixed or nulled to match new-ingestion behaviour.
// Run: DATABASE_URL=... npx tsx scripts/clean-tickers.ts

import { getDb } from "../src/lib/db";
import { normalizeTicker } from "../src/lib/edgar/form4";

async function main() {
  const db = await getDb();
  const rows = await db.query<{ cik: string; ticker: string }>(
    `SELECT cik, ticker FROM companies WHERE ticker IS NOT NULL`,
  );

  let fixed = 0;
  let nulled = 0;
  for (const r of rows) {
    const clean = normalizeTicker(r.ticker);
    if (clean === r.ticker) continue;
    await db.query(`UPDATE companies SET ticker = $1 WHERE cik = $2`, [clean, r.cik]);
    if (clean === null) {
      nulled++;
      console.log(`  null  "${r.ticker}"`);
    } else {
      fixed++;
      console.log(`  fix   "${r.ticker}" -> ${clean}`);
    }
  }
  console.log(`\nscanned ${rows.length}, fixed ${fixed}, nulled ${nulled}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
