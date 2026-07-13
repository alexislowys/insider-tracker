import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Insider Tracker",
  description:
    "SEC Form 4 insider buys and sells, cluster signals, and executive activity",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                Insider<span className="text-emerald-400">Tracker</span>
              </Link>
              <Link href="/screener" className="text-sm text-zinc-400 hover:text-zinc-100">
                Screener
              </Link>
            </div>
            <SearchBox />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-xs text-zinc-600">
          Data: SEC EDGAR Form 4 filings. Not investment advice.
        </footer>
      </body>
    </html>
  );
}
