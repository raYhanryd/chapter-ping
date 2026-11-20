import { describe, expect, it } from "vitest";
import { ApiError, sanitizeMessage, toErrorBody } from "../../src/worker/lib/errors";

describe("sanitizeMessage", () => {
  it("removes URLs", () => {
    expect(sanitizeMessage("Failed calling https://discord.com/api/webhooks/1/token now")).not.toContain(
      "discord.com",
    );
  });

  it("removes Discord snowflakes", () => {
    expect(sanitizeMessage("role 123456789012345678 missing")).toBe("role [redacted] missing");
  });

  it("leaves ordinary prose alone", () => {
    expect(sanitizeMessage("Feed unavailable")).toBe("Feed unavailable");
  });
});

describe("toErrorBody", () => {
  it("never contains a stack or a URL", () => {
    const error = new ApiError("FEED_UNAVAILABLE", "upstream https://weebcentral.com/x failed", 502);
    const body = toErrorBody(error);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("weebcentral.com");
    expect(serialized).not.toContain("stack");
    expect(body.error.code).toBe("FEED_UNAVAILABLE");
  });

  it("includes the field only when provided", () => {
    expect(toErrorBody(new ApiError("VALIDATION_ERROR", "bad", 400)).error.field).toBeUndefined();
    expect(toErrorBody(new ApiError("VALIDATION_ERROR", "bad", 400, "url")).error.field).toBe("url");
  });
});
