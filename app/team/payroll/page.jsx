"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

function defaultDates() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startD = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000);
  const start = startD.toISOString().slice(0, 10);
  return { start, end };
}

export default function PayrollPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const defaults = defaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  const fetchPayroll = async () => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/team/payroll?start_date=${startDate}&end_date=${endDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load payroll');
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = (e) => {
    e.preventDefault();
    fetchPayroll();
  };

  const downloadCsv = () => {
    if (!data) return;
    const rows = [];
    rows.push(['Name', 'Title', 'Type', 'Job', 'Hours', 'Hourly Rate', 'Job Pay', 'Member Total Hours', 'Member Total Pay']);
    for (const m of data.members) {
      if (m.jobs.length === 0) {
        rows.push([m.name, m.title || '', m.type || '', '', 0, m.hourly_pay, 0, m.total_hours, m.total_pay]);
        continue;
      }
      for (let i = 0; i < m.jobs.length; i++) {
        const j = m.jobs[i];
        const jobPay = Math.round(j.hours * m.hourly_pay * 100) / 100;
        if (i === 0) {
          rows.push([m.name, m.title || '', m.type || '', j.label, j.hours, m.hourly_pay, jobPay, m.total_hours, m.total_pay]);
        } else {
          rows.push(['', '', '', j.label, j.hours, m.hourly_pay, jobPay, '', '']);
        }
      }
    }
    rows.push([]);
    rows.push(['TOTAL', '', '', '', data.total_hours, '', data.total_pay, '', '']);

    const csv = rows
      .map(r => r.map(v => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const cls = 'bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50';

  return (
    <AppShell title="Payroll">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px]">
        <header className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <a href="/team" className="text-v-text-secondary text-xs hover:text-white">&larr;</a>
              <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>PAYROLL</h1>
            </div>
            <p className="text-v-text-secondary text-xs mt-1 ml-4">Hours worked and pay owed per crew member</p>
          </div>
          {data && (
            <button
              onClick={downloadCsv}
              className="px-4 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium text-sm"
            >
              Export CSV
            </button>
          )}
        </header>

        {/* Date range picker */}
        <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">Start date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={cls} />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">End date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={cls} />
          </div>
          <button type="submit" className="px-5 py-2 bg-white/10 border border-white/20 text-white rounded-lg text-sm hover:bg-white/15 transition-colors">
            Apply
          </button>
        </form>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 text-red-200 mb-4">{error}</div>
        )}

        {/* Summary stats */}
        {data && !loading && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-v-surface border border-v-border rounded-lg p-4">
              <p className="text-v-text-secondary text-[10px] uppercase tracking-wider">Total Hours</p>
              <p className="text-v-text-primary text-2xl font-bold mt-1">{data.total_hours.toFixed(1)}h</p>
            </div>
            <div className="bg-v-surface border border-v-border rounded-lg p-4">
              <p className="text-v-text-secondary text-[10px] uppercase tracking-wider">Total Pay</p>
              <p className="text-v-text-primary text-2xl font-bold mt-1">{currencySymbol()}{formatPrice(data.total_pay)}</p>
            </div>
            <div className="bg-v-surface border border-v-border rounded-lg p-4">
              <p className="text-v-text-secondary text-[10px] uppercase tracking-wider">Crew Members</p>
              <p className="text-v-text-primary text-2xl font-bold mt-1">{data.members.length}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-white text-center py-12">Loading payroll...</div>
        ) : data && data.members.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-lg p-8 text-center">
            <p className="text-v-text-secondary text-sm">No time entries in this date range</p>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {data.members.map(m => (
              <div key={m.team_member_id} className="bg-v-surface border border-v-border rounded-lg overflow-hidden">
                {/* Member header */}
                <div className="px-5 py-4 bg-v-charcoal/50 border-b border-v-border flex items-center justify-between">
                  <div>
                    <p className="text-v-text-primary font-semibold">{m.name}</p>
                    <p className="text-v-text-secondary text-xs">
                      {m.title || m.type || 'Team member'} · {currencySymbol()}{m.hourly_pay}/hr
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-v-text-primary font-bold text-lg">{m.total_hours.toFixed(2)}h</p>
                    <p className="text-v-gold text-sm font-semibold">{currencySymbol()}{formatPrice(m.total_pay)}</p>
                  </div>
                </div>
                {/* Per-job breakdown */}
                <div className="divide-y divide-v-border/50">
                  {m.jobs.map(j => {
                    const jobPay = Math.round(j.hours * m.hourly_pay * 100) / 100;
                    return (
                      <div key={j.job_id} className="px-5 py-3 flex items-center justify-between">
                        <p className="text-v-text-primary text-sm">{j.label}</p>
                        <div className="text-right">
                          <p className="text-v-text-secondary text-xs">{j.hours.toFixed(2)}h</p>
                          <p className="text-v-text-secondary text-[10px]">{currencySymbol()}{formatPrice(jobPay)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
