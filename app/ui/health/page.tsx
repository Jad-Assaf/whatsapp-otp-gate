/*
 * UI page to test the health endpoint (GET /health). This page
 * includes a button that requests the health route and displays
 * the response. It demonstrates basic fetch usage and error
 * handling.
 */

'use client';

import { useState } from 'react';

export default function HealthTestPage() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/health');
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
      <h1>Health Check</h1>
      <p>Call the /health endpoint to verify the server is running.</p>
      <button onClick={handleClick} disabled={loading}>
        {loading ? 'Checking...' : 'Check Health'}
      </button>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {result && (
        <div style={{ whiteSpace: 'pre-wrap', background: '#f4f4f4', padding: '1rem', marginTop: '1rem' }}>
          <h3>Response</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}