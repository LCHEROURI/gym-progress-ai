import { describe, expect, it } from "vitest";
import { viewFromSearch } from "./screenParam";

describe("viewFromSearch", () => {
  it("maps every valid screen", () => {
    for (const s of ["today", "history", "progress", "coach", "reports", "settings"]) {
      expect(viewFromSearch(`?screen=${s}`)).toBe(s);
    }
  });

  it("ignores missing, empty, or unknown values", () => {
    expect(viewFromSearch("")).toBeNull();
    expect(viewFromSearch("?screen=")).toBeNull();
    expect(viewFromSearch("?screen=workout")).toBeNull();
    expect(viewFromSearch("?screen=SETTINGS")).toBeNull();
    expect(viewFromSearch("?other=1")).toBeNull();
  });

  it("parses within a full query string", () => {
    expect(viewFromSearch("?foo=1&screen=coach&bar=2")).toBe("coach");
  });
});
