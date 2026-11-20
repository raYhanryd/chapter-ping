export interface Env {
  DB: D1Database;
  APP_URL: string;
  ENVIRONMENT?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
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
