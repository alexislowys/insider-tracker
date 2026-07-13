import Link from "next/link";
import { parseFilters, screen, PAGE_SIZE } from "@/lib/screener";
import { TradeTable } from "@/components/TradeTable";

export const dynamic = "force-dynamic";

const selectCls =
  "rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm focus:border-zinc-600 focus:outline-none";

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const f = parseFilters(params);
  const rows = await screen(f);

  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string" && v && k !== "page") p.set(k, v);
    }
    if (page > 1) p.set("page", String(page));
    const s = p.toString();
    return s ? `/screener?${s}` : "/screener";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Screener</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Filter open-market insider trades. Grants and option noise excluded.
        </p>
      </div>

      <form action="/screener" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Type
          <select name="code" defaultValue={f.code ?? ""} className={selectCls}>
            <option value="">Buys + sells</option>
            <option value="P">Buys only</option>
            <option value="S">Sells only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Role
          <select name="role" defaultValue={f.role ?? ""} className={selectCls}>
            <option value="">Any</option>
            <option value="officer">Officers</option>
            <option value="director">Directors</option>
            <option value="ten_percent">10% owners</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Min value
          <select name="minValue" defaultValue={f.minValue ?? ""} className={selectCls}>
            <option value="">Any</option>
            <option value="10000">$10K+</option>
            <option value="100000">$100K+</option>
            <option value="1000000">$1M+</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Window
          <select name="days" defaultValue={f.days ?? ""} className={selectCls}>
            <option value="">All time</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Ticker
          <input
            name="ticker"
            defaultValue={f.ticker ?? ""}
            placeholder="any"
            className={`${selectCls} w-24 placeholder:text-zinc-600`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Sort by
          <select name="sort" defaultValue={f.sort} className={selectCls}>
            <option value="date">Newest</option>
            <option value="value">Biggest value</option>
            <option value="shares">Most shares</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
        >
          Apply
        </button>
      </form>

      <TradeTable rows={rows} />

      <div className="flex items-center justify-between text-sm">
        {f.page && f.page > 1 ? (
          <Link href={qs(f.page - 1)} className="text-sky-400 hover:underline">
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {rows.length === PAGE_SIZE && (
          <Link href={qs((f.page ?? 1) + 1)} className="text-sky-400 hover:underline">
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
