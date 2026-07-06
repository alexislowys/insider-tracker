// Quick DB sanity check. Run: npx tsx scripts/stats.ts

import { getDb } from "../src/lib/db";

async function main() {
  const db = await getDb();

  const dupes = await db.query(
    `SELECT accession_number FROM transactions
     GROUP BY accession_number, security_title, transaction_date, code, shares
     HAVING COUNT(*) > 1`,
  );
  console.log(`duplicate transaction rows: ${dupes.length}`);

  const sells = await db.query(
    `SELECT c.ticker, i.name, fo.officer_title, t.code, t.shares, t.price_per_share
     FROM transactions t
     JOIN filings f ON f.accession_number = t.accession_number
     JOIN companies c ON c.cik = f.company_cik
     JOIN filing_owners fo ON fo.accession_number = f.accession_number
     JOIN insiders i ON i.cik = fo.insider_cik
     WHERE t.code = 'S'
     ORDER BY t.shares DESC NULLS LAST
     LIMIT 5`,
  );
  console.table(sells);

  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
