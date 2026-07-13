import type { DailyClose } from "@/lib/prices";
import type { ActivityRow } from "@/lib/queries";
import { fmtValue } from "@/lib/format";

const W = 900;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

/**
 * Daily close line with insider buy/sell markers. Server-rendered SVG —
 * no chart library. Markers snap to the nearest trading day.
 */
export function PriceChart({
  closes,
  trades,
}: {
  closes: DailyClose[];
  trades: ActivityRow[];
}) {
  if (closes.length < 2) return null;

  const prices = closes.map((c) => c.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (closes.length - 1)) * iw;
  const y = (p: number) => PAD.top + (1 - (p - min) / span) * ih;

  const path = closes
    .map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(c.close).toFixed(1)}`)
    .join("");

  const dateIndex = new Map(closes.map((c, i) => [c.date, i]));
  const nearestIndex = (date: string): number | null => {
    if (dateIndex.has(date)) return dateIndex.get(date)!;
    if (date < closes[0].date || date > closes[closes.length - 1].date) return null;
    for (let d = 1; d <= 5; d++) {
      const before = shiftDate(date, -d);
      if (dateIndex.has(before)) return dateIndex.get(before)!;
    }
    return null;
  };

  const markers = trades
    .filter((t) => t.code === "P" || t.code === "S")
    .map((t) => {
      const i = nearestIndex(t.transaction_date.slice(0, 10));
      if (i == null) return null;
      return {
        cx: x(i),
        cy: y(closes[i].close),
        buy: t.code === "P",
        label: `${t.code === "P" ? "Buy" : "Sell"} ${fmtValue(t.value)} — ${t.insider_name} (${t.transaction_date.slice(0, 10)})`,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const ticks = [min, min + span / 2, max];
  const firstDate = closes[0].date;
  const lastDate = closes[closes.length - 1].date;

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-zinc-400">
        Price with insider trades ({closes.length} trading days)
      </h3>
      <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900/50 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[600px] w-full" role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3 4"
              />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#71717a">
                ${t >= 100 ? t.toFixed(0) : t.toFixed(2)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} fontSize="10" fill="#71717a">{firstDate}</text>
          <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="10" fill="#71717a">{lastDate}</text>
          <path d={path} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
          {markers.map((m, i) => (
            <circle
              key={i} cx={m.cx} cy={m.cy} r="5"
              fill={m.buy ? "#10b981" : "#ef4444"}
              fillOpacity="0.85" stroke="#18181b" strokeWidth="1.5"
            >
              <title>{m.label}</title>
            </circle>
          ))}
        </svg>
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        <span className="text-emerald-400">●</span> insider buy&nbsp;&nbsp;
        <span className="text-red-400">●</span> insider sell — hover markers for detail
      </p>
    </div>
  );
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
