/*
 * UI page to test the `/api/otp/start` endpoint. Provides a form
 * allowing the user to enter a cart ID and phone number. On submit,
 * it calls the start endpoint and displays the response or any
 * error messages. This page runs on the client, using React state
 * to manage inputs and results.
 */

'use client';

import { useState } from 'react';

export default function OtpStartPage() {
  const [cartId, setCartId] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/otp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId: cartId.trim(), phone: phone.trim() })
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
      <h1>Start OTP</h1>
      <p>Send a verification code to the customer via WhatsApp.</p>
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
            Phone (E.164):&nbsp;
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+961..."
              style={{ width: '300px' }}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Start OTP'}
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