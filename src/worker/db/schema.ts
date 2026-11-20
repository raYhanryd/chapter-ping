import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Better Auth tables. Column names and shapes follow the official SQLite schema.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("idx_session_user").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_account_user").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_verification_identifier").on(table.identifier)],
);

export const series = sqliteTable(
  "series",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull().default("weebcentral"),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    feedUrl: text("feed_url").notNull(),
    siteUrl: text("site_url").notNull(),
    latestChapterNumber: real("latest_chapter_number"),
    latestChapterLabel: text("latest_chapter_label"),
    latestChapterTitle: text("latest_chapter_title"),
    latestChapterUrl: text("latest_chapter_url"),
    latestPublishedAt: text("latest_published_at"),
    nextCheckAt: text("next_check_at").notNull(),
    lastCheckedAt: text("last_checked_at"),
    lastError: text("last_error"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_series_source_external").on(table.source, table.externalId),
    index("idx_series_due").on(table.active, table.nextCheckAt),
  ],
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    chapterNumber: real("chapter_number").notNull(),
    chapterLabel: text("chapter_label").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    publishedAt: text("published_at"),
    discoveredAt: text("discovered_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_chapters_series_number").on(table.seriesId, table.chapterNumber),
    index("idx_chapters_series").on(table.seriesId, table.chapterNumber),
  ],
);

export const destinations = sqliteTable(
  "destinations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    label: text("label").notNull(),
    webhookCiphertext: text("webhook_ciphertext").notNull(),
    webhookIv: text("webhook_iv").notNull(),
    webhookFingerprint: text("webhook_fingerprint").notNull(),
    guildId: text("guild_id"),
    guildName: text("guild_name"),
    channelId: text("channel_id"),
    channelName: text("channel_name"),
    roleId: text("role_id"),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    lastError: text("last_error"),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_destinations_user_fingerprint").on(table.userId, table.webhookFingerprint),
    index("idx_destinations_user").on(table.userId),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    destinationId: text("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "restrict" }),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_subscriptions_user_series").on(table.userId, table.seriesId),
    index("idx_subscriptions_user").on(table.userId),
    index("idx_subscriptions_series").on(table.seriesId),
  ],
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    destinationId: text("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "sent", "retry", "failed", "skipped"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_deliveries_chapter_destination").on(table.chapterId, table.destinationId),
    index("idx_deliveries_due").on(table.status, table.nextAttemptAt),
    index("idx_deliveries_destination").on(table.destinationId),
  ],
);

export const waitlist = sqliteTable(
  "waitlist",
  {
    id: text("id").primaryKey(),
    discordId: text("discord_id").notNull(),
    username: text("username").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("uq_waitlist_discord").on(table.discordId)],
);

export const jobLocks = sqliteTable("job_locks", {
  name: text("name").primaryKey(),
  lockedUntil: text("locked_until").notNull(),
});

export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status").notNull(),
    feedsChecked: integer("feeds_checked").notNull().default(0),
    chaptersFound: integer("chapters_found").notNull().default(0),
    deliveriesSent: integer("deliveries_sent").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    detail: text("detail"),
  },
  (table) => [index("idx_job_runs_started").on(table.startedAt)],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: text("window_start").notNull(),
  count: integer("count").notNull(),
});
