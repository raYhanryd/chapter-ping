import { DEFAULT_LIMITS } from "../../shared/constants";
import type { AppConfig, Env } from "../env";

const BOUNDS: Record<keyof AppConfig, { min: number; max: number }> = {
  maxAccounts: { min: 1, max: 10_000 },
  maxSeriesPerUser: { min: 1, max: 100 },
  maxDestinationsPerUser: { min: 1, max: 20 },
  maxActiveSeries: { min: 1, max: 5_000 },
  pollIntervalMinutes: { min: 5, max: 1_440 },
  cronBatchSeries: { min: 1, max: 40 },
  cronBatchDeliveries: { min: 1, max: 40 },
  maxTestSendsPerHour: { min: 1, max: 60 },
};

function parseBounded(raw: string | undefined, fallback: number, bounds: { min: number; max: number }): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) return fallback;
  return value;
}

export function readConfig(env: Env): AppConfig {
  return {
    maxAccounts: parseBounded(env.MAX_ACCOUNTS, DEFAULT_LIMITS.maxAccounts, BOUNDS.maxAccounts),
    maxSeriesPerUser: parseBounded(
      env.MAX_SERIES_PER_USER,
      DEFAULT_LIMITS.maxSeriesPerUser,
      BOUNDS.maxSeriesPerUser,
    ),
    maxDestinationsPerUser: parseBounded(
      env.MAX_DESTINATIONS_PER_USER,
      DEFAULT_LIMITS.maxDestinationsPerUser,
      BOUNDS.maxDestinationsPerUser,
    ),
    maxActiveSeries: parseBounded(
      env.MAX_ACTIVE_SERIES,
      DEFAULT_LIMITS.maxActiveSeries,
      BOUNDS.maxActiveSeries,
    ),
    pollIntervalMinutes: parseBounded(
      env.POLL_INTERVAL_MINUTES,
      DEFAULT_LIMITS.pollIntervalMinutes,
      BOUNDS.pollIntervalMinutes,
    ),
    cronBatchSeries: parseBounded(
      env.CRON_BATCH_SERIES,
      DEFAULT_LIMITS.cronBatchSeries,
      BOUNDS.cronBatchSeries,
    ),
    cronBatchDeliveries: parseBounded(
      env.CRON_BATCH_DELIVERIES,
      DEFAULT_LIMITS.cronBatchDeliveries,
      BOUNDS.cronBatchDeliveries,
    ),
    maxTestSendsPerHour: parseBounded(
      env.MAX_TEST_SENDS_PER_HOUR,
      DEFAULT_LIMITS.maxTestSendsPerHour,
      BOUNDS.maxTestSendsPerHour,
    ),
  };
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === "production";
}
