"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  parseWatchlist,
  subscribeWatchlist,
  watchlistServerSnapshot,
  watchlistSnapshot,
} from "@/lib/watchlist";

interface Row {
  ticker: string;
  name: string | null;
  close: number | null;
  changePct: number | null;
  buys30d: number;
  sells30d: number;
  lastFiling: string | null;
}

export default function WatchlistPage() {
  const raw = useSyncExternalStore(
    subscribeWatchlist,
    watchlistSnapshot,
    watchlistServerSnapshot,
  );
  const tickers = parseWatchlist(raw);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;
    fetch(`/api/watchlist?tickers=${tickers.join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Watchlist</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stored in your browser — no account. Add tickers with the ☆ Watch
          button on any company page.
        </p>
      </div>

      {tickers.length === 0 || (rows !== null && rows.length === 0) ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
          Nothing watched yet.{" "}
          <Link href="/" className="text-sky-400 hover:underline">
            Find a company
          </Link>{" "}
          and hit ☆ Watch.
        </p>
      ) : rows === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-4">Ticker</th>
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4 text-right">Price</th>
                <th className="py-2 pr-4 text-right">1d</th>
                <th className="py-2 pr-4 text-right">Buys 30d</th>
                <th className="py-2 pr-4 text-right">Sells 30d</th>
                <th className="py-2 text-right">Last filing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="py-2 pr-4">
                    <Link href={`/company/${r.ticker}`} className="font-medium text-sky-400 hover:underline">
                      {r.ticker}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-zinc-400">{r.name ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {r.close ? `$${r.close.toFixed(2)}` : "—"}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right tabular-nums ${
                      r.changePct == null
                        ? "text-zinc-500"
                        : r.changePct >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                    }`}
                  >
                    {r.changePct == null ? "—" : `${r.changePct > 0 ? "+" : ""}${r.changePct}%`}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-emerald-400">{r.buys30d}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-red-400">{r.sells30d}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-400">{r.lastFiling ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
