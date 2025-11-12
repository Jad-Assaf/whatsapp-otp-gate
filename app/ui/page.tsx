/*
 * UI home page to navigate to test pages for each API route. This page
 * provides simple links to other pages under the `/ui` namespace to
 * test the OTP start, verify, checkout-url, and health endpoints.
 */

'use client';

import Link from 'next/link';

export default function UiHome() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>OTP Gate Test UI</h1>
      <p>
        Use the links below to test each API endpoint. These pages
        include simple forms that call your backend routes and display
        the results.
      </p>
      <ul style={{ lineHeight: '1.8' }}>
        <li>
          <Link href="/ui/otp-start">Start OTP (POST /api/otp/start)</Link>
        </li>
        <li>
          <Link href="/ui/otp-verify">Verify OTP (POST /api/otp/verify)</Link>
        </li>
        <li>
          <Link href="/ui/checkout-url">Get Checkout URL (POST /api/checkout-url)</Link>
        </li>
        <li>
          <Link href="/ui/health">Health Check (GET /health)</Link>
        </li>
      </ul>
    </div>
  );
}