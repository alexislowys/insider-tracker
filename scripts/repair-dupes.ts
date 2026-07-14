// Repair filings whose transactions were double-inserted by concurrent
// ingest runs: refetch the source XML, replace the filing's transactions
// wholesale, and set is_10b5_1 while we have the document.
// Run: npx tsx scripts/repair-dupes.ts

import { getDb } from "../src/lib/db";
import { fetchForm4Xml } from "../src/lib/edgar/daily";
import { parseForm4 } from "../src/lib/edgar/form4";

async function main() {
  const db = await getDb();
  const affected = await db.query<{ accession_number: string; cik: string }>(
    `SELECT DISTINCT t.accession_number, c.cik
     FROM transactions t
     JOIN filings f ON f.accession_number = t.accession_number
     JOIN companies c ON c.cik = f.company_cik
     WHERE (t.accession_number, t.security_title, t.transaction_date, t.code,
            t.shares, t.shares_owned_after, t.direct_ownership) IN (
       SELECT accession_number, security_title, transaction_date, code,
              shares, shares_owned_after, direct_ownership
       FROM transactions
       GROUP BY accession_number, security_title, transaction_date, code,
                shares, shares_owned_after, direct_ownership
       HAVING COUNT(*) > 1
     )`,
  );
  console.log(`${affected.length} filings to repair`);

  let ok = 0;
  let failed = 0;
  for (const a of affected) {
    try {
      const xml = await fetchForm4Xml({
        cik: String(Number(a.cik)),
        accessionNumber: a.accession_number,
        companyName: "",
        dateFiled: "",
      });
      const filing = parseForm4(xml, a.accession_number);
      await db.query(`DELETE FROM transactions WHERE accession_number = $1`, [
        a.accession_number,
      ]);
      for (const tx of filing.transactions) {
        await db.query(
          `INSERT INTO transactions
             (accession_number, security_title, transaction_date, code, shares,
              price_per_share, acquired_disposed, shares_owned_after, is_derivative,
              direct_ownership)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            a.accession_number,
            tx.securityTitle,
            tx.transactionDate,
            tx.transactionCode,
            tx.shares,
            tx.pricePerShare,
            tx.acquiredDisposed,
            tx.sharesOwnedAfter,
            tx.isDerivative,
            tx.directOwnership,
          ],
        );
      }
      await db.query(
        `UPDATE filings SET is_10b5_1 = $1 WHERE accession_number = $2`,
        [filing.is10b51, a.accession_number],
      );
      ok++;
    } catch (e) {
      failed++;
      console.error(`${a.accession_number}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`repaired: ${ok}, failed: ${failed}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
