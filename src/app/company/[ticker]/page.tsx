import { notFound } from "next/navigation";
import { companyActivity, companyByTicker, companyDailyFlow } from "@/lib/queries";
import { fmtValue } from "@/lib/format";
import { TradeTable } from "@/components/TradeTable";

export const dynamic = "force-dynamic";

function FlowChart({
  flow,
}: {
  flow: { day: string; buy_value: string; sell_value: string }[];
}) {
  if (flow.length === 0) return null;
  const max = Math.max(
    ...flow.map((d) => Math.max(Number(d.buy_value), Number(d.sell_value))),
    1,
  );
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-zinc-400">
        Buy vs sell flow (90 days)
      </h3>
      <div className="flex h-32 items-end gap-1 rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
        {flow.map((d) => (
          <div
            key={d.day}
            className="flex flex-1 flex-col items-stretch justify-end gap-px"
            title={`${d.day.slice(0, 10)}: buys ${fmtValue(d.buy_value)}, sells ${fmtValue(d.sell_value)}`}
          >
            <div
              className="rounded-sm bg-emerald-500/80"
              style={{ height: `${(Number(d.buy_value) / max) * 100}%` }}
            />
            <div
              className="rounded-sm bg-red-500/80"
              style={{ height: `${(Number(d.sell_value) / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const company = await companyByTicker(decodeURIComponent(ticker));
  if (!company) notFound();

  const [rows, flow] = await Promise.all([
    companyActivity(company.cik),
    companyDailyFlow(company.cik),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {company.ticker}
          <span className="ml-3 text-base font-normal text-zinc-400">
            {company.name}
          </span>
        </h1>
      </div>
      <FlowChart flow={flow} />
      <section>
        <h2 className="mb-4 text-xl font-semibold">Insider activity</h2>
        <TradeTable rows={rows} showCompany={false} />
      </section>
    </div>
  );
}
