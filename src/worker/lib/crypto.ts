import { ApiError } from "./errors";

const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
}

function invalid(): ApiError {
  return new ApiError("CRYPTO_INVALID", "Webhook encryption failed.", 500);
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw invalid();
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  const raw = decodeBase64(keyBase64);
  if (raw.length !== KEY_BYTES) throw invalid();
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, keyBase64: string): Promise<EncryptedSecret> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    iv: encodeBase64(iv),
  };
}

export async function decryptSecret(
  secret: { ciphertext: string; iv: string },
  keyBase64: string,
): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = decodeBase64(secret.iv);
  if (iv.length !== IV_BYTES) throw invalid();
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, decodeBase64(secret.ciphertext));
    return new TextDecoder().decode(decrypted);
  } catch {
    throw invalid();
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
