import jwt from 'jsonwebtoken';

const HMAC_SECRET = process.env.HMAC_SECRET || '';

if (!HMAC_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('HMAC_SECRET is not set. JWT signing will fail.');
}

export interface TokenPayload {
  cartId: string;
  phone: string;
  iat?: number;
  exp?: number;
}

/**
 * Sign a JWT with the given payload. The default expiration is 30 minutes.
 * @param payload Fields to embed in the token
 * @param expiresIn Seconds until expiration
 */
export function signToken(payload: TokenPayload, expiresIn: number = 30 * 60): string {
  return jwt.sign(payload, HMAC_SECRET, { expiresIn });
}

/**
 * Verify a JWT and return the decoded payload. Throws on invalid token.
 * @param token The JWT provided by the client
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, HMAC_SECRET) as TokenPayload;
}