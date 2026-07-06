import { notFound } from "next/navigation";
import { insiderActivity, insiderByCik } from "@/lib/queries";
import { TradeTable } from "@/components/TradeTable";

export const dynamic = "force-dynamic";

export default async function InsiderPage({
  params,
}: {
  params: Promise<{ cik: string }>;
}) {
  const { cik } = await params;
  const insider = await insiderByCik(cik);
  if (!insider) notFound();

  const rows = await insiderActivity(cik);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{insider.name}</h1>
        <p className="text-sm text-zinc-500">CIK {insider.cik}</p>
      </div>
      <section>
        <h2 className="mb-4 text-xl font-semibold">Transactions</h2>
        <TradeTable rows={rows} showInsider={false} />
      </section>
    </div>
  );
}
