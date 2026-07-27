import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./db";
import {
  addCompany,
  addFiling,
  addInsider,
  addOwner,
  addTransaction,
  createTestDb,
  injectDb,
} from "./db/testing";
import { clusterBuys } from "./queries";

// One shared fixture: five companies exercising each cluster rule.
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  injectDb(db);

  await addInsider(db, "I1", "Ada Lovelace");
  await addInsider(db, "I2", "Grace Hopper");

  // C1: two insiders, two separate filings — a real cluster
  await addCompany(db, "C1", "Cluster Corp", "CL1");
  await addFiling(db, "F1", "C1", { daysAgo: 2 });
  await addOwner(db, "F1", "I1");
  await addTransaction(db, "F1", { shares: 100, price: 10, daysAgo: 2 });
  // derivative row on the same filing must not add to the dollar total
  await addTransaction(db, "F1", { shares: 999, price: 99, daysAgo: 2, derivative: true });
  await addFiling(db, "F2", "C1", { daysAgo: 3 });
  await addOwner(db, "F2", "I2");
  await addTransaction(db, "F2", { shares: 50, price: 20, daysAgo: 3 });

  // C2: one filing listing two co-filers — NOT a cluster (single purchase)
  await addCompany(db, "C2", "CoFiler Corp", "CL2");
  await addFiling(db, "F3", "C2", { daysAgo: 2 });
  await addOwner(db, "F3", "I1");
  await addOwner(db, "F3", "I2");
  await addTransaction(db, "F3", { shares: 100, price: 10, daysAgo: 2 });

  // C3: two filings, same single insider — NOT a cluster
  await addCompany(db, "C3", "Solo Corp", "CL3");
  await addFiling(db, "F4", "C3", { daysAgo: 2 });
  await addOwner(db, "F4", "I1");
  await addTransaction(db, "F4", { daysAgo: 2 });
  await addFiling(db, "F5", "C3", { daysAgo: 4 });
  await addOwner(db, "F5", "I1");
  await addTransaction(db, "F5", { daysAgo: 4 });

  // C4: genuine cluster shape but both filings are 10b5-1 planned trades
  await addCompany(db, "C4", "Planned Corp", "CL4");
  await addFiling(db, "F6", "C4", { daysAgo: 2, is10b51: true });
  await addOwner(db, "F6", "I1");
  await addTransaction(db, "F6", { daysAgo: 2 });
  await addFiling(db, "F7", "C4", { daysAgo: 3, is10b51: true });
  await addOwner(db, "F7", "I2");
  await addTransaction(db, "F7", { daysAgo: 3 });

  // C5: cluster shape but outside the 14-day window
  await addCompany(db, "C5", "Stale Corp", "CL5");
  await addFiling(db, "F8", "C5", { daysAgo: 20 });
  await addOwner(db, "F8", "I1");
  await addTransaction(db, "F8", { daysAgo: 20 });
  await addFiling(db, "F9", "C5", { daysAgo: 21 });
  await addOwner(db, "F9", "I2");
  await addTransaction(db, "F9", { daysAgo: 21 });
});

describe("clusterBuys", () => {
  it("flags only companies with 2+ insiders across 2+ separate filings", async () => {
    const rows = await clusterBuys();
    expect(rows.map((r) => r.ticker)).toEqual(["CL1"]);
    expect(rows[0].buyers).toBe("2");
  });

  it("sums dollar value per filing without co-filer multiplication or derivatives", async () => {
    const [row] = await clusterBuys();
    // F1: 100 × $10, F2: 50 × $20 — derivative row excluded
    expect(Number(row.total_value)).toBe(2000);
  });

  it("widening the window pulls in the stale cluster", async () => {
    const rows = await clusterBuys(30);
    expect(rows.map((r) => r.ticker).sort()).toEqual(["CL1", "CL5"]);
  });
});
