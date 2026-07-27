# Insider Tracker — Engineering Case Study

**Live:** https://insider-tracker-three.vercel.app · **Code:** https://github.com/alexislowys/insider-tracker

A full-stack app that ingests SEC Form 4 insider-trading filings in near-real time and turns them into signals: which executives are buying their own stock, when several buy at once, and whether that buying has historically beaten the market.

**Stack:** Next.js 16 (App Router, RSC, ISR) · PostgreSQL (Neon) · TypeScript · Vercel · GitHub Actions · Vitest.

---

## Why this project

Anyone can build a dashboard over a clean API. I wanted the harder, more realistic problem: a **messy public data source** with real ingestion, parsing, and correctness challenges. SEC EDGAR's Form 4 feed is exactly that — XML filings with inconsistent shapes, rate limits, a 2-day legal reporting lag, and edge cases that only show up at volume. Getting honest signals out of it is a data-engineering problem, not a CRUD app.

## Architecture

```
SEC EDGAR (current + daily index)
        │  rate-limited client, ~1-min polling via GitHub Actions
        ▼
  Form 4 XML parser  ──►  PostgreSQL (companies, insiders, filings, transactions, prices)
        │                        │
        │                        ▼
        │                 Next.js RSC pages (ISR, CDN-cached)
        ▼                        │
  Email alerts (Resend,          ▼
  double opt-in)          Dashboard · Screener · Insights · Watchlist
```

Ingestion is **idempotent** and guarded by a Postgres advisory lock, so overlapping polls and daily self-heal runs never double-insert. Pages use **Incremental Static Regeneration** so a thousand concurrent visitors hit the CDN, not the database.

---

## Three problems worth talking about

### 1. A "cluster buy" that wasn't — the co-filer trap

The headline signal is a *cluster buy*: multiple insiders buying the same stock in a short window, historically a strong bullish sign. My first version counted distinct insiders per company and flagged anything with 2+.

It immediately surfaced a "6-insider, $457K cluster" that was actually **one $76K purchase**. A single Form 4 can be co-filed by six related entities (a fund, its manager, affiliated LLCs), and joining owners before summing both inflated the buyer count *and* multiplied the dollar value by the number of co-filers.

**Fix:** require the buyers to appear across **2+ separate filings**, and aggregate value per filing before summing. Real clusters — independent people independently deciding to buy — survive; co-filing artifacts don't.

### 2. The "+2463% top insider" — why I use median, not mean

The Insights page ranks insiders by track record. The average return per buy came out to **+70%**, which is absurd on its face — one microcap that went 25x drags the whole mean up. Worse, the leaderboard's top insider showed **+2463%**: three buys, all of the same penny stock that mooned.

Two fixes, both about **not letting outliers lie**:
- Report the **median**, not the mean. Median return dropped to a believable ~4%, and the mean is shown only as labeled context.
- Gate the leaderboard: minimum **4 buys across 2+ distinct tickers**, so a single lucky single-name bet can't crown anyone. The top spots became realistic (+5% to +12%).

### 3. Beating the market vs. beating zero — market-adjusted returns

"Insider buys returned +4% median" still isn't honest — a +4% return in a market that rose 6% is *underperformance*. So every buy is now also scored against **SPY over its exact holding period**: buy-date S&P close to today's close, subtracted from the stock's own return.

The result is the number I actually trust: the **median excess return vs the S&P 500**, and the **share of buys that beat the index** (currently ~77%). That's a claim a skeptical reader can respect, because it already accounts for "a rising tide lifts all boats."

---

## Correctness, scale, and safety

- **Tested:** the parser and the signal math are unit-tested against an in-memory Postgres (PGlite), including the exact outlier cases above. CI runs typecheck + lint + tests on every push.
- **Scales:** ISR + CDN caching means database load is roughly constant regardless of traffic; the pooled Neon connection and advisory-locked ingestion keep writes safe.
- **Secure:** parameterized SQL throughout, bearer-authenticated cron endpoints, security headers (HSTS, X-Frame-Options, nosniff), and **double opt-in email alerts** — you can't sign someone else's address up for notifications without them confirming. A dependency DoS advisory in the XML parser (which processes untrusted SEC input) was patched.

## Honest limitations

Returns aren't beta-adjusted beyond the market subtraction, there's no survivorship handling for delistings, and the horizon is fixed rather than event-windowed. This is a **screening tool, not a backtest** — and the README says so. Knowing the difference is part of the point.

---

*Built by Alexis Low. The interesting work here wasn't the framework — it was making a noisy regulatory feed tell the truth.*
