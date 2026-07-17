"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

export default function FleetIndexPage() {
  const router = useRouter();
  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetch('/api/aircraft', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setAircraft(d?.aircraft || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router]);

  // Group by aircraft_model (section header); models sorted, tails sorted within.
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = aircraft.filter((a) => {
      if (!term) return true;
      return `${a.aircraft_model || ''} ${a.tail_number || ''} ${a.customer_name || ''}`.toLowerCase().includes(term);
    });
    const byModel = {};
    for (const a of filtered) {
      const key = a.aircraft_model || 'Unspecified model';
      (byModel[key] = byModel[key] || []).push(a);
    }
    return Object.entries(byModel)
      .map(([model, rows]) => [model, rows.slice().sort((x, y) => (x.tail_number || '').localeCompare(y.tail_number || ''))])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [aircraft, query]);

  if (loading) return <AppShell><LoadingSpinner /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-light text-white">Fleet</h1>
          <p className="text-sm text-v-text-secondary mt-1">
            {aircraft.length} aircraft on file across your customers
          </p>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search model, tail number, or customer"
          className="w-full mb-6 bg-v-surface border border-v-border text-v-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold/50"
        />

        {groups.length === 0 ? (
          <p className="text-sm text-v-text-secondary text-center py-12">
            {aircraft.length === 0 ? 'No aircraft on file yet.' : 'No aircraft match your search.'}
          </p>
        ) : (
          <div className="space-y-8">
            {groups.map(([model, rows]) => (
              <section key={model}>
                <div className="flex items-baseline justify-between border-b border-v-border pb-2 mb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-v-gold">{model}</h2>
                  <span className="text-xs text-v-text-secondary">{rows.length} tail{rows.length === 1 ? '' : 's'}</span>
                </div>
                <div className="divide-y divide-v-border">
                  {rows.map((a) => (
                    <div key={a.id || a.tail_number} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/aircraft/${encodeURIComponent(a.tail_number)}`}
                          className="text-v-text-primary font-mono hover:text-v-gold transition-colors"
                        >
                          {a.tail_number}
                        </Link>
                        {a.customer_name && (
                          <span className="text-v-text-secondary text-sm ml-3">
                            {a.customer_id ? (
                              <Link href={`/customers/${a.customer_id}`} className="hover:text-v-gold transition-colors">
                                {a.customer_name}
                              </Link>
                            ) : (
                              a.customer_name
                            )}
                          </span>
                        )}
                      </div>
                      {a.job_count > 0 && (
                        <div className="text-right text-xs text-v-text-secondary whitespace-nowrap">
                          {a.job_count} job{a.job_count === 1 ? '' : 's'}
                          {' · '}
                          <span className="text-v-gold">{currencySymbol()}{formatPrice(a.total_revenue)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
