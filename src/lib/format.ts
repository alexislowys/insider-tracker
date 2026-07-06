export function fmtShares(s: string | null): string {
  if (s == null) return "—";
  return Number(s).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtPrice(s: string | null): string {
  if (s == null) return "—";
  return `$${Number(s).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtValue(s: string | null): string {
  const n = s == null ? null : Number(s);
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function roleLabel(row: {
  officer_title: string | null;
  is_director: boolean;
  is_ten_percent_owner: boolean;
}): string {
  if (row.officer_title) return row.officer_title;
  if (row.is_director) return "Director";
  if (row.is_ten_percent_owner) return "10% owner";
  return "Insider";
}

export const CODE_LABELS: Record<string, string> = {
  P: "Buy",
  S: "Sell",
  A: "Grant",
  M: "Exercise",
  F: "Tax",
  G: "Gift",
  D: "Disposition",
  C: "Conversion",
  X: "Exercise",
};
