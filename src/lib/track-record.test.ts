import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import { insiderTrackRecord } from "./track-record";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  await addInsider(db, "I1", "Ada Lovelace");
  await addInsider(db, "I2", "Grace Hopper");
  await addCompany(db, "C1", "Tracked Corp", "TTT");
  await addCompany(db, "C2", "Unpriced Corp", "UUU");

  // I1 on TTT: buy at $10 and at $20; latest close $15 → +50% and −25%
  await addFiling(db, "F1", "C1", { daysAgo: 40 });
  await addOwner(db, "F1", "I1");
  await addTransaction(db, "F1", { price: 10, daysAgo: 40 });
  await addFiling(db, "F2", "C1", { daysAgo: 20 });
  await addOwner(db, "F2", "I1");
  await addTransaction(db, "F2", { price: 20, daysAgo: 20 });
  // noise that must not score: a sell, and a footnote-price buy (price NULL)
  await addTransaction(db, "F2", { code: "S", price: 30, daysAgo: 20 });
  await addTransaction(db, "F2", { price: null, daysAgo: 20 });
  await addPrice(db, "TTT", 15);

  // I2's only buy is on a ticker with no cached prices
  await addFiling(db, "F3", "C2", { daysAgo: 20 });
  await addOwner(db, "F3", "I2");
  await addTransaction(db, "F3", { price: 10, daysAgo: 20 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("insiderTrackRecord", () => {
  it("scores open-market buys against the latest cached close", async () => {
    const record = await insiderTrackRecord(db, "I1");
    expect(record.buys.map((b) => b.returnPct).sort((a, b) => a - b)).toEqual([
      -25, 50,
    ]);
    expect(record.avgReturnPct).toBe(12.5);
    expect(record.winRate).toBe(0.5);
  });

  it("skips tickers without price data instead of guessing", async () => {
    // price cache is empty for UUU; the Yahoo fallback must find nothing
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false }) as Response),
    );
    const record = await insiderTrackRecord(db, "I2");
    expect(record.buys).toEqual([]);
    expect(record.avgReturnPct).toBeNull();
    expect(record.winRate).toBeNull();
  });
});
