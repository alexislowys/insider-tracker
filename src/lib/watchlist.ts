"use client";

// localStorage-backed watchlist — no accounts. Exposed as an external store
// so components read it via useSyncExternalStore.

const KEY = "watchlist";
const listeners = new Set<() => void>();

export function subscribeWatchlist(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Raw snapshot (stable string) for useSyncExternalStore. */
export function watchlistSnapshot(): string {
  return localStorage.getItem(KEY) ?? "[]";
}

export function watchlistServerSnapshot(): string {
  return "[]";
}

export function parseWatchlist(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function toggleWatch(ticker: string): void {
  const t = ticker.toUpperCase();
  const list = parseWatchlist(watchlistSnapshot());
  const next = list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
  localStorage.setItem(KEY, JSON.stringify(next.slice(0, 50)));
  listeners.forEach((l) => l());
}
