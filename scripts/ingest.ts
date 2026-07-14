// Backfill Form 4 filings.
// Run: npx tsx scripts/ingest.ts --days 5 [--limit 100]
//   --days N   how many calendar days back from today
//   --limit N  max filings per day (omit for all)

import { getDb } from "../src/lib/db";
import { ingestDay } from "../src/lib/ingest";

function arg(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
}

async function main() {
  const days = arg("days") ?? 1;
  const limit = arg("limit") ?? Infinity;
  const db = await getDb();

  // Concurrent ingests double-insert transactions — refuse to run in parallel
  const [lock] = await db.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock(721) AS locked`,
  );
  if (!lock.locked) {
    console.error("Another ingest holds the lock — exiting.");
    process.exit(1);
  }

  const day = new Date();
  for (let i = 0; i < days; i++) {
    day.setUTCDate(day.getUTCDate() - 1);
    const label = day.toISOString().slice(0, 10);
    const s = await ingestDay(db, day, limit);
    console.log(
      `${label}: listed ${s.listed}, ingested ${s.ingested}, skipped ${s.skipped}, failed ${s.failed}`,
    );
    for (const e of s.errors) console.log(`  ERR ${e}`);
  }

  const [{ count: filings }] = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM filings`,
  );
  const [{ count: txs }] = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM transactions`,
  );
  console.log(`\nTotals: ${filings} filings, ${txs} transactions`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
