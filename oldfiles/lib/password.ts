/**
 * Password hashing and verification utilities using Node.js built-in crypto.
 *
 * Uses `scrypt` with a 16-byte random salt and 64-byte key derivation.
 * Verification uses `timingSafeEqual` to prevent timing attacks.
 */

import crypto from "node:crypto";

const KEY_LEN = 64;

/**
 * Hashes a plaintext password and returns a string in `salt:derivedKeyHex` format.
 */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verifies a plaintext password against a stored `salt:derivedKeyHex` string.
 */
export function verifyPassword(password: string, combinedHash: string | null | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    if (!combinedHash || typeof combinedHash !== "string") return resolve(false);

    const parts = combinedHash.split(":");
    if (parts.length !== 2) return resolve(false);

    const [salt, keyHex] = parts;
    if (!salt || !keyHex) return resolve(false);

    crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const storedKeyBuffer = Buffer.from(keyHex, "hex");
        if (storedKeyBuffer.length !== derivedKey.length) return resolve(false);
        const match = crypto.timingSafeEqual(storedKeyBuffer, derivedKey);
        resolve(match);
      } catch {
        resolve(false);
      }
    });
  });
}
