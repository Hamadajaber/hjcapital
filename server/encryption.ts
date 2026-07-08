/**
 * Encryption Utility — AES-256-GCM
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides encrypt/decrypt functions for storing broker credentials securely.
 * Uses the JWT_SECRET environment variable as the master key source.
 */
import crypto from "crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derive a 256-bit encryption key from the JWT_SECRET using PBKDF2.
 * The salt is fixed per-installation (derived from the secret itself)
 * to ensure the same key is generated consistently.
 */
function deriveKey(): Buffer {
  const secret = ENV.cookieSecret || "fallback-dev-secret";
  const salt = crypto.createHash("sha256").update(`hjcapital-broker-creds-${secret.slice(0, 8)}`).digest();
  return crypto.pbkdf2Sync(secret, salt, 100_000, 32, "sha512");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string encrypted with AES-256-GCM.
 * Expects format: iv:authTag:ciphertext (all hex-encoded)
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = deriveKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Test if encryption/decryption works correctly
 */
export function testEncryption(): boolean {
  try {
    const testValue = "test-encryption-" + Date.now();
    const encrypted = encrypt(testValue);
    const decrypted = decrypt(encrypted);
    return decrypted === testValue;
  } catch {
    return false;
  }
}
