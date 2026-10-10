"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';
import AppShell from '@/components/AppShell';
import OpenShiftsPanel from '@/components/OpenShiftsPanel';

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(null);
  const [resendMsg, setResendMsg] = useState('');
  const [liveStatus, setLiveStatus] = useState({});
  const [report, setReport] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchMembers(token);
    // Fetch live clock status — API returns { members: [{ id, clocked_in, ... }] }
    fetch('/api/team/live-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { members: [] })
      .then(d => {
        const map = {};
        const list = d.members || d.statuses || [];
        for (const s of list) map[s.id || s.team_member_id] = s;
        setLiveStatus(map);
      })
      .catch(() => {});
  }, [router]);

  const fetchMembers = async (token) => {
    try {
      const res = await fetch('/api/team', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setMembers(data.members || []);
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendInvite = async (memberId, e) => {
    e.stopPropagation();
    setResending(memberId);
    setResendMsg('');
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ member_id: memberId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setResendMsg(`Invite sent`);
      // Refresh list
      fetchMembers(token);
    } catch (err) {
      setResendMsg(`Failed: ${err.message}`);
    } finally {
      setResending(null);
      setTimeout(() => setResendMsg(''), 3000);
    }
  };

  const activeCount = members.filter(m => m.status === 'active').length;
  const employeeCount = members.filter(m => m.type === 'employee').length;
  const contractorCount = members.filter(m => m.type === 'contractor').length;
  const totalHours = report?.total_hours ?? members.reduce((sum, m) => sum + (m.total_hours || 0), 0);
  const totalPay = report?.total_pay ?? members.reduce((sum, m) => sum + (m.total_pay || 0), 0);
  const openEntries = report?.open_entries || [];
  const showLaborLink = report?.labor_totals && report.range_kind !== 'labor_window';

  return (
    <AppShell title="Team">
    <div className="px-4 sm:px-6 md:px-10 py-8 pb-40 max-w-[1400px]">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>TEAM</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/team/activity"
            className="inline-flex items-center min-h-[40px] px-4 py-2 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-colors font-medium text-sm"
          >
            {'Activity'}
          </a>
          <a
            href="/team/payroll"
            className="inline-flex items-center min-h-[40px] px-4 py-2 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-colors font-medium text-sm"
          >
            {'Payroll'}
          </a>
          <a
            href="/team/permissions"
            className="inline-flex items-center min-h-[40px] px-4 py-2 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-colors font-medium text-sm"
          >
            {'Permissions'}
          </a>
          <a
            href="/team/add"
            className="inline-flex items-center min-h-[40px] px-4 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium"
          >
            {'+ Add Member'}
          </a>
        </div>
      </header>

      {/* Toast */}
      {resendMsg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${resendMsg.startsWith('Failed') ? 'bg-red-900/30 text-red-300 border border-red-500/30' : 'bg-green-900/30 text-green-300 border border-green-500/30'}`}>
          {resendMsg}
        </div>
      )}

      {report?.range_label && (
        <div className="mb-4">
          <p className="text-v-text-primary text-sm" data-testid="labor-range-label">{report.range_label}</p>
          {report.period_note && <p className="text-v-text-secondary text-xs mt-1">{report.period_note}</p>}
          <p className="text-v-text-secondary text-xs mt-1">{report.open_shift_policy}</p>
          {showLaborLink && (
            <p className="text-xs text-v-text-secondary mt-2">
              <a href="/team/payroll?range=labor_window" className="text-v-gold hover:underline">
                All recorded labor: {report.labor_totals.total_hours.toFixed(1)}h · {currencySymbol()}{formatPrice(report.labor_totals.total_pay)}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Stats — hours and pay use the labeled range above, same as Payroll */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Active'}</p>
          <p className="text-white text-xl font-bold">{activeCount}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Employees'}</p>
          <p className="text-white text-xl font-bold">{employeeCount}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Contractors'}</p>
          <p className="text-white text-xl font-bold">{contractorCount}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Hours'}</p>
          <p className="text-white text-xl font-bold">{totalHours.toFixed(1)}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Pay'}</p>
          <p className="text-white text-xl font-bold">{currencySymbol()}{formatPrice(totalPay)}</p>
        </div>
        <div className={`rounded-lg p-3 text-center border ${openEntries.length ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/10 border-transparent'}`}>
          <p className={`text-xs ${openEntries.length ? 'text-amber-300' : 'text-white/60'}`}>{'Open shifts'}</p>
          <p className={`text-xl font-bold ${openEntries.length ? 'text-amber-300' : 'text-white'}`}>{openEntries.length}</p>
        </div>
      </div>

      {!loading && (
        <OpenShiftsPanel
          entries={openEntries}
          policy={report?.open_shift_policy}
          onClosed={() => {
            const token = localStorage.getItem('vector_token');
            if (token) fetchMembers(token);
          }}
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="text-white text-center py-12">{'Loading team...'}</div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 text-red-200">{error}</div>
      ) : members.length === 0 ? (
        <div className="bg-white/10 rounded-lg p-8 text-center">
          <p className="text-white/60 text-lg mb-4">{'No team members yet'}</p>
          <a
            href="/team/add"
            className="px-6 py-3 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium inline-block"
          >
            {'Add Team Member'}
          </a>
        </div>
      ) : (
        <div className="bg-v-surface rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-v-charcoal text-left text-sm text-v-text-secondary">
                <th className="px-4 py-3 font-medium">{'Name'}</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">{'Role'}</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">{'Rate'}</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">{'Hours'}</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">{'Pay'}</th>
                <th className="px-4 py-3 font-medium">{'Status'}</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">{'Invite'}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  onClick={() => router.push(`/team/${member.id}`)}
                  className="border-t border-v-border hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-v-text-primary">{member.name}</div>
                    {member.title && <div className="text-xs text-v-gold">{member.title}</div>}
                    <div className="text-xs text-v-text-secondary">{member.email || ''}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                      member.role === 'owner' ? 'bg-v-gold-muted/30 text-v-gold' :
                      member.role === 'manager' ? 'bg-indigo-900/30 text-indigo-400' :
                      member.role === 'lead_tech' ? 'bg-cyan-900/30 text-cyan-400' :
                      member.role === 'contractor' ? 'bg-purple-900/30 text-purple-400' :
                      'bg-blue-900/30 text-blue-400'
                    }`}>
                      {(member.role || member.type || '').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-v-text-secondary hidden md:table-cell">
                    ${parseFloat(member.hourly_pay || 0).toFixed(2)}{'/hr'}
                  </td>
                  <td className="px-4 py-3 text-v-text-secondary hidden md:table-cell">
                    {(member.total_hours || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-v-text-secondary hidden sm:table-cell">
                    ${formatPrice(member.total_pay)}
                  </td>
                  <td className="px-4 py-3">
                    {liveStatus[member.id]?.clocked_in === true ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Clocked In
                      </span>
                    ) : member.open_shifts > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 px-2 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                        Not clocked out
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-500" />
                        <span className="text-sm text-v-text-secondary hidden sm:inline">Off clock</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {member.email ? (
                      member.invite_status === 'accepted' ? (
                        <span className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded-full">Accepted</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded-full">Pending</span>
                          <button
                            onClick={(e) => resendInvite(member.id, e)}
                            disabled={resending === member.id}
                            className="text-xs px-3 py-1 bg-v-gold/20 text-v-gold border border-v-gold/30 rounded hover:bg-v-gold/30 transition-colors disabled:opacity-50"
                          >
                            {resending === member.id ? 'Sending...' : member.invite_sent_at ? 'Resend Invite' : 'Send Invite'}
                          </button>
                        </div>
                      )
                    ) : (
                      <span className="text-xs text-v-text-secondary">No email</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </AppShell>
  );
}
