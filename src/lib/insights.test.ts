import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./db";
import {
  addCompany,
  addFiling,
  addInsider,
  addOwner,
  addPrice,
  addTransaction,
  createTestDb,
} from "./db/testing";
import { outcomesByRole, overallOutcomes, topInsiders } from "./insights";

// Fixture: officer I1 has four buys across four tickers (+100, +10, −50, +20),
// director I2 has two big winners (+400% each) — enough for role stats, not
// enough for the leaderboard's 4-buy / 2-ticker minimum. SPY is held flat so
// market-adjusted returns equal raw returns and the math stays checkable.
let db: Db;

async function buy(
  accession: string,
  companyCik: string,
  insiderCik: string,
  price: number,
  role: { officer?: boolean; director?: boolean },
): Promise<void> {
  await addFiling(db, accession, companyCik, { daysAgo: 30 });
  await addOwner(db, accession, insiderCik, role);
  await addTransaction(db, accession, { price, daysAgo: 30 });
}

beforeAll(async () => {
  db = await createTestDb();
  await addInsider(db, "I1", "Ada Lovelace");
  await addInsider(db, "I2", "Grace Hopper");
  for (const [cik, ticker] of [
    ["C1", "AAA"],
    ["C2", "BBB"],
    ["C3", "CCC"],
    ["C4", "DDD"],
    ["C5", "EEE"],
    ["C6", "FFF"],
  ] as const) {
    await addCompany(db, cik, `${ticker} Corp`, ticker);
  }

  await buy("F1", "C1", "I1", 10, { officer: true }); // AAA: close 20 → +100%
  await buy("F2", "C2", "I1", 10, { officer: true }); // BBB: close 11 → +10%
  await buy("F3", "C3", "I1", 10, { officer: true }); // CCC: close 5  → −50%
  await buy("F6", "C6", "I1", 10, { officer: true }); // FFF: close 12 → +20%
  await buy("F4", "C4", "I2", 10, { director: true }); // DDD: close 50 → +400%
  await buy("F5", "C5", "I2", 10, { director: true }); // EEE: close 50 → +400%

  // AAA gets a stale close too — stats must use the latest one
  await addPrice(db, "AAA", 15, 5);
  await addPrice(db, "AAA", 20);
  await addPrice(db, "BBB", 11);
  await addPrice(db, "CCC", 5);
  await addPrice(db, "DDD", 50);
  await addPrice(db, "EEE", 50);
  await addPrice(db, "FFF", 12);
  // SPY flat at 100 across the buy date and now → market-adjusted == raw
  await addPrice(db, "SPY", 100, 30);
  await addPrice(db, "SPY", 100, 0);
});

describe("overallOutcomes", () => {
  it("computes median (headline), mean, and win rate against latest closes", async () => {
    const stats = await overallOutcomes(db);
    expect(stats).not.toBeNull();
    expect(stats!.buys).toBe(6);
    expect(stats!.tickers).toBe(6);
    // returns: +100, +10, −50, +20, +400, +400 → sorted −50,10,20,100,400,400
    // median = (20+100)/2 = 60, mean = 880/6 = 146.7
    expect(stats!.medianReturnPct).toBe(60);
    expect(stats!.avgReturnPct).toBe(146.7);
    expect(stats!.winRate).toBe(0.83);
    // SPY held flat → market-adjusted equals raw
    expect(stats!.medianMktReturnPct).toBe(60);
    expect(stats!.beatMarketRate).toBe(0.83);
  });
});

describe("topInsiders", () => {
  it("requires 4+ buys across 2+ tickers, ranks by market-adjusted median", async () => {
    const leaders = await topInsiders(db);
    // I2's two +400% trades don't qualify — too few buys/tickers
    expect(leaders.map((l) => l.insider_cik)).toEqual(["I1"]);
    // I1 raw/market-adjusted returns −50,10,20,100 → median (10+20)/2 = 15
    expect(leaders[0].median_ret).toBe("15.0");
    expect(leaders[0].buys).toBe("4");
    expect(leaders[0].tickers).toBe("4");
  });
});

describe("outcomesByRole", () => {
  it("groups by role with per-role medians, best first", async () => {
    const roles = await outcomesByRole(db);
    expect(roles.map((r) => [r.role, r.median_ret])).toEqual([
      ["Directors", "400.0"],
      ["Officers", "15.0"],
    ]);
  });
});
