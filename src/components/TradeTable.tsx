import Link from "next/link";
import type { ActivityRow } from "@/lib/queries";
import { CODE_LABELS, fmtPrice, fmtShares, fmtValue, roleLabel } from "@/lib/format";

function CodeBadge({ code }: { code: string }) {
  const label = CODE_LABELS[code] ?? code;
  const color =
    code === "P"
      ? "bg-emerald-500/15 text-emerald-400"
      : code === "S"
        ? "bg-red-500/15 text-red-400"
        : "bg-zinc-500/15 text-zinc-400";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export function TradeTable({
  rows,
  showCompany = true,
  showInsider = true,
}: {
  rows: ActivityRow[];
  showCompany?: boolean;
  showInsider?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">No transactions.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-4">Date</th>
            {showCompany && <th className="py-2 pr-4">Company</th>}
            {showInsider && <th className="py-2 pr-4">Insider</th>}
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4 text-right">Shares</th>
            <th className="py-2 pr-4 text-right">Price</th>
            <th className="py-2 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.accession_number}-${r.insider_cik}-${i}`}
              className="border-b border-zinc-900 hover:bg-zinc-900/50"
            >
              <td className="py-2 pr-4 whitespace-nowrap text-zinc-400">
                {r.transaction_date.slice(0, 10)}
              </td>
              {showCompany && (
                <td className="py-2 pr-4">
                  {r.ticker ? (
                    <Link href={`/company/${r.ticker}`} className="font-medium text-sky-400 hover:underline">
                      {r.ticker}
                    </Link>
                  ) : (
                    <span className="text-zinc-500">{r.company_name.slice(0, 24)}</span>
                  )}
                </td>
              )}
              {showInsider && (
                <td className="py-2 pr-4">
                  <Link href={`/insider/${r.insider_cik}`} className="hover:underline">
                    {r.insider_name}
                  </Link>
                </td>
              )}
              <td className="py-2 pr-4 text-zinc-400">{roleLabel(r)}</td>
              <td className="py-2 pr-4">
                <CodeBadge code={r.code} />
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{fmtShares(r.shares)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(r.price_per_share)}</td>
              <td className="py-2 text-right tabular-nums font-medium">{fmtValue(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
