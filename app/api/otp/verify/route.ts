import { NextResponse, NextRequest } from 'next/server';
import { getOtp, saveOtp, deleteOtp, getVerified, setVerified, deleteVerified, getLock, setLock } from '@/lib/store';
import { verifyCode, hashCode } from '@/lib/otp';
import { log } from '@/lib/logger';
import { signToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import crypto from 'crypto';

const ATTEMPT_LIMIT = 5;
const OTP_LOCK_SECONDS = 15 * 60; // 15 minute lock on too many attempts
const VERIFIED_TTL_SECONDS = 30 * 60; // 30 minutes to complete checkout

const HMAC_SECRET = process.env.HMAC_SECRET || '';

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || [];

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && allowedOrigins.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,authorization'
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 200, headers: buildCorsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);
  let requestId: string = crypto.randomUUID();
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const body = await req.json();
    const cartId = String(body.cartId || '').trim();
    const code = String(body.code || '').trim();
    if (!cartId) {
      return new NextResponse(JSON.stringify({ error: 'cartId is required' }), { status: 400, headers: corsHeaders });
    }
    if (!code) {
      return new NextResponse(JSON.stringify({ error: 'code is required' }), { status: 400, headers: corsHeaders });
    }
    // Rate limit verification attempts per IP to avoid brute force across carts
    const rlChecks: Array<{ key: string; limit: number; windowSec: number }> = [
      { key: `rl:verify:ip:1m:${ip}`, limit: 20, windowSec: 60 },
      { key: `rl:verify:ip:1h:${ip}`, limit: 100, windowSec: 3600 }
    ];
    for (const { key, limit, windowSec } of rlChecks) {
      const result = await checkRateLimit(key, limit, windowSec);
      if (!result.allowed) {
        return new NextResponse(
          JSON.stringify({ error: 'Too many requests', retryAt: new Date(result.reset).toISOString() }),
          { status: 429, headers: corsHeaders }
        );
      }
    }
    // Check if cart is locked via DB lock table
    const lockRecord = await getLock(cartId);
    if (lockRecord) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many invalid attempts. Please try again later.' }),
        { status: 423, headers: corsHeaders }
      );
    }
    // Fetch OTP record from DB
    const record = await getOtp(cartId);
    if (!record) {
      return new NextResponse(JSON.stringify({ error: 'OTP expired' }), { status: 410, headers: corsHeaders });
    }
    const nowMs = Date.now();
    const expiresAtMs = record.expires_at.getTime();
    if (nowMs >= expiresAtMs) {
      // expired; delete record
      await deleteOtp(cartId);
      return new NextResponse(JSON.stringify({ error: 'OTP expired' }), { status: 410, headers: corsHeaders });
    }
    // Check attempt count
    let attempts = record.attempts;
    if (attempts >= ATTEMPT_LIMIT) {
      // lock and delete code
      await deleteOtp(cartId);
      const lockUntil = new Date(nowMs + OTP_LOCK_SECONDS * 1000);
      await setLock(cartId, lockUntil);
      return new NextResponse(
        JSON.stringify({ error: 'Too many attempts. Please request a new code after some time.' }),
        { status: 423, headers: corsHeaders }
      );
    }
    const match = verifyCode(code, record.code_hash, HMAC_SECRET);
    if (!match) {
      attempts += 1;
      // Update attempts and keep same expiry
      const updatedRecord = {
        ...record,
        attempts
      };
      await saveOtp(updatedRecord);
      if (attempts >= ATTEMPT_LIMIT) {
        // lock for 15 minutes and delete OTP
        await deleteOtp(cartId);
        const lockUntil = new Date(nowMs + OTP_LOCK_SECONDS * 1000);
        await setLock(cartId, lockUntil);
        return new NextResponse(
          JSON.stringify({ error: 'Too many attempts. Please request a new code after some time.' }),
          { status: 423, headers: corsHeaders }
        );
      }
      return new NextResponse(JSON.stringify({ error: 'Invalid code' }), { status: 401, headers: corsHeaders });
    }
    // success: verification passes
    const phoneE164: string = record.phone_e164;
    await deleteOtp(cartId);
    // mark verified in DB
    const verifiedAt = new Date(nowMs);
    const expiresAt = new Date(nowMs + VERIFIED_TTL_SECONDS * 1000);
    await setVerified(cartId, phoneE164, verifiedAt, expiresAt);
    // issue JWT token
    const token = signToken({ cartId, phone: phoneE164 }, VERIFIED_TTL_SECONDS);
    // Build response and set cookie
    const res = NextResponse.json({ token }, { status: 200, headers: corsHeaders });
    res.cookies.set({
      name: 'otp_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: VERIFIED_TTL_SECONDS
    });
    log('info', 'OTP verified', { cartId, requestId, phone: phoneE164 });
    return res;
  } catch (err: any) {
    log('error', 'OTP verify error', { requestId, error: err?.message });
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
}