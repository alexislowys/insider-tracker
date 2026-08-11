import type { Metadata } from "next";

// The watchlist page itself is a client component and can't export metadata,
// so its title lives here.
export const metadata: Metadata = {
  title: "Watchlist",
  description: "Your watched tickers — latest price and recent insider activity.",
};

export default function WatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
