import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/worker/lib/errors";
import { parseWebhookUrl } from "../../src/worker/lib/discord";

const id = "123456789012345678";
const token = "abcDEF_123-xyz";

function url(host = "discord.com"): string {
  return `https://${host}/api/webhooks/${id}/${token}`;
}

function rejects(input: string) {
  expect(() => parseWebhookUrl(input)).toThrow(ApiError);
}

describe("parseWebhookUrl", () => {
  it("accepts every Discord webhook host", () => {
    for (const host of ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]) {
      expect(parseWebhookUrl(url(host)).url).toBe(url(host));
    }
  });

  it("strips a query string", () => {
    expect(parseWebhookUrl(`${url()}?wait=true`).url).toBe(url());
  });

  it("rejects other schemes, hosts and ports", () => {
    rejects(`http://discord.com/api/webhooks/${id}/${token}`);
    rejects(`https://evil.com/api/webhooks/${id}/${token}`);
    rejects(`https://discord.com.evil.com/api/webhooks/${id}/${token}`);
    rejects(`https://discord.com:8443/api/webhooks/${id}/${token}`);
    rejects("https://discord.com/api/webhooks/123/short");
  });

  it("rejects credentials, fragments and other paths", () => {
    rejects(`https://user:pass@discord.com/api/webhooks/${id}/${token}`);
    rejects(`${url()}#frag`);
    rejects(`https://discord.com/api/v10/webhooks/${id}/${token}`);
    rejects(`https://discord.com/api/webhooks/${id}`);
    rejects("not a url");
  });
});
