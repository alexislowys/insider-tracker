"use client";

import { useEffect, useRef, useState } from "react";

/** Ticker search with autocomplete via native datalist. */
export function SearchBox() {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<{ ticker: string; name: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const query = q.trim();
      if (query.length < 1) {
        setOptions([]);
        return;
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) setOptions(await res.json());
    }, 150);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <form action="/search" className="flex items-center gap-2">
      <input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        list="ticker-options"
        placeholder="Ticker or company"
        autoComplete="off"
        className="w-40 sm:w-48 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      <datalist id="ticker-options">
        {options.map((o) => (
          <option key={o.ticker} value={o.ticker}>
            {o.name.slice(0, 40)}
          </option>
        ))}
      </datalist>
      <button
        type="submit"
        className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
      >
        Go
      </button>
    </form>
  );
}
