"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ROLES,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
  SCHEDULE_OPTIONS,
  DEFAULT_PERMISSIONS,
} from '../../../lib/permissions';

const BOOLEAN_PERMISSIONS = [
  'can_see_customer_contact',
  'can_see_aircraft_owner',
  'can_see_pricing',
  'can_see_equipment_cost',
  'can_see_inventory',
  'can_upload_photos',
  'can_see_dashboard',
];

const editableRoles = ROLES.filter(r => r.value !== 'owner');

export default function TeamPermissionsPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchPermissions(token);
  }, [router]);

  const fetchPermissions = async (token) => {
    try {
      const res = await fetch('/api/team/permissions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions);
      } else {
        // If table doesn't exist yet, use defaults
        setPermissions({ ...DEFAULT_PERMISSIONS });
      }
    } catch (err) {
      setPermissions({ ...DEFAULT_PERMISSIONS });
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (role, perm) => {
    if (role === 'owner') return; // Owner always has everything
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [perm]: !prev[role][perm],
      },
    }));
    setSaved(false);
  };

  const setScheduleDays = (role, days) => {
    if (role === 'owner') return;
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        schedule_visibility_days: days,
      },
    }));
    setSaved(false);
  };

  const resetToDefaults = () => {
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setSaved(false);
  };

  const savePermissions = async () => {
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/team/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 flex items-center justify-center">
        <div className="text-white text-lg">{'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <a href="/team" className="text-white text-2xl">&#8592;</a>
          <div>
            <h1 className="text-2xl font-bold text-white">{'Permissions'}</h1>
            <p className="text-white/60 text-sm">{'Control what each role can see and do'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 text-white/70 border border-white/20 rounded-lg hover:bg-white/10 transition-colors text-sm"
          >
            {'Reset Defaults'}
          </button>
          <button
            onClick={savePermissions}
            disabled={saving}
            className={`px-6 py-2 rounded-lg font-medium transition-all text-sm ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50'
            }`}
          >
            {saving ? 'Saving...' : saved ? 'Settings saved' : 'Save'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 mb-4 text-sm">{error}</div>
      )}

      {/* Permissions Matrix */}
      <div className="bg-white rounded-lg overflow-x-auto shadow">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-[220px]">{'Permissions'}</th>
              {ROLES.map(role => (
                <th key={role.value} className="px-3 py-3 text-center text-sm font-semibold text-gray-700">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    role.value === 'owner' ? 'bg-amber-100 text-amber-800' :
                    role.value === 'manager' ? 'bg-indigo-100 text-indigo-700' :
                    role.value === 'lead_tech' ? 'bg-cyan-100 text-cyan-700' :
                    role.value === 'contractor' ? 'bg-purple-100 text-purple-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {role.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Boolean permissions */}
            {BOOLEAN_PERMISSIONS.map((perm) => (
              <tr key={perm} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{PERMISSION_LABELS[perm]}</div>
                  <div className="text-xs text-gray-500">{PERMISSION_DESCRIPTIONS[perm]}</div>
                </td>
                {ROLES.map(role => {
                  const val = permissions?.[role.value]?.[perm];
                  const isOwner = role.value === 'owner';
                  return (
                    <td key={role.value} className="px-3 py-3 text-center">
                      <button
                        onClick={() => togglePermission(role.value, perm)}
                        disabled={isOwner}
                        className={`w-10 h-6 rounded-full relative transition-colors ${
                          isOwner ? 'cursor-not-allowed' : 'cursor-pointer'
                        } ${val ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          val ? 'left-[18px]' : 'left-0.5'
                        }`} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Schedule visibility */}
            <tr className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="text-sm font-medium text-gray-900">{PERMISSION_LABELS.schedule_visibility_days}</div>
                <div className="text-xs text-gray-500">{PERMISSION_DESCRIPTIONS.schedule_visibility_days}</div>
              </td>
              {ROLES.map(role => {
                const val = permissions?.[role.value]?.schedule_visibility_days;
                const isOwner = role.value === 'owner';
                return (
                  <td key={role.value} className="px-3 py-3 text-center">
                    <select
                      value={val ?? -1}
                      onChange={(e) => setScheduleDays(role.value, parseInt(e.target.value))}
                      disabled={isOwner}
                      className={`text-xs border rounded px-2 py-1 ${isOwner ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    >
                      {SCHEDULE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 bg-white/10 rounded-lg p-4">
        <h3 className="text-white/80 text-sm font-semibold mb-3">{'Role Descriptions'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.map(role => (
            <div key={role.value} className="flex items-start gap-2">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${
                role.value === 'owner' ? 'bg-amber-100 text-amber-800' :
                role.value === 'manager' ? 'bg-indigo-100 text-indigo-700' :
                role.value === 'lead_tech' ? 'bg-cyan-100 text-cyan-700' :
                role.value === 'contractor' ? 'bg-purple-100 text-purple-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {role.label}
              </span>
              <p className="text-white/60 text-xs">
                {role.value === 'owner' && 'Full access to everything. Cannot be restricted.'}
                {role.value === 'manager' && 'Day-to-day operations. Full schedule and customer access.'}
                {role.value === 'lead_tech' && 'Senior technician. Customer contact and limited schedule.'}
                {role.value === 'employee' && 'Standard worker. Today\'s jobs and photo uploads only.'}
                {role.value === 'contractor' && 'External contractor. Today\'s jobs and photo uploads only.'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
