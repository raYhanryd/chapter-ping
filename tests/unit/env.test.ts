import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "../../src/shared/constants";
import type { Env } from "../../src/worker/env";
import { readConfig } from "../../src/worker/lib/env";

const base = { DB: {} as D1Database, APP_URL: "http://localhost:8787" } satisfies Env;

describe("readConfig", () => {
  it("uses the brief's defaults when values are absent", () => {
    expect(readConfig(base)).toEqual(DEFAULT_LIMITS);
  });

  it("parses provided values", () => {
    const config = readConfig({ ...base, MAX_ACCOUNTS: "12", POLL_INTERVAL_MINUTES: "45" });
    expect(config.maxAccounts).toBe(12);
    expect(config.pollIntervalMinutes).toBe(45);
  });

  it("falls back on nonsense instead of producing NaN", () => {
    const config = readConfig({ ...base, MAX_ACCOUNTS: "abc", MAX_SERIES_PER_USER: "0" });
    expect(config.maxAccounts).toBe(DEFAULT_LIMITS.maxAccounts);
    expect(config.maxSeriesPerUser).toBe(DEFAULT_LIMITS.maxSeriesPerUser);
  });

  it("rejects values outside the safe bounds", () => {
    const config = readConfig({ ...base, CRON_BATCH_SERIES: "500", POLL_INTERVAL_MINUTES: "1" });
    expect(config.cronBatchSeries).toBe(DEFAULT_LIMITS.cronBatchSeries);
    expect(config.pollIntervalMinutes).toBe(DEFAULT_LIMITS.pollIntervalMinutes);
  });
});
