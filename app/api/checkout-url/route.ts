import { NextResponse, NextRequest } from 'next/server';
import { getVerified } from '@/lib/store';
import { verifyToken } from '@/lib/auth';
import { getCheckoutUrl } from '@/lib/shopify';
import { log } from '@/lib/logger';
import crypto from 'crypto';

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
    const body = await req.json();
    const cartId = String(body.cartId || '').trim();
    if (!cartId) {
      return new NextResponse(JSON.stringify({ error: 'cartId is required' }), { status: 400, headers: corsHeaders });
    }
    // Extract token from cookie or Authorization header
    let token: string | undefined;
    // Try cookie via NextRequest
    const cookieToken = req.cookies.get('otp_token');
    if (cookieToken) {
      token = cookieToken.value;
    }
    // Fallback to Authorization header (Bearer token)
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }
    if (!token) {
      return new NextResponse(JSON.stringify({ error: 'Not verified' }), { status: 403, headers: corsHeaders });
    }
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return new NextResponse(JSON.stringify({ error: 'Invalid token' }), { status: 403, headers: corsHeaders });
    }
    if (!payload || payload.cartId !== cartId) {
      return new NextResponse(JSON.stringify({ error: 'Invalid token' }), { status: 403, headers: corsHeaders });
    }
    // Check verification flag in database
    const verified = await getVerified(cartId);
    if (!verified) {
      return new NextResponse(JSON.stringify({ error: 'Not verified' }), { status: 403, headers: corsHeaders });
    }
    // Optionally compare phone between token and verified; we trust token
    // Fetch checkout URL from Shopify
    let checkoutUrl: string;
    try {
      checkoutUrl = await getCheckoutUrl(cartId);
    } catch (err: any) {
      log('error', 'Failed to fetch checkoutUrl', { cartId, requestId, error: err?.message });
      return new NextResponse(JSON.stringify({ error: 'Failed to retrieve checkout URL' }), { status: 500, headers: corsHeaders });
    }
    log('info', 'Returning checkout URL', { cartId, requestId });
    return new NextResponse(JSON.stringify({ checkoutUrl }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    log('error', 'Checkout URL error', { requestId, error: err?.message });
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
}