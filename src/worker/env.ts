export interface Env {
  DB: D1Database;
  /** Static assets binding; the Worker defers every non-API request to it. */
  ASSETS: Fetcher;
  APP_URL: string;
  /** Canonical public origin when the app is served through a proxy. Defaults to APP_URL. */
  PUBLIC_URL?: string;
  ENVIRONMENT?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
  /** Discord webhook the operator is paged on. Unset means no alerting. */
  ALERT_WEBHOOK_URL?: string;
  /** Comma-separated Discord ids with the owner desk and no caps. Unset means nobody. */
  ADMIN_DISCORD_IDS?: string;
  MAX_ACCOUNTS?: string;
  MAX_SERIES_PER_USER?: string;
  MAX_DESTINATIONS_PER_USER?: string;
  MAX_ACTIVE_SERIES?: string;
  POLL_INTERVAL_MINUTES?: string;
  CRON_BATCH_SERIES?: string;
  CRON_BATCH_DELIVERIES?: string;
  MAX_TEST_SENDS_PER_HOUR?: string;
}

export interface AppConfig {
  maxAccounts: number;
  maxSeriesPerUser: number;
  maxDestinationsPerUser: number;
  maxActiveSeries: number;
  pollIntervalMinutes: number;
  cronBatchSeries: number;
  cronBatchDeliveries: number;
  maxTestSendsPerHour: number;
}
