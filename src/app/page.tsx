import Link from "next/link";
import { clusterBuys, mostBoughtTickers, recentTrades, topBuys } from "@/lib/queries";
import { fmtValue } from "@/lib/format";
import { TradeTable } from "@/components/TradeTable";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [clusters, trades, biggest, hottest] = await Promise.all([
    clusterBuys(14),
    recentTrades(50),
    topBuys(7, 10),
    mostBoughtTickers(7, 6),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-1 text-xl font-semibold">Cluster buys</h2>
        <p className="mb-4 text-sm text-zinc-500">
          2+ insiders bought the same stock within 14 days — historically the
          strongest insider signal.
        </p>
        {clusters.length === 0 ? (
          <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
            No cluster buys in the ingested window yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.map((c) => (
              <Link
                key={c.company_cik}
                href={c.ticker ? `/company/${c.ticker}` : "#"}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-600"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-sky-400">
                    {c.ticker ?? "—"}
                  </span>
                  <span className="text-xs text-zinc-500">{c.latest_date.slice(0, 10)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-zinc-400">{c.company_name}</p>
                <p className="mt-2 text-sm">
                  <span className="font-medium text-emerald-400">{c.buyers} buyers</span>
                  <span className="text-zinc-500"> · {fmtValue(c.total_value)}</span>
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-1 text-xl font-semibold">Biggest buys — 7 days</h2>
          <p className="mb-4 text-sm text-zinc-500">Largest single open-market purchases.</p>
          <TradeTable rows={biggest} showInsider={false} />
        </section>
        <section>
          <h2 className="mb-1 text-xl font-semibold">Most bought — 7 days</h2>
          <p className="mb-4 text-sm text-zinc-500">Tickers with most distinct insider buyers.</p>
          <ol className="space-y-2">
            {hottest.map((h, i) => (
              <li key={h.ticker}>
                <Link
                  href={`/company/${h.ticker}`}
                  className="flex items-baseline justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 hover:border-zinc-600"
                >
                  <span>
                    <span className="mr-2 text-xs text-zinc-600">#{i + 1}</span>
                    <span className="font-medium text-sky-400">{h.ticker}</span>
                    <span className="ml-2 hidden text-sm text-zinc-500 sm:inline">
                      {h.company_name.slice(0, 28)}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="text-emerald-400">{h.buyers} buyers</span>
                    <span className="text-zinc-500"> · {fmtValue(h.total_value)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Latest open-market trades</h2>
        <TradeTable rows={trades} />
      </section>
    </div>
  );
}
