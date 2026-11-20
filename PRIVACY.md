# Privacy Policy (draft)

This is a draft for the operator to review before a public launch. Replace the contact placeholder.

## What is collected

- Discord identity: user id, display name, avatar URL (through Discord OAuth).
- Session data needed to keep you signed in.
- Series subscriptions: which weebcentral series you track and which destination each one uses.
- Destinations: a label, an encrypted Discord webhook URL, and the guild and channel names Discord reports for it.
- An optional Discord role id you choose to ping.
- Delivery metadata: which chapter went to which destination, status, attempt count, and a sanitized error message.
- A waitlist entry (Discord id and username) if launch capacity is full when you sign in.

No analytics, no advertising identifiers, no marketing email, no payment data.

## Why

To deliver chapter alerts you asked for and to operate the service, including capacity limits and delivery health.

## Where it lives

Cloudflare D1. Cloudflare encrypts storage at rest; webhook URLs are additionally encrypted by the application with AES-256-GCM.

## Retention

- Delivery activity and job logs: 30 days.
- Account data: until you delete your account.
- Waitlist entries: until capacity opens, or 90 days.

## Deletion

Settings -> Delete account requires typing `DELETE`. It removes your account, sessions, subscriptions, destinations, deliveries, and waitlist entry. Shared series and chapter metadata remains, because other users track the same series. It contains no personal data.

## Cookies

Only essential, first-party session cookies. No tracking cookies, so no cookie banner is planned in v1. The operator must confirm whether local law requires one.

## Sharing

No sale of data. Data is shared only with Cloudflare (hosting and storage), Discord (to send the alerts you configured), and weebcentral (public feed requests, which reveal the series being checked, not your identity).

## Contact

`<operator contact placeholder>`

Not affiliated with Discord or weebcentral.
