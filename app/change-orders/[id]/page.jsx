"use client";
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ChangeOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;

  const [cor, setCor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lineItems, setLineItems] = useState([{ name: '', price: '' }]);
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    if (!id) return;
    setLoading(true);
    fetch(`/api/change-order-requests/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Not found');
        return d;
      })
      .then(d => {
        setCor(d);
        if (Array.isArray(d.line_items) && d.line_items.length) {
          setLineItems(d.line_items.map(li => ({
            name: li.name || li.description || '',
            price: li.price != null ? String(li.price) : (li.amount != null ? String(li.amount) : ''),
          })));
        }
        if (d.amount != null) setAmount(String(d.amount));
      })
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, token, router]);

  useEffect(() => {
    const sum = lineItems.reduce((acc, li) => acc + (parseFloat(li.price) || 0), 0);
    if (lineItems.some(li => li.price !== '')) setAmount(sum.toFixed(2));
  }, [lineItems]);

  const updateLine = (idx, field, value) => {
    setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  };

  const runAction = async (action) => {
    if (!token || !id) return;
    if ((action === 'send_to_customer' || action === 'auto_approve') && !(parseFloat(amount) > 0)) {
      setMsg('Enter a total amount greater than zero.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/change-order-requests/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          amount: parseFloat(amount) || 0,
          line_items: lineItems
            .filter(li => (li.name || '').trim())
            .map(li => ({ name: li.name.trim(), price: parseFloat(li.price) || 0 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setMsg(
        action === 'reject' ? 'Rejected.'
          : action === 'auto_approve' ? 'Approved for crew — customer not billed from this screen.'
          : 'Sent to customer for approval & pay.'
      );
      // Refresh
      const refreshed = await fetch(`/api/change-order-requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      setCor(refreshed);
    } catch (e) {
      setMsg(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Change Order">
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      </AppShell>
    );
  }

  if (error || !cor) {
    return (
      <AppShell title="Change Order">
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <p className="text-v-text-primary mb-2">{error || 'Not found'}</p>
          <a href="/change-orders" className="text-v-gold text-sm hover:underline">Back to Change Orders</a>
        </div>
      </AppShell>
    );
  }

  const pending = cor.status === 'pending_review';

  return (
    <AppShell title="Change Order">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <a href="/change-orders" className="text-v-gold text-sm hover:underline">← Change Orders</a>
          <h1 className="text-2xl font-light tracking-wide text-v-text-primary mt-3">Review Change Order</h1>
          <p className="text-v-text-secondary text-sm mt-1">
            Reported by {cor.team_member_name || 'crew'}
            {cor.created_at ? ` · ${new Date(cor.created_at).toLocaleString()}` : ''}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-amber-400 mt-2">{(cor.status || '').replace(/_/g, ' ')}</p>
        </div>

        <div className="border border-v-border rounded-xl p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-v-text-secondary">Description</p>
          <p className="text-v-text-primary text-sm whitespace-pre-wrap">{cor.description}</p>
          {cor.photo_url && (
            <a href={cor.photo_url} target="_blank" rel="noreferrer" className="block">
              <img src={cor.photo_url} alt="Issue" className="max-h-64 rounded-lg border border-v-border object-contain" />
            </a>
          )}
          {(cor.job_id || cor.quote_id) && (
            <p className="text-v-text-secondary text-xs">
              {cor.job_id ? <>Job <a className="text-v-gold hover:underline" href={`/jobs/${cor.job_id}`}>{cor.job_id.slice(0, 8)}…</a></> : null}
              {cor.job_id && cor.quote_id ? ' · ' : ''}
              {cor.quote_id ? <>Quote <a className="text-v-gold hover:underline" href={`/quotes`}>{cor.quote_id.slice(0, 8)}…</a></> : null}
            </p>
          )}
        </div>

        <div className="border border-v-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-v-text-secondary">Line items & price</p>
            {pending && (
              <button
                type="button"
                onClick={() => setLineItems(prev => [...prev, { name: '', price: '' }])}
                className="text-v-gold text-xs hover:underline"
              >
                + Add line
              </button>
            )}
          </div>
          {lineItems.map((li, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                disabled={!pending}
                value={li.name}
                onChange={e => updateLine(idx, 'name', e.target.value)}
                placeholder="Service name"
                className="flex-1 bg-v-charcoal border border-v-border text-v-text-primary px-3 py-2 text-sm rounded-lg disabled:opacity-60"
              />
              <div className="flex items-center gap-1">
                <span className="text-v-text-secondary text-sm">$</span>
                <input
                  disabled={!pending}
                  type="number"
                  step="0.01"
                  value={li.price}
                  onChange={e => updateLine(idx, 'price', e.target.value)}
                  placeholder="0.00"
                  className="w-24 bg-v-charcoal border border-v-border text-v-text-primary px-2 py-2 text-sm text-right rounded-lg disabled:opacity-60"
                />
              </div>
              {pending && lineItems.length > 1 && (
                <button type="button" onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 text-lg leading-none px-1">&times;</button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-v-border">
            <span className="text-v-text-secondary text-sm">Total</span>
            <div className="flex items-center gap-1">
              <span className="text-v-text-secondary">$</span>
              <input
                disabled={!pending}
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-28 bg-v-charcoal border border-v-border text-v-text-primary px-2 py-2 text-sm text-right rounded-lg font-semibold disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {msg && (
          <p className="text-sm text-v-gold">{msg}</p>
        )}

        {pending ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              disabled={saving}
              onClick={() => runAction('send_to_customer')}
              className="flex-1 px-4 py-3 bg-v-gold text-white font-medium rounded-lg hover:bg-v-gold-dim disabled:opacity-50"
            >
              {saving ? 'Working…' : 'Send to Customer'}
            </button>
            <button
              disabled={saving}
              onClick={() => runAction('auto_approve')}
              className="flex-1 px-4 py-3 border border-v-border text-v-text-primary rounded-lg hover:bg-white/5 disabled:opacity-50"
            >
              Approve without billing
            </button>
            <button
              disabled={saving}
              onClick={() => {
                if (confirm('Reject this change order request?')) runAction('reject');
              }}
              className="px-4 py-3 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        ) : (
          <p className="text-v-text-secondary text-sm">This request is no longer awaiting owner review.</p>
        )}
      </div>
    </AppShell>
  );
}
