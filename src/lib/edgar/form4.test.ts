import { describe, expect, it } from "vitest";
import { parseForm4 } from "./form4";

function form4Xml(opts: {
  ticker?: string;
  period?: string;
  owners?: string;
  nonDeriv?: string;
  deriv?: string;
}): string {
  return `<?xml version="1.0"?>
<ownershipDocument>
  <periodOfReport>${opts.period ?? "2026-06-30"}</periodOfReport>
  <issuer>
    <issuerCik>320193</issuerCik>
    <issuerName>Apple Inc.</issuerName>
    <issuerTradingSymbol>${opts.ticker ?? "AAPL"}</issuerTradingSymbol>
  </issuer>
  ${
    opts.owners ??
    `<reportingOwner>
      <reportingOwnerId><rptOwnerCik>1214156</rptOwnerCik><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId>
      <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CFO</officerTitle></reportingOwnerRelationship>
    </reportingOwner>`
  }
  ${opts.nonDeriv ? `<nonDerivativeTable>${opts.nonDeriv}</nonDerivativeTable>` : ""}
  ${opts.deriv ? `<derivativeTable>${opts.deriv}</derivativeTable>` : ""}
</ownershipDocument>`;
}

const BUY_TX = `<nonDerivativeTransaction>
  <securityTitle><value>Common Stock</value></securityTitle>
  <transactionDate><value>2026-06-29</value></transactionDate>
  <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
  <transactionAmounts>
    <transactionShares><value>1000</value></transactionShares>
    <transactionPricePerShare><value>195.50</value></transactionPricePerShare>
    <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
  </transactionAmounts>
  <postTransactionAmounts><sharesOwnedFollowingTransaction><value>5000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
  <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
</nonDerivativeTransaction>`;

describe("parseForm4", () => {
  it("parses issuer, owner, and an open-market buy", () => {
    const f = parseForm4(form4Xml({ nonDeriv: BUY_TX }), "acc-1");
    expect(f.issuerCik).toBe("0000320193");
    expect(f.ticker).toBe("AAPL");
    expect(f.owners).toHaveLength(1);
    expect(f.owners[0]).toMatchObject({
      name: "DOE JANE",
      isOfficer: true,
      officerTitle: "CFO",
      cik: "0001214156",
    });
    expect(f.transactions).toHaveLength(1);
    expect(f.transactions[0]).toMatchObject({
      transactionCode: "P",
      shares: 1000,
      pricePerShare: 195.5,
      acquiredDisposed: "A",
      sharesOwnedAfter: 5000,
      isDerivative: false,
      directOwnership: true,
    });
  });

  it("treats NONE ticker as null", () => {
    const f = parseForm4(form4Xml({ ticker: "NONE", nonDeriv: BUY_TX }), "acc-2");
    expect(f.ticker).toBeNull();
  });

  it("strips timezone offsets some filers append to periodOfReport", () => {
    const f = parseForm4(
      form4Xml({ period: "2026-06-30-05:00", nonDeriv: BUY_TX }),
      "acc-3",
    );
    expect(f.periodOfReport).toBe("2026-06-30");
  });

  it("returns null price when it lives in a footnote", () => {
    const tx = BUY_TX.replace(
      /<transactionPricePerShare>[\s\S]*?<\/transactionPricePerShare>/,
      "<transactionPricePerShare><footnoteId id=\"F1\"/></transactionPricePerShare>",
    );
    const f = parseForm4(form4Xml({ nonDeriv: tx }), "acc-4");
    expect(f.transactions[0].pricePerShare).toBeNull();
  });

  it("flags indirect ownership", () => {
    const tx = BUY_TX.replace("<value>D</value>", "<value>I</value>");
    const f = parseForm4(form4Xml({ nonDeriv: tx }), "acc-5");
    expect(f.transactions[0].directOwnership).toBe(false);
  });

  it("marks derivative-table transactions", () => {
    const derivTx = BUY_TX.replace(/nonDerivativeTransaction/g, "derivativeTransaction");
    const f = parseForm4(form4Xml({ deriv: derivTx }), "acc-6");
    expect(f.transactions[0].isDerivative).toBe(true);
  });

  it("handles multiple reporting owners", () => {
    const owners = `
      <reportingOwner>
        <reportingOwnerId><rptOwnerCik>1</rptOwnerCik><rptOwnerName>A</rptOwnerName></reportingOwnerId>
        <reportingOwnerRelationship><isDirector>1</isDirector></reportingOwnerRelationship>
      </reportingOwner>
      <reportingOwner>
        <reportingOwnerId><rptOwnerCik>2</rptOwnerCik><rptOwnerName>B</rptOwnerName></reportingOwnerId>
        <reportingOwnerRelationship><isTenPercentOwner>true</isTenPercentOwner></reportingOwnerRelationship>
      </reportingOwner>`;
    const f = parseForm4(form4Xml({ owners, nonDeriv: BUY_TX }), "acc-7");
    expect(f.owners).toHaveLength(2);
    expect(f.owners[0].isDirector).toBe(true);
    expect(f.owners[1].isTenPercentOwner).toBe(true);
  });

  it("skips rows without a transaction code (holdings) instead of crashing", () => {
    const holding = `<nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-06-29</value></transactionDate>
    </nonDerivativeTransaction>`;
    const f = parseForm4(form4Xml({ nonDeriv: holding + BUY_TX }), "acc-8");
    expect(f.transactions).toHaveLength(1);
  });

  it("throws on non-Form-4 XML", () => {
    expect(() => parseForm4("<html>rate limited</html>", "acc-9")).toThrow("acc-9");
  });
});
