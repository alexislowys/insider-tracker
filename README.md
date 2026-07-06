# Insider Tracker

Track SEC Form 4 insider buys and sells: cluster-buy signals, per-company flow, and executive activity. Built with Next.js, PostgreSQL, and the SEC EDGAR API.

## Features

- **Cluster-buy detection** — flags companies where 2+ distinct insiders bought within 14 days, historically the strongest insider signal
- **Open-market trade feed** — latest buys (code P) and sells (code S), filtered from the noise of grants and option exercises
- **Company pages** — insider activity timeline plus a 90-day buy/sell dollar-flow chart
- **Insider pages** — full transaction history for any executive or director
- **Self-healing daily ingestion** — Vercel Cron re-ingests a 3-day window each weekday; ingestion is idempotent so overlaps and reruns are free

## Architecture

```
SEC EDGAR daily index ──> Form 4 XML ──> parser ──> PostgreSQL ──> Next.js (RSC)
        (rate-limited client, 8 req/s, retry on 429/503)
```

- `src/lib/edgar/` — EDGAR HTTP client (throttled, SEC-compliant User-Agent), daily-index discovery, Form 4 XML parser
- `src/lib/db/` — schema + database adapter: any Postgres via `DATABASE_URL`, or zero-install [PGlite](https://pglite.dev/) for local dev
- `src/lib/ingest.ts` — idempotent filing ingestion (crash-safe, dedupes multi-filer index entries)
- `src/lib/queries.ts` — read queries for the UI
- `src/app/` — dashboard, `/company/[ticker]`, `/insider/[cik]`, cron endpoint

### Form 4 edge cases handled

- Prices hidden in footnotes (stored as `NULL`, rendered as "footnote")
- Multi-owner filings and duplicate daily-index entries per filer
- Direct vs indirect ownership rows that otherwise look identical
- Missing/`NONE` tickers, weekend/holiday index files (EDGAR 403s), value-wrapped vs inline XML leaves

## Running locally

```bash
npm install
npx tsx scripts/ingest.ts --days 10   # backfill into local PGlite (no DB install needed)
npm run dev
```

Useful scripts:

```bash
npx tsx scripts/test-parser.ts        # parse 50 live filings, print results
npx tsx scripts/ingest.ts --days 5 --limit 100
npx tsx scripts/stats.ts              # row counts + sanity checks
```

## Deploying

1. Create a Postgres database (e.g. [Neon](https://neon.tech)) and set `DATABASE_URL`
2. Set `CRON_SECRET` to protect the ingestion endpoint
3. Deploy to Vercel — `vercel.json` schedules `/api/cron/ingest` weekdays at 22:30 UTC
4. Backfill once from your machine: `DATABASE_URL=... npx tsx scripts/ingest.ts --days 30`

## Data notes

Source: SEC EDGAR Form 4 filings. The client stays under the SEC's 10 req/s limit and identifies itself per SEC policy. Not investment advice.
