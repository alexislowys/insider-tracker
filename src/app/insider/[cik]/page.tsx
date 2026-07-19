import Link from "next/link";
import { notFound } from "next/navigation";
import { insiderActivity, insiderByCik } from "@/lib/queries";
import { insiderTrackRecord } from "@/lib/track-record";
import { getDb } from "@/lib/db";
import { TradeTable } from "@/components/TradeTable";

export const revalidate = 120;

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export default async function InsiderPage({
  params,
}: {
  params: Promise<{ cik: string }>;
}) {
  const { cik } = await params;
  const insider = await insiderByCik(cik);
  if (!insider) notFound();

  const db = await getDb();
  const [rows, record] = await Promise.all([
    insiderActivity(cik),
    insiderTrackRecord(db, cik),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{insider.name}</h1>
        <p className="text-sm text-zinc-500">CIK {insider.cik}</p>
      </div>

      {record.buys.length > 0 && (
        <section>
          <h2 className="mb-1 text-xl font-semibold">Buy track record</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Stock performance since each of this insider&apos;s open-market buys
            (purchase price vs latest close).
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <Stat
              label="Avg return per buy"
              value={`${record.avgReturnPct! > 0 ? "+" : ""}${record.avgReturnPct}%`}
              tone={record.avgReturnPct! >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <Stat
              label="Win rate"
              value={`${Math.round(record.winRate! * 100)}%`}
              tone={record.winRate! >= 0.5 ? "text-emerald-400" : "text-red-400"}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">Bought</th>
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4 text-right">Paid</th>
                  <th className="py-2 pr-4 text-right">Now</th>
                  <th className="py-2 text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {record.buys.map((b, i) => (
                  <tr key={i} className="border-b border-zinc-900">
                    <td className="py-2 pr-4 text-zinc-400">{b.transaction_date}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/company/${b.ticker}`} className="text-sky-400 hover:underline">
                        {b.ticker}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">${b.pricePaid.toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">${b.latestClose.toFixed(2)}</td>
                    <td
                      className={`py-2 text-right font-medium tabular-nums ${
                        b.returnPct >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {b.returnPct > 0 ? "+" : ""}
                      {b.returnPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-semibold">Transactions</h2>
        <TradeTable rows={rows} showInsider={false} />
      </section>
    </div>
  );
}
