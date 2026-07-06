import Link from "next/link";

export default function CompanyNotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Ticker not found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        No ingested filings for that ticker yet — it may not have recent Form 4
        activity in the backfilled window.
      </p>
      <Link href="/" className="mt-4 inline-block text-sky-400 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
