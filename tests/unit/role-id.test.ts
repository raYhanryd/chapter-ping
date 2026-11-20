import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/worker/lib/errors";
import { normalizeRoleId } from "../../src/worker/lib/discord";

const role = "123456789012345678";

describe("normalizeRoleId", () => {
  it("treats blank as no role", () => {
    expect(normalizeRoleId(undefined)).toBeNull();
    expect(normalizeRoleId("")).toBeNull();
    expect(normalizeRoleId("   ")).toBeNull();
  });

  it("accepts a bare id or a role mention", () => {
    expect(normalizeRoleId(role)).toBe(role);
    expect(normalizeRoleId(`<@&${role}>`)).toBe(role);
    expect(normalizeRoleId(`  ${role}  `)).toBe(role);
  });

  it("rejects invalid non-empty input", () => {
    expect(() => normalizeRoleId("abc")).toThrow(ApiError);
    expect(() => normalizeRoleId("<@123>")).toThrow(ApiError);
    expect(() => normalizeRoleId("123456789012345678901")).toThrow(ApiError);
  });
});
