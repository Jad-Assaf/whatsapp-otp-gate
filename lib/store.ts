import pool from './db';

/**
 * Data access functions for OTP, verification flags, and locks.  These
 * functions operate on a Postgres database using the schemas described
 * in README.md.
 */

export interface OtpRecord {
  cart_id: string;
  phone_e164: string;
  code_hash: string;
  attempts: number;
  created_at: Date;
  expires_at: Date;
  resend_at: Date;
  request_ip: string;
}

export interface VerifiedRecord {
  cart_id: string;
  phone_e164: string;
  verified_at: Date;
  expires_at: Date;
}

export interface LockRecord {
  cart_id: string;
  locked_until: Date;
}

/* OTP helpers */
export async function getOtp(cartId: string): Promise<OtpRecord | null> {
  const res = await pool.query('SELECT * FROM otp WHERE cart_id = $1', [cartId]);
  return res.rowCount ? (res.rows[0] as OtpRecord) : null;
}

export async function saveOtp(record: OtpRecord): Promise<void> {
  await pool.query(
    `INSERT INTO otp (cart_id, phone_e164, code_hash, attempts, created_at, expires_at, resend_at, request_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (cart_id)
     DO UPDATE SET phone_e164=EXCLUDED.phone_e164,
                   code_hash=EXCLUDED.code_hash,
                   attempts=EXCLUDED.attempts,
                   created_at=EXCLUDED.created_at,
                   expires_at=EXCLUDED.expires_at,
                   resend_at=EXCLUDED.resend_at,
                   request_ip=EXCLUDED.request_ip`,
    [
      record.cart_id,
      record.phone_e164,
      record.code_hash,
      record.attempts,
      record.created_at,
      record.expires_at,
      record.resend_at,
      record.request_ip
    ]
  );
}

export async function deleteOtp(cartId: string): Promise<void> {
  await pool.query('DELETE FROM otp WHERE cart_id = $1', [cartId]);
}

/* Verified helpers */
export async function getVerified(cartId: string): Promise<VerifiedRecord | null> {
  const res = await pool.query('SELECT * FROM verified WHERE cart_id = $1 AND expires_at > NOW()', [cartId]);
  return res.rowCount ? (res.rows[0] as VerifiedRecord) : null;
}

export async function setVerified(cartId: string, phoneE164: string, verifiedAt: Date, expiresAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO verified (cart_id, phone_e164, verified_at, expires_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (cart_id)
     DO UPDATE SET phone_e164=EXCLUDED.phone_e164,
                   verified_at=EXCLUDED.verified_at,
                   expires_at=EXCLUDED.expires_at`,
    [cartId, phoneE164, verifiedAt, expiresAt]
  );
}

export async function deleteVerified(cartId: string): Promise<void> {
  await pool.query('DELETE FROM verified WHERE cart_id = $1', [cartId]);
}

/* Lock helpers */
export async function getLock(cartId: string): Promise<LockRecord | null> {
  const res = await pool.query('SELECT * FROM lock WHERE cart_id = $1 AND locked_until > NOW()', [cartId]);
  return res.rowCount ? (res.rows[0] as LockRecord) : null;
}

export async function setLock(cartId: string, lockedUntil: Date): Promise<void> {
  await pool.query(
    `INSERT INTO lock (cart_id, locked_until)
     VALUES ($1,$2)
     ON CONFLICT (cart_id)
     DO UPDATE SET locked_until=EXCLUDED.locked_until`,
    [cartId, lockedUntil]
  );
}

export async function deleteLock(cartId: string): Promise<void> {
  await pool.query('DELETE FROM lock WHERE cart_id = $1', [cartId]);
}