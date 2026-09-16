import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "./db";
import { addCompany, createTestDb } from "./db/testing";
import { GLOBAL_CONFIRMATIONS_PER_HOUR, subscribe } from "./alerts";

// Resend is stubbed at fetch level: every call "delivers", and we count them.
let db: Db;
let sent: string[];

beforeAll(async () => {
  db = await createTestDb();
  for (let i = 0; i < 60; i++) await addCompany(db, `C${i}`, `Company ${i}`, `T${i}`);
});

beforeEach(async () => {
  await db.exec(`DELETE FROM alert_subscriptions`);
  sent = [];
  process.env.RESEND_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).to);
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
});

describe("subscribe abuse caps", () => {
  it("re-posting the same pair within an hour sends one confirmation", async () => {
    await subscribe(db, "a@example.com", "T0");
    await subscribe(db, "a@example.com", "T0");
    expect(sent).toEqual(["a@example.com"]);
  });

  it("one address gets at most 3 confirmations per hour across tickers", async () => {
    for (let i = 0; i < 6; i++) await subscribe(db, "victim@example.com", `T${i}`);
    expect(sent).toHaveLength(3);
  });

  it("rotating victim addresses hits the global hourly ceiling", async () => {
    for (let i = 0; i < GLOBAL_CONFIRMATIONS_PER_HOUR + 10; i++) {
      const r = await subscribe(db, `v${i}@example.com`, `T${i}`);
      expect(r.ok).toBe(true); // still 200 — nothing for the attacker to learn
    }
    expect(sent).toHaveLength(GLOBAL_CONFIRMATIONS_PER_HOUR);
  });

  it("rejects an unknown ticker and a malformed email without sending", async () => {
    expect(await subscribe(db, "a@example.com", "NOPE")).toEqual({ ok: false, error: "Unknown ticker" });
    expect(await subscribe(db, "not-an-email", "T0")).toEqual({ ok: false, error: "Invalid email" });
    expect(sent).toEqual([]);
  });
});
