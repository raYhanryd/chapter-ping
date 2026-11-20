import { describe, expect, it } from "vitest";
import { safeNextPath } from "../../src/client/lib/navigation";

describe("safeNextPath", () => {
  it("keeps a local path with its query and hash", () => {
    expect(safeNextPath("/activity?status=sent#top")).toBe("/activity?status=sent#top");
  });

  it("falls back for anything that is not a plain local path", () => {
    for (const value of [
      null,
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\tevil",
      "/login",
      "/login?next=/dashboard",
      "/login#again",
      "/LOGIN",
      "/login/again",
    ]) {
      expect(safeNextPath(value)).toBe("/dashboard");
    }
  });
});
