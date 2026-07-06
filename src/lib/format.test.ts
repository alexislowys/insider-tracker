import { describe, expect, it } from "vitest";
import { fmtPrice, fmtShares, fmtValue, roleLabel } from "./format";

describe("fmtValue", () => {
  it("formats millions, thousands, and small values", () => {
    expect(fmtValue("2500000")).toBe("$2.5M");
    expect(fmtValue("76200")).toBe("$76K");
    expect(fmtValue("450")).toBe("$450");
  });
  it("dashes out null and non-numeric input", () => {
    expect(fmtValue(null)).toBe("—");
    expect(fmtValue("not-a-number")).toBe("—");
  });
});

describe("fmtShares / fmtPrice", () => {
  it("adds thousands separators and currency", () => {
    expect(fmtShares("1234567")).toBe("1,234,567");
    expect(fmtPrice("195.5")).toBe("$195.50");
  });
  it("dashes out nulls (footnote prices)", () => {
    expect(fmtShares(null)).toBe("—");
    expect(fmtPrice(null)).toBe("—");
  });
});

describe("roleLabel", () => {
  const base = { officer_title: null, is_director: false, is_ten_percent_owner: false };
  it("prefers officer title over director over 10% owner", () => {
    expect(roleLabel({ ...base, officer_title: "CEO", is_director: true })).toBe("CEO");
    expect(roleLabel({ ...base, is_director: true, is_ten_percent_owner: true })).toBe("Director");
    expect(roleLabel({ ...base, is_ten_percent_owner: true })).toBe("10% owner");
    expect(roleLabel(base)).toBe("Insider");
  });
});
