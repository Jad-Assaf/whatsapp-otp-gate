import crypto from 'crypto';

/**
 * Generate a cryptographically random 6‑digit numeric code as a string.
 */
export function generateCode(): string {
  // Use crypto.randomInt for uniform distribution between 0 and 999999
  const num = crypto.randomInt(0, 1000000);
  return num.toString().padStart(6, '0');
}

/**
 * Hash an OTP using HMAC‑SHA256. Never store or compare raw codes.
 *
 * @param code The 6 digit code
 * @param secret The HMAC secret key
 * @returns Hexadecimal hash digest
 */
export function hashCode(code: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

/**
 * Constant‑time comparison of a provided code against a stored hash.
 * Prevents timing attacks by using crypto.timingSafeEqual.
 *
 * @param code The code provided by the user
 * @param storedHash The previously stored HMAC digest
 * @param secret The HMAC secret key
 */
export function verifyCode(code: string, storedHash: string, secret: string): boolean {
  const computed = hashCode(code, secret);
  // Convert to buffers of equal length
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}