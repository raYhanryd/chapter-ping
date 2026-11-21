import type { Env } from "../env";
import { checkRateLimit } from "./rate-limit";

const ALERT_WINDOW_SECONDS = 3_600;

/**
 * Best-effort ping to the operator's Discord channel. Never throws: the cron's
 * own failure is more important than the alert about it.
 *
 * This cannot detect a cron that never fires — nothing in the Worker runs then.
 * It catches failed runs and long gaps at the next run; pair it with an external
 * check on /api/status for the silent case.
 */
export async function alertOperator(
  env: Env,
  message: string,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  try {
    const url = env.ALERT_WEBHOOK_URL?.trim();
    if (!url) return false;

    const now = options.now ?? new Date();
    const limit = await checkRateLimit(env.DB, "operator-alert", 1, ALERT_WINDOW_SECONDS, now);
    if (!limit.allowed) return false;

    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `[Chapter Ping] ${message}` }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
