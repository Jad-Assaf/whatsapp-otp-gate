/*
 * UI page to test the `/api/checkout-url` endpoint. Users can input a
 * cart ID and request the checkout URL. The request is made with
 * credentials so that the OTP verification cookie (set by the
 * verify endpoint) is sent. The response displays the checkout URL
 * or any error.
 */

'use client';

import { useState } from 'react';

export default function CheckoutUrlPage() {
  const [cartId, setCartId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/checkout-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cartId: cartId.trim() })
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
      <h1>Get Checkout URL</h1>
      <p>Return the Shopify checkout URL after verifying the OTP.</p>
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
        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : 'Get Checkout URL'}
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