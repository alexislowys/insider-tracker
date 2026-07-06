import Link from "next/link";
import { clusterBuys, recentTrades } from "@/lib/queries";
import { fmtValue } from "@/lib/format";
import { TradeTable } from "@/components/TradeTable";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [clusters, trades] = await Promise.all([
    clusterBuys(14),
    recentTrades(50),
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

      <section>
        <h2 className="mb-4 text-xl font-semibold">Latest open-market trades</h2>
        <TradeTable rows={trades} />
      </section>
    </div>
  );
}
