import { NextResponse, NextRequest } from 'next/server';
// import DB store instead of Vercel KV
import { getOtp, saveOtp, deleteOtp } from '@/lib/store';
import { normalizePhone } from '@/lib/phone';
import { generateCode, hashCode } from '@/lib/otp';
import { log } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rateLimit';
import { headers as nextHeaders } from 'next/headers';
import crypto from 'crypto';

// Environment configuration
const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_COOLDOWN_MS = 45 * 1000; // 45 seconds between sends
const ATTEMPT_LIMIT = 5;

const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
const META_TOKEN = process.env.META_TOKEN || '';
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
    const phoneRaw = String(body.phone || '').trim();
    if (!cartId) {
      return new NextResponse(JSON.stringify({ error: 'cartId is required' }), { status: 400, headers: corsHeaders });
    }
    if (!phoneRaw) {
      return new NextResponse(JSON.stringify({ error: 'phone is required' }), { status: 400, headers: corsHeaders });
    }
    // Normalize phone
    let phoneE164: string;
    try {
      phoneE164 = normalizePhone(phoneRaw);
    } catch (err) {
      return new NextResponse(JSON.stringify({ error: 'Invalid phone number' }), { status: 400, headers: corsHeaders });
    }
    // Rate limiting per IP and per phone
    const rlChecks: Array<{ key: string; limit: number; windowSec: number }> = [
      { key: `rl:ip:1m:${ip}`, limit: 3, windowSec: 60 },
      { key: `rl:ip:1h:${ip}`, limit: 10, windowSec: 3600 },
      { key: `rl:phone:1m:${phoneE164}`, limit: 3, windowSec: 60 },
      { key: `rl:phone:1h:${phoneE164}`, limit: 10, windowSec: 3600 }
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
    // Check existing OTP in the database
    const existing = await getOtp(cartId);
    if (existing) {
      const now = Date.now();
      const expiresAt = existing.expires_at.getTime();
      const resendAt = existing.resend_at.getTime();
      if (now < expiresAt) {
        // OTP still valid
        if (now < resendAt) {
          // resend too soon
          return new NextResponse(
            JSON.stringify({ challengeId: cartId, resendAt: resendAt }),
            { status: 429, headers: corsHeaders }
          );
        }
        // We will overwrite with a new code below. Deleting is unnecessary because saveOtp uses upsert.
      } else {
        // expired; remove old record
        await deleteOtp(cartId);
      }
    }
    // Generate new code and record
    const code = generateCode();
    const codeHash = hashCode(code, HMAC_SECRET);
    const nowMs = Date.now();
    const createdAt = new Date(nowMs);
    const expiresAtDate = new Date(nowMs + OTP_TTL_SECONDS * 1000);
    const resendAtDate = new Date(nowMs + OTP_COOLDOWN_MS);
    const newRecord = {
      cart_id: cartId,
      phone_e164: phoneE164,
      code_hash: codeHash,
      attempts: 0,
      created_at: createdAt,
      expires_at: expiresAtDate,
      resend_at: resendAtDate,
      request_ip: ip
    };
    // Persist to DB (upsert)
    await saveOtp(newRecord);
    // Send WhatsApp using authentication template "otp3".  The template has two body parameters: the OTP code and the recipient
    // phone number (including the leading plus sign).  It also includes two buttons: a dynamic URL button and a copy
    // code button, both of which take the OTP code as their parameter.  See the user‑provided template definition.
    const metaUrl = `https://graph.facebook.com/v23.0/${META_PHONE_NUMBER_ID}/messages`;
    const toNumber = phoneE164.replace(/^\+/, '');
    const phoneWithPlus = phoneE164.startsWith('+') ? phoneE164 : `+${phoneE164}`;
    const payload = {
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'template',
      template: {
        name: 'otp3',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: code },
              { type: 'text', text: phoneWithPlus }
            ]
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              { type: 'text', text: code }
            ]
          },
          {
            type: 'button',
            sub_type: 'copy_code',
            index: '1',
            parameters: [
              { type: 'text', text: code }
            ]
          }
        ]
      }
    };
    let sendOk = false;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${META_TOKEN}`
          },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          sendOk = true;
          break;
        } else {
          const text = await res.text();
          lastErr = new Error(`Meta API failed: ${res.status} ${text}`);
        }
      } catch (err) {
        lastErr = err;
      }
      // exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    if (!sendOk) {
      // don't leak OTP; remove key to allow client to retry
      await deleteOtp(cartId);
      log('error', 'Failed to send WhatsApp message', { cartId, requestId, phone: phoneE164, error: lastErr?.message });
      return new NextResponse(JSON.stringify({ error: 'Failed to send OTP' }), { status: 500, headers: corsHeaders });
    }
    log('info', 'OTP started', { cartId, requestId, phone: phoneE164 });
    return new NextResponse(
      JSON.stringify({ challengeId: cartId, resendAt: newRecord.resend_at.getTime() }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    log('error', 'OTP start error', { requestId, error: err?.message });
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
}