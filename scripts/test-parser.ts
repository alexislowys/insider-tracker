// Smoke test: pull ~50 recent Form 4 filings from EDGAR and parse them.
// Run: npx tsx scripts/test-parser.ts

import { listRecentForm4Filings, fetchForm4Xml } from "../src/lib/edgar/daily";
import { parseForm4 } from "../src/lib/edgar/form4";

const TARGET = 50;

async function main() {
  console.log(`Listing up to ${TARGET} recent Form 4 filings...`);
  const refs = await listRecentForm4Filings(TARGET);
  console.log(`Found ${refs.length} filings. Fetching + parsing...\n`);

  let ok = 0;
  let failed = 0;
  let buys = 0;
  let sells = 0;
  let noTicker = 0;
  const errors: string[] = [];

  for (const ref of refs) {
    try {
      const xml = await fetchForm4Xml(ref);
      const filing = parseForm4(xml, ref.accessionNumber);
      ok++;
      if (!filing.ticker) noTicker++;
      for (const tx of filing.transactions) {
        if (tx.transactionCode === "P") buys++;
        if (tx.transactionCode === "S") sells++;
      }
      const owner = filing.owners[0];
      const tx = filing.transactions[0];
      console.log(
        `OK  ${filing.ticker ?? "----"}  ${filing.issuerName.slice(0, 28).padEnd(28)}` +
          `  ${owner?.name.slice(0, 22).padEnd(22) ?? ""}` +
          (tx
            ? `  ${tx.transactionCode} ${tx.shares ?? "?"} @ ${tx.pricePerShare ?? "footnote"}`
            : "  (no transactions)"),
      );
    } catch (e) {
      failed++;
      errors.push(`${ref.accessionNumber}: ${e instanceof Error ? e.message : e}`);
      console.log(`ERR ${ref.accessionNumber} (${ref.companyName})`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Parsed: ${ok}/${refs.length}  Failed: ${failed}`);
  console.log(`Open-market buys (P): ${buys}  Sells (S): ${sells}`);
  console.log(`Filings without ticker: ${noTicker}`);
  if (errors.length) {
    console.log(`\nErrors:`);
    for (const err of errors) console.log(`  ${err}`);
  }
  process.exit(failed > refs.length * 0.1 ? 1 : 0); // >10% failure = red
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
