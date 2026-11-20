import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatRelative } from "../../src/client/lib/format";

const NOW = Date.parse("2026-11-20T12:00:00.000Z");

describe("formatRelative", () => {
  it("describes future and past times in words", () => {
    expect(formatRelative("2026-11-20T12:30:00.000Z", NOW)).toBe("in 30 min");
    expect(formatRelative("2026-11-20T11:55:00.000Z", NOW)).toBe("5 min ago");
  });

  it("shows just now inside the first minute", () => {
    expect(formatRelative("2026-11-20T12:00:30.000Z", NOW)).toBe("just now");
  });

  it("falls back to a dash for missing timestamps", () => {
    expect(formatRelative(null, NOW)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("returns readable dates", () => {
    const value = formatDateTime("2026-11-20T12:00:00.000Z");
    expect(value).toContain("Nov");
    expect(value).toContain("2026");
  });

  it("returns a dash for a missing value", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});
