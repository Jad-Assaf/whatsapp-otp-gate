/*
 * UI page to test the `/api/otp/verify` endpoint. Users can input a
 * cart ID and the received OTP code. This page sends the POST
 * request with credentials included (so the verification cookie is
 * stored) and displays the response or any error.
 */

'use client';

import { useState } from 'react';

export default function OtpVerifyPage() {
  const [cartId, setCartId] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cartId: cartId.trim(), code: code.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Request failed');
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Verify OTP</h1>
      <p>Submit the 6‑digit verification code sent to the customer.</p>
      <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            Cart ID:&nbsp;
            <input
              type="text"
              value={cartId}
              onChange={(e) => setCartId(e.target.value)}
              style={{ width: '300px' }}
              required
            />
          </label>
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            OTP Code:&nbsp;
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              style={{ width: '300px' }}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify OTP'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {result && (
        <div style={{ whiteSpace: 'pre-wrap', background: '#f4f4f4', padding: '1rem' }}>
          <h3>Response</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}