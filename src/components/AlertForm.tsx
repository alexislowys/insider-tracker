"use client";

import { useState } from "react";

export function AlertForm({ ticker }: { ticker: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ticker }),
    });
    if (res.ok) {
      setState("done");
      setMessage(`Check your email to confirm alerts for ${ticker}.`);
    } else {
      setState("error");
      setMessage((await res.json()).error ?? "Something went wrong");
    }
  }

  if (state === "done") {
    return <p className="text-sm text-emerald-400">{message}</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-52 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === "busy"}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        {state === "busy" ? "..." : `Alert me on ${ticker} filings`}
      </button>
      {state === "error" && <span className="text-sm text-red-400">{message}</span>}
    </form>
  );
}
