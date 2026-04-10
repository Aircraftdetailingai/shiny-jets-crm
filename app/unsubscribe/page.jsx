"use client";
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function UnsubscribePage() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const e = params.get('email');
    if (e) setEmail(e);
  }, [params]);

  const handleUnsubscribe = async () => {
    if (!email) { setError('Email required'); return; }
    setStatus('loading'); setError('');
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setStatus('done');
      else { const d = await res.json(); setError(d.error || 'Failed'); setStatus('idle'); }
    } catch (err) { setError(err.message); setStatus('idle'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <div style={{ background: '#0f1623', border: '1px solid #1a2236', borderRadius: 12, padding: 40, maxWidth: 480, width: '100%' }}>
        <h1 style={{ color: '#fff', fontSize: 24, margin: '0 0 8px', fontWeight: 600 }}>Unsubscribe</h1>
        <p style={{ color: '#8a9bb0', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
          You can unsubscribe from marketing and promotional emails. Transactional messages (quotes, invoices, payment receipts) will still be sent.
        </p>

        {status === 'done' ? (
          <div style={{ background: '#10391e', border: '1px solid #1a5e34', borderRadius: 8, padding: 16, color: '#5dd97e' }}>
            You've been unsubscribed from marketing emails.
          </div>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ width: '100%', padding: '12px 14px', background: '#1a2236', border: '1px solid #2a3548', borderRadius: 8, color: '#fff', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
            />
            {error && <p style={{ color: '#ff6b6b', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
            <button
              onClick={handleUnsubscribe}
              disabled={status === 'loading'}
              style={{ width: '100%', padding: '12px', background: '#007CB1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: status === 'loading' ? 0.5 : 1 }}
            >
              {status === 'loading' ? 'Unsubscribing...' : 'Unsubscribe'}
            </button>
          </>
        )}

        <p style={{ color: '#5a6a80', fontSize: 11, margin: '24px 0 0', textAlign: 'center' }}>
          Shiny Jets LLC &middot; Chino Airport, Chino, CA 91708
        </p>
      </div>
    </div>
  );
}
