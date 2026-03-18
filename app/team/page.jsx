"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchMembers(token);
  }, [router]);

  const fetchMembers = async (token) => {
    try {
      const res = await fetch('/api/team', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setMembers(data.members || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeCount = members.filter(m => m.status === 'active').length;
  const employeeCount = members.filter(m => m.type === 'employee').length;
  const contractorCount = members.filter(m => m.type === 'contractor').length;
  const totalHours = members.reduce((sum, m) => sum + (m.total_hours || 0), 0);
  const totalPay = members.reduce((sum, m) => sum + (m.total_pay || 0), 0);

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <a href="/dashboard" className="text-white text-2xl">&#8592;</a>
          <h1 className="text-2xl font-bold text-white">{'Team'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/team/permissions"
            className="px-4 py-2 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-colors font-medium text-sm"
          >
            {'Permissions'}
          </a>
          <a
            href="/team/add"
            className="px-4 py-2 bg-v-gold-muted/200 text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium"
          >
            {'+ Add Member'}
          </a>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
          <p className="text-white/60 text-xs">{'Total Hours'}</p>
          <p className="text-white text-xl font-bold">{totalHours.toFixed(1)}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Total Pay'}</p>
          <p className="text-white text-xl font-bold">{currencySymbol()}{formatPrice(totalPay)}</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-white text-center py-12">{'Loading team...'}</div>
      ) : error ? (
        <div className="bg-red-900/200/20 border border-red-500/50 rounded-lg p-4 text-red-200">{error}</div>
      ) : members.length === 0 ? (
        <div className="bg-white/10 rounded-lg p-8 text-center">
          <p className="text-white/60 text-lg mb-4">{'No team members yet'}</p>
          <a
            href="/team/add"
            className="px-6 py-3 bg-v-gold-muted/200 text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium inline-block"
          >
            {'Add Your First Team Member'}
          </a>
        </div>
      ) : (
        <div className="bg-v-surface rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-v-charcoal text-left text-sm text-v-text-secondary">
                <th className="px-4 py-3 font-medium">{'Name'}</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">{'Role'}</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">{'Rate'}</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">{'Hours'}</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">{'Total Pay'}</th>
                <th className="px-4 py-3 font-medium">{'Status'}</th>
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
                    <div className="text-xs text-v-text-secondary sm:hidden">{member.type}</div>
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
                    {(member.total_hours || 0).toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-v-text-secondary hidden sm:table-cell">
                    ${formatPrice(member.total_pay)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      member.status === 'active' ? 'bg-green-900/200' : 'bg-gray-400'
                    }`} />
                    <span className="ml-2 text-sm text-v-text-secondary hidden sm:inline">{member.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
