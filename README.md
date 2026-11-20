# Chapter Ping

A free, capacity-capped, multi-series manga chapter alert service for Discord. Sign in with Discord, paste a weebcentral series link, point it at your own webhook, and get one clean embed when a new chapter lands.

> **Do not point this app at the same Discord webhook as the older `onepiece-tracker` GitHub Action.** Two independent notifiers on one webhook means duplicate alerts.

Free while launch capacity lasts. No card, no ads, no paid tier. Free-domain options are in [`docs/DOMAINS.md`](docs/DOMAINS.md).

## Status

Milestone 5 (editorial UI) is built and reviewed. Milestone 6 (launch) is live at <https://chapter-tracker-web.chapterping.workers.dev>; production D1 is migrated and the cron has run successfully. Sign-in, series, destinations, the scheduler, activity, settings and account deletion are implemented and tested. The remaining live checks are Discord sign-in (after adding the production callback) and a real webhook test send.

The live Worker and D1 database keep their original internal names (`chapter-tracker-web`) so the current URL, data, and Discord callback stay stable. Chapter Ping is the product name; renaming those resources is a separate deploy-time cutover.

Build docs live in the repo:

- `docs/AGENT_BUILD_PROMPT.txt` - the original brief (historical; written before the rename)
- `docs/superpowers/specs/2026-11-20-chapter-ping-design.md` - design
- `docs/superpowers/plans/2026-11-20-chapter-ping.md` - milestone plan
- `docs/DOMAINS.md` - free-domain options and lengths

## Free-tier capacity model

Default caps, all set by environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `MAX_ACCOUNTS` | 100 | Accounts with at least one active subscription |
| `MAX_SERIES_PER_USER` | 5 | Active subscriptions per user |
| `MAX_DESTINATIONS_PER_USER` | 2 | Webhooks per user |
| `MAX_ACTIVE_SERIES` | 150 | Distinct series polled globally |
| `POLL_INTERVAL_MINUTES` | 30 | Target per-series check interval |
| `CRON_BATCH_SERIES` | 20 | Feed fetches per cron run |
| `CRON_BATCH_DELIVERIES` | 20 | Discord sends per cron run |
| `MAX_TEST_SENDS_PER_HOUR` | 5 | Test embeds per destination per hour |

Arithmetic: 150 series at 30 minutes is 300 feed checks/hour. The cron runs every 5 minutes with a 20-feed batch, so 240 checks/hour; sustained maximum load stretches the effective interval to about 37.5 minutes. 100 users at roughly 20 requests/day is about 2,000 Worker requests/day plus 288 cron invocations.

Cloudflare free limits that shape this: 100,000 Worker requests/day, 10 ms CPU per invocation, 50 subrequests, 50 D1 queries per invocation, 5M D1 rows read/day and 100,000 written/day. Static asset requests do not count as Worker requests. Exceeding a daily limit fails requests until the 00:00 UTC reset.

The measured local batch and the 49-query cron budget are in [`docs/CAPACITY.md`](docs/CAPACITY.md). Run it with `npm run load-test`.

Capacity is finite and there is no SLA. When the account cap is reached, a first series add is refused and the account joins the waitlist; existing users keep working.

## Architecture

```text
Browser SPA (static assets)  ->  Worker /api/*  ->  D1
                                    |                 ^
                          Better Auth (Discord)       |
                                                      |
Cron */5 * * * *  ->  due series -> weebcentral RSS --+
                  ->  due deliveries -> Discord webhook
```

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in Discord + secrets
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

Health: `curl http://localhost:8787/api/health`.

### Discord OAuth application

1. Discord Developer Portal -> Applications -> New Application.
2. OAuth2 -> add redirects: `http://localhost:8787/api/auth/callback/discord` and, later, `https://<worker>.workers.dev/api/auth/callback/discord`.
3. Copy the client id and secret into `.dev.vars`. Never commit them.

No bot token, no bot permissions, no privileged intents.

### D1 and migrations

```bash
npx wrangler d1 create chapter-tracker-web      # internal name kept stable; copy database_id into wrangler.jsonc
npm run db:migrate:local
npm run db:migrate:remote
```

### Scheduled handler locally

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*"
```

Use Wrangler's `/cdn-cgi/local/scheduled` route. `/__scheduled` is swallowed by the SPA asset fallback.

## Tests

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e     # UI milestone onward
npm run build
npm run deploy:dry
```

All outbound HTTP is mocked in tests; no test contacts Discord or weebcentral.

## Security model

- Discord OAuth (`identify` only) through Better Auth, sessions in D1, HttpOnly SameSite=Lax cookie, no tokens in localStorage.
- Every user-owned query scoped to the session user; foreign ids return 404.
- Exact host allowlists for feeds and webhooks; HTTPS only; no credentials, ports, or fragments; timeouts on every fetch.
- Webhook URLs encrypted at rest (AES-256-GCM, random IV), never returned after save, never logged.
- Mutations check same-origin in addition to cookies.
- CSP, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`, HSTS in production.

## Privacy and deletion

Account deletion lives in Settings and requires typing `DELETE`. It removes the account, sessions, subscriptions, destinations, deliveries, and any waitlist entry. Shared series and chapter metadata (titles, numbers, links) stays, because other users rely on it. See `PRIVACY.md` and `TERMS.md` -- both are drafts the operator must review before a public launch.

## Known limitations

- Free tier, no SLA, no uptime guarantee; polls may stretch under load.
- No Discord bot, so channel and role pickers are not possible.
- weebcentral only; RSS metadata and links only, no chapter content or images.
- No backfill: the first alert is the next new chapter after you subscribe.
- No email login or notifications.
- At most one normal notification per chapter per destination; Discord has no idempotency keys, so a rare ambiguous timeout can duplicate.
- `docs/` images contain only fake demo data.

## Attribution

Not affiliated with Discord or weebcentral. No chapter content is hosted; alerts link to weebcentral. Respect weebcentral's terms and rate limits.

The vendored `brain/` and `skills/` folders come from the brain.md toolkit (Apache-2.0) and are development tooling only.

## License

MIT. See `LICENSE`.
