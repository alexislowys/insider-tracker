import Link from "next/link";
import { getDb } from "@/lib/db";
import { outcomesByRole, overallOutcomes, topInsiders } from "@/lib/insights";

export const revalidate = 300;

function pct(s: string): string {
  const n = Number(s);
  return `${n > 0 ? "+" : ""}${n}%`;
}

function tone(s: string): string {
  return Number(s) >= 0 ? "text-emerald-400" : "text-red-400";
}

export default async function InsightsPage() {
  // Prices are warmed by the daily cron; this page reads the cache only
  const db = await getDb();
  const [overall, roles, leaders] = await Promise.all([
    overallOutcomes(db),
    outcomesByRole(db),
    topInsiders(db, 10),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="mt-1 text-sm text-zinc-500">
          What actually happened after insiders bought — returns measured from
          purchase price to latest close. The base rates screeners don&apos;t show.
        </p>
      </div>

      {overall ? (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Median return</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${overall.medianReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {overall.medianReturnPct > 0 ? "+" : ""}
                {overall.medianReturnPct}%
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">vs S&amp;P 500</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${(overall.medianMktReturnPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {overall.medianMktReturnPct == null
                  ? "—"
                  : `${overall.medianMktReturnPct > 0 ? "+" : ""}${overall.medianMktReturnPct}%`}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Beat the market</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {overall.beatMarketRate == null
                  ? "—"
                  : `${Math.round(overall.beatMarketRate * 100)}%`}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Win rate</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {Math.round(overall.winRate * 100)}%
              </p>
            </div>
          </section>
          <p className="text-xs text-zinc-600">
            {overall.buys} buys across {overall.tickers} tickers.{" "}
            <span className="text-zinc-500">vs S&amp;P 500</span> subtracts the
            index&apos;s return over each buy&apos;s exact holding period — the
            honest test of whether insider buying beats just owning the market.
            Median used throughout (mean is {overall.avgReturnPct > 0 ? "+" : ""}
            {overall.avgReturnPct}%, skewed by microcap moonshots).
          </p>
        </>
      ) : (
        <p className="text-sm text-zinc-500">Not enough priced buys yet.</p>
      )}

      <section>
        <h2 className="mb-4 text-xl font-semibold">Returns by role</h2>
        <div className="overflow-x-auto">
          <table className="w-full max-w-xl text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4 text-right">Buys</th>
                <th className="py-2 pr-4 text-right">Median return</th>
                <th className="py-2 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.role} className="border-b border-zinc-900">
                  <td className="py-2 pr-4">{r.role}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.buys}</td>
                  <td className={`py-2 pr-4 text-right font-medium tabular-nums ${tone(r.median_ret)}`}>
                    {pct(r.median_ret)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {Math.round(Number(r.win_rate) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">Best insiders to follow</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Ranked by median return vs the S&amp;P 500, minimum 4 buys across 2+
          tickers — so one lucky single-stock bet can&apos;t top the list.
        </p>
        <ol className="max-w-xl space-y-2">
          {leaders.map((l, i) => (
            <li key={l.insider_cik}>
              <Link
                href={`/insider/${l.insider_cik}`}
                className="flex items-baseline justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 hover:border-zinc-600"
              >
                <span>
                  <span className="mr-2 text-xs text-zinc-600">#{i + 1}</span>
                  {l.insider_name}
                  <span className="ml-2 text-xs text-zinc-500">
                    {l.buys} buys · {l.tickers} tickers
                  </span>
                </span>
                <span className={`font-medium tabular-nums ${tone(l.median_ret)}`}>
                  {pct(l.median_ret)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
