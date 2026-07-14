"use client";

import { useSyncExternalStore } from "react";
import {
  parseWatchlist,
  subscribeWatchlist,
  toggleWatch,
  watchlistServerSnapshot,
  watchlistSnapshot,
} from "@/lib/watchlist";

export function WatchButton({ ticker }: { ticker: string }) {
  const raw = useSyncExternalStore(
    subscribeWatchlist,
    watchlistSnapshot,
    watchlistServerSnapshot,
  );
  const watched = parseWatchlist(raw).includes(ticker.toUpperCase());

  return (
    <button
      onClick={() => toggleWatch(ticker)}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        watched
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
      }`}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
    >
      {watched ? "★ Watching" : "☆ Watch"}
    </button>
  );
}
