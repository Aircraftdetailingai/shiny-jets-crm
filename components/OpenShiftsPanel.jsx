'use client';

import { useState } from 'react';
import { hoursBetween, LONG_SHIFT_HOURS, OPEN_SHIFT_POLICY } from '@/lib/labor-summary';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function suggestClockOut(entry) {
  const start = new Date(entry.clock_in);
  if (Number.isNaN(start.getTime())) return '';
  const now = new Date();
  const sameDay = start.toDateString() === now.toDateString();
  if (sameDay) return toDatetimeLocalValue(now.toISOString());
  return toDatetimeLocalValue(new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString());
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function OpenShiftRow({ entry, onClosed }) {
  const sameDay = (() => {
    const start = new Date(entry.clock_in);
    return !Number.isNaN(start.getTime()) && start.toDateString() === new Date().toDateString();
  })();
  const [clockOut, setClockOut] = useState(() => suggestClockOut(entry));
  const [confirmLong, setConfirmLong] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = clockOut
    ? hoursBetween(entry.clock_in, new Date(clockOut).toISOString())
    : null;
  const needsConfirm = preview != null && preview > LONG_SHIFT_HOURS && preview <= 24;

  const closeShift = async () => {
    setError('');
    if (!clockOut) {
      setError('Enter when this shift ended.');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/team/open-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entry_id: entry.id,
          clock_out: new Date(clockOut).toISOString(),
          confirm_long_shift: confirmLong,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'long_shift') setConfirmLong(false);
        throw new Error(data.error || 'Failed to close shift');
      }
      if (onClosed) await onClosed();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-v-charcoal/40 border border-amber-500/20 rounded-lg p-3">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-v-text-primary text-sm font-medium">
            {entry.member_name}
            <a href={`/team/${entry.team_member_id}`} className="ml-2 text-v-gold text-xs font-normal hover:underline">View</a>
          </p>
          <p className="text-v-text-secondary text-xs mt-0.5">
            Clocked in {formatWhen(entry.clock_in)}
            {entry.in_range === false ? ' · outside the dates shown above' : ''}
          </p>
          <p className="text-amber-200/90 text-xs mt-1">
            {sameDay
              ? 'Still clocked in today. Not included in hours or pay until you clock out.'
              : 'Never clocked out. Not included in hours or pay. The suggested end is 8 hours after clock-in — change it if the shift ended at a different time.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">Clock out</span>
            <input
              type="datetime-local"
              value={clockOut}
              onChange={(e) => { setClockOut(e.target.value); setConfirmLong(false); setError(''); }}
              className="bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50"
            />
          </label>
          <button
            type="button"
            onClick={closeShift}
            disabled={saving || !clockOut || preview == null || preview > 24 || (needsConfirm && !confirmLong)}
            className="px-3 py-2 text-xs uppercase tracking-wider text-v-gold border border-v-gold/40 rounded hover:bg-v-gold/10 disabled:opacity-50"
          >
            {saving ? 'Closing…' : 'Clock out'}
          </button>
        </div>
      </div>
      {clockOut && preview == null && (
        <p className="text-red-300 text-xs mt-2">Clock-out must be after clock-in.</p>
      )}
      {preview != null && preview <= 24 && (
        <p className="text-v-text-secondary text-xs mt-2">
          Closing at this time adds <span className="text-v-text-primary">{preview.toFixed(2)}h</span> to hours and pay.
        </p>
      )}
      {preview != null && preview > 24 && (
        <p className="text-red-300 text-xs mt-2">That is more than 24 hours. Enter when the shift actually ended.</p>
      )}
      {needsConfirm && (
        <label className="flex items-center gap-2 mt-2 text-xs text-amber-200">
          <input type="checkbox" checked={confirmLong} onChange={(e) => setConfirmLong(e.target.checked)} />
          This shift is longer than {LONG_SHIFT_HOURS} hours. Include it anyway.
        </label>
      )}
      {error && <p className="text-red-300 text-xs mt-2">{error}</p>}
    </div>
  );
}

export default function OpenShiftsPanel({ entries, policy, onClosed }) {
  if (!entries?.length) return null;
  const countLabel = entries.length === 1 ? '1 open shift' : `${entries.length} open shifts`;
  return (
    <section className="mb-6 border border-amber-500/40 bg-amber-500/10 rounded-xl p-4" data-testid="open-shifts">
      <p className="text-amber-300 font-medium text-sm">{countLabel}</p>
      <p className="text-v-text-secondary text-xs mt-1 mb-3">
        {policy || OPEN_SHIFT_POLICY} Choose a clock-out time to add one to hours and pay.
      </p>
      <div className="space-y-3">
        {entries.map((entry) => (
          <OpenShiftRow key={entry.id} entry={entry} onClosed={onClosed} />
        ))}
      </div>
    </section>
  );
}
