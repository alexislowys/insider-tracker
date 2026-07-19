import { notFound } from "next/navigation";
import { companyActivity, companyByTicker } from "@/lib/queries";
import { TradeTable } from "@/components/TradeTable";
import { AlertForm } from "@/components/AlertForm";
import { WatchButton } from "@/components/WatchButton";
import { PriceChart } from "@/components/PriceChart";
import { getDb } from "@/lib/db";
import { getDailyCloses } from "@/lib/prices";

export const revalidate = 120;

// Empty list + dynamicParams (default true) = on-demand ISR: each ticker
// renders on first visit, then the CDN serves it for the revalidate window
export function generateStaticParams() {
  return [];
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const company = await companyByTicker(decodeURIComponent(ticker));
  if (!company) notFound();

  const db = await getDb();
  const [rows, closes] = await Promise.all([
    companyActivity(company.cik),
    getDailyCloses(db, company.ticker),
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <WatchButton ticker={company.ticker} />
          <AlertForm ticker={company.ticker} />
        </div>
      </div>
      <PriceChart closes={closes} trades={rows} />
      <section>
        <h2 className="mb-4 text-xl font-semibold">Insider activity</h2>
        <TradeTable rows={rows} showCompany={false} />
      </section>
    </div>
  );
}
