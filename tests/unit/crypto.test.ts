import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/worker/lib/errors";
import { decryptSecret, encryptSecret, sha256Hex } from "../../src/worker/lib/crypto";

const key = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const otherKey = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const plaintext = "https://discord.com/api/webhooks/123456789012345678/abcDEF_123-xyz";

describe("webhook crypto", () => {
  it("round trips a secret", async () => {
    const encrypted = await encryptSecret(plaintext, key);
    expect(await decryptSecret(encrypted, key)).toBe(plaintext);
  });

  it("uses a random IV per encryption and does not contain the plaintext", async () => {
    const first = await encryptSecret(plaintext, key);
    const second = await encryptSecret(plaintext, key);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(Buffer.from(first.ciphertext, "base64").toString("utf8")).not.toContain("discord.com");
  });

  it("rejects tampering and the wrong key", async () => {
    const encrypted = await encryptSecret(plaintext, key);
    const bytes = Buffer.from(encrypted.ciphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    await expect(
      decryptSecret({ ciphertext: bytes.toString("base64"), iv: encrypted.iv }, key),
    ).rejects.toMatchObject({ code: "CRYPTO_INVALID" });
    await expect(
      decryptSecret({ ciphertext: encrypted.ciphertext, iv: encrypted.iv }, otherKey),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a malformed key or IV", async () => {
    await expect(encryptSecret(plaintext, Buffer.from("short").toString("base64"))).rejects.toMatchObject({
      code: "CRYPTO_INVALID",
    });
    await expect(
      decryptSecret({ ciphertext: "AAAA", iv: "AAAA" }, key),
    ).rejects.toMatchObject({ code: "CRYPTO_INVALID" });
  });

  it("hashes deterministically", async () => {
    expect(await sha256Hex(plaintext)).toBe(await sha256Hex(plaintext));
    expect(await sha256Hex(plaintext)).toHaveLength(64);
    expect(await sha256Hex(plaintext)).not.toBe(await sha256Hex(`${plaintext}x`));
  });
});
