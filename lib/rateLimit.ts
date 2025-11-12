import pool from './db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // epoch millis when window resets
}

/**
 * Implements a simple fixed‑window rate limiter using PostgreSQL.  Each key
 * corresponds to a row in the `rate_limit` table with a count and expiration.
 * When a new window begins, the count is reset to 1 and the expiration is
 * extended.  Otherwise the count is incremented.  The function returns
 * whether the request is allowed along with the remaining quota and reset time.
 *
 * The `rate_limit` table must have the following schema:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS rate_limit (
 *   key TEXT PRIMARY KEY,
 *   count INTEGER NOT NULL,
 *   expires_at TIMESTAMPTZ NOT NULL
 * );
 * ```
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const now = new Date();
  // See if there's an existing window
  const res = await pool.query('SELECT count, expires_at FROM rate_limit WHERE key = $1', [key]);
  if (res.rowCount === 0 || res.rows[0].expires_at.getTime() <= now.getTime()) {
    // Start a new window: reset count to 1 and update expires_at
    const expiresAt = new Date(now.getTime() + windowSec * 1000);
    // Use a single‑line SQL string to avoid unterminated string errors
    await pool.query(
      'INSERT INTO rate_limit (key, count, expires_at) VALUES ($1, 1, $2) ON CONFLICT (key) DO UPDATE SET count = 1, expires_at = $2',
      [key, expiresAt]
    );
    return { allowed: true, remaining: limit - 1, reset: expiresAt.getTime() };
  } else {
    const { count, expires_at } = res.rows[0];
    const newCount = Number(count) + 1;
    await pool.query('UPDATE rate_limit SET count = $2 WHERE key = $1', [key, newCount]);
    const allowed = newCount <= limit;
    const remaining = limit - newCount;
    const reset = expires_at.getTime();
    return { allowed, remaining, reset };
  }
}