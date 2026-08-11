// Form 4 (ownershipDocument) XML parser.
// Handles: single vs multiple reporting owners, non-derivative and derivative
// tables, missing tickers, footnote-only prices (parsed as null).

import { XMLParser } from "fast-xml-parser";

export interface Form4Transaction {
  securityTitle: string;
  transactionDate: string; // YYYY-MM-DD
  transactionCode: string; // P=purchase, S=sale, A=grant, M=option exercise, ...
  shares: number | null;
  pricePerShare: number | null; // null when price lives in a footnote
  acquiredDisposed: "A" | "D";
  sharesOwnedAfter: number | null;
  isDerivative: boolean;
  directOwnership: boolean; // false = indirect (trust, LLC, spouse...)
}

export interface Form4Owner {
  cik: string;
  name: string;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
}

export interface Form4Filing {
  accessionNumber: string;
  issuerCik: string;
  issuerName: string;
  ticker: string | null;
  periodOfReport: string;
  /** Rule 10b5-1 checkbox: trade executed under a pre-arranged plan */
  is10b51: boolean;
  owners: Form4Owner[];
  transactions: Form4Transaction[];
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep everything as strings; we coerce explicitly
  isArray: (name) =>
    [
      "reportingOwner",
      "nonDerivativeTransaction",
      "derivativeTransaction",
      "nonDerivativeHolding",
      "derivativeHolding",
    ].includes(name),
});

// EDGAR wraps most leaf values as <tag><value>x</value></tag>, but some
// filings inline them. Accept both.
function val(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "object") {
    const v = (node as Record<string, unknown>).value;
    return v == null ? null : String(v);
  }
  const s = String(node).trim();
  return s === "" ? null : s;
}

function num(node: unknown): number | null {
  const s = val(node);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bool(node: unknown): boolean {
  const s = val(node);
  return s === "1" || s === "true";
}

function parseTransaction(
  tx: Record<string, unknown>,
  isDerivative: boolean,
): Form4Transaction | null {
  const amounts = tx.transactionAmounts as Record<string, unknown> | undefined;
  const coding = tx.transactionCoding as Record<string, unknown> | undefined;
  const post = tx.postTransactionAmounts as Record<string, unknown> | undefined;

  const code = val(coding?.transactionCode);
  const date = val((tx.transactionDate as Record<string, unknown>)?.value ?? tx.transactionDate);
  if (!code || !date) return null; // holdings rows / malformed entries

  const ad = val(amounts?.transactionAcquiredDisposedCode);
  const nature = tx.ownershipNature as Record<string, unknown> | undefined;
  return {
    securityTitle: val(tx.securityTitle) ?? "Unknown",
    transactionDate: date.slice(0, 10),
    transactionCode: code,
    shares: num(amounts?.transactionShares),
    pricePerShare: num(amounts?.transactionPricePerShare),
    acquiredDisposed: ad === "D" ? "D" : "A",
    sharesOwnedAfter: num(post?.sharesOwnedFollowingTransaction),
    isDerivative,
    directOwnership: val(nature?.directOrIndirectOwnership) !== "I",
  };
}

export function parseForm4(xml: string, accessionNumber: string): Form4Filing {
  const doc = parser.parse(xml)?.ownershipDocument;
  if (!doc) throw new Error(`No ownershipDocument in ${accessionNumber}`);

  const issuer = doc.issuer ?? {};
  const ticker = normalizeTicker(val(issuer.issuerTradingSymbol));

  const owners: Form4Owner[] = (doc.reportingOwner ?? []).map(
    (o: Record<string, unknown>) => {
      const id = o.reportingOwnerId as Record<string, unknown> | undefined;
      const rel = o.reportingOwnerRelationship as
        | Record<string, unknown>
        | undefined;
      return {
        cik: String(val(id?.rptOwnerCik) ?? "").padStart(10, "0"),
        name: val(id?.rptOwnerName) ?? "Unknown",
        isDirector: bool(rel?.isDirector),
        isOfficer: bool(rel?.isOfficer),
        isTenPercentOwner: bool(rel?.isTenPercentOwner),
        officerTitle: val(rel?.officerTitle),
      };
    },
  );

  const nonDeriv = (doc.nonDerivativeTable?.nonDerivativeTransaction ?? []) as
    Record<string, unknown>[];
  const deriv = (doc.derivativeTable?.derivativeTransaction ?? []) as
    Record<string, unknown>[];

  const transactions = [
    ...nonDeriv.map((t) => parseTransaction(t, false)),
    ...deriv.map((t) => parseTransaction(t, true)),
  ].filter((t): t is Form4Transaction => t !== null);

  return {
    accessionNumber,
    issuerCik: String(val(issuer.issuerCik) ?? "").padStart(10, "0"),
    issuerName: val(issuer.issuerName) ?? "Unknown",
    ticker,
    // Some filers append a TZ offset ("2026-06-30-05:00") — keep the date only
    periodOfReport: (val(doc.periodOfReport) ?? "").slice(0, 10),
    is10b51: bool(doc.aff10b5One),
    owners,
    transactions,
  };
}

/**
 * Clean a raw issuerTradingSymbol into a real ticker or null. Filers put all
 * kinds of junk here: exchange prefixes ("NYSE: KRC"), wrapping quotes/brackets
 * ('"OMEX"', "[NONE]", "(SIRI)"), placeholders ("NONE"/"N/A"), and multiple
 * classes ("BFA, BFB", "LEN, LEN.B", "MOGA/MOGB"). Left raw, these render as
 * broken tickers and dead company pages. Normalize aggressively; null anything
 * that isn't a clean single symbol.
 */
export function normalizeTicker(raw: string | null): string | null {
  if (!raw) return null;
  let t = raw.toUpperCase().trim();
  t = t.replace(/^["'([\]]+/, "").replace(/["')\][]+$/, "").trim(); // wrappers
  t = t.replace(/^(NYSE\s*MKT|NYSE|NASDAQ|NASD|AMEX|ASX|OTC|CBOE|BATS)\s*[:/]\s*/, "");
  // Placeholder check BEFORE splitting — else "N/A" splits to "N" and survives
  if (["NONE", "N/A", "NA", "NULL", "-", ""].includes(t)) return null;
  t = t.split(/[,;/]+/)[0].trim(); // first class of a multi-symbol field
  // A real US ticker: letter start, ≤6 alnum, optional .A/.B class suffix.
  // Anything with leftover spaces or odd chars (e.g. "N O G") fails → null.
  return /^[A-Z][A-Z0-9]{0,5}(\.[A-Z])?$/.test(t) ? t : null;
}
