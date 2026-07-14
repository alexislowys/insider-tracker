// Ingest Form 4 filings for a date range into the database. Idempotent:
// already-ingested filings are skipped, so reruns and crashes are safe.

import type { Db } from "./db";
import { listForm4Filings, fetchForm4Xml, type FilingRef } from "./edgar/daily";
import { parseForm4 } from "./edgar/form4";

export interface IngestStats {
  listed: number;
  ingested: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function ingestDay(
  db: Db,
  day: Date,
  limit = Infinity,
): Promise<IngestStats> {
  const refs = (await listForm4Filings(day)).slice(
    0,
    Number.isFinite(limit) ? limit : undefined,
  );
  return ingestRefs(db, refs);
}

/** Ingest a batch of filing references, skipping ones already in the DB. */
export async function ingestRefs(
  db: Db,
  refs: FilingRef[],
): Promise<IngestStats> {
  const stats: IngestStats = {
    listed: refs.length,
    ingested: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  if (refs.length === 0) return stats;

  // One query to skip everything already ingested (crash-safe reruns)
  const existing = new Set(
    (
      await db.query<{ accession_number: string }>(
        `SELECT accession_number FROM filings WHERE accession_number = ANY($1)`,
        [refs.map((r) => r.accessionNumber)],
      )
    ).map((r) => r.accession_number),
  );

  for (const ref of refs) {
    if (existing.has(ref.accessionNumber)) {
      stats.skipped++;
      continue;
    }
    // Daily index lists multi-filer filings once per filer — dedupe within run
    existing.add(ref.accessionNumber);
    try {
      await ingestFiling(db, ref);
      stats.ingested++;
    } catch (e) {
      stats.failed++;
      stats.errors.push(
        `${ref.accessionNumber}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
  return stats;
}

async function ingestFiling(db: Db, ref: FilingRef): Promise<void> {
  const xml = await fetchForm4Xml(ref);
  const filing = parseForm4(xml, ref.accessionNumber);

  await db.query(
    `INSERT INTO companies (cik, name, ticker) VALUES ($1, $2, $3)
     ON CONFLICT (cik) DO UPDATE SET name = EXCLUDED.name,
       ticker = COALESCE(EXCLUDED.ticker, companies.ticker)`,
    [filing.issuerCik, filing.issuerName, filing.ticker],
  );

  await db.query(
    `INSERT INTO filings (accession_number, company_cik, filed_date, period_of_report, is_10b5_1)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [
      filing.accessionNumber,
      filing.issuerCik,
      ref.dateFiled,
      filing.periodOfReport || null,
      filing.is10b51,
    ],
  );

  for (const owner of filing.owners) {
    await db.query(
      `INSERT INTO insiders (cik, name) VALUES ($1, $2)
       ON CONFLICT (cik) DO UPDATE SET name = EXCLUDED.name`,
      [owner.cik, owner.name],
    );
    await db.query(
      `INSERT INTO filing_owners
         (accession_number, insider_cik, is_director, is_officer, is_ten_percent_owner, officer_title)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [
        filing.accessionNumber,
        owner.cik,
        owner.isDirector,
        owner.isOfficer,
        owner.isTenPercentOwner,
        owner.officerTitle,
      ],
    );
  }

  for (const tx of filing.transactions) {
    await db.query(
      `INSERT INTO transactions
         (accession_number, security_title, transaction_date, code, shares,
          price_per_share, acquired_disposed, shares_owned_after, is_derivative,
          direct_ownership)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        filing.accessionNumber,
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
}
