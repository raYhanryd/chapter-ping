export const DEFAULT_LIMITS = {
  maxAccounts: 100,
  maxSeriesPerUser: 5,
  maxDestinationsPerUser: 2,
  maxActiveSeries: 150,
  pollIntervalMinutes: 30,
  cronBatchSeries: 20,
  cronBatchDeliveries: 20,
  maxTestSendsPerHour: 5,
} as const;

export const WEEBCENTRAL_HOSTS = ["weebcentral.com", "www.weebcentral.com"] as const;

export const DISCORD_WEBHOOK_HOSTS = [
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
] as const;

export const DELIVERY_STATUSES = ["pending", "sent", "retry", "failed", "skipped"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DESTINATION_STATUSES = ["active", "disabled"] as const;
export type DestinationStatus = (typeof DESTINATION_STATUSES)[number];

export const ACTIVITY_RETENTION_DAYS = 30;
export const WAITLIST_RETENTION_DAYS = 90;
export const MAX_DELIVERY_ATTEMPTS = 5;
