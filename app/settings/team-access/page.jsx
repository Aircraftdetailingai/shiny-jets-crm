"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { UpgradePrompt, usePlanFeature } from '@/components/PlanGate';

export default function TeamAccessPage() {
  const { ready: planReady, allowed: teamAllowed } = usePlanFeature('team');
  const [scheduleDays, setScheduleDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        const u = JSON.parse(stored);
        setScheduleDays(u.crew_schedule_days || 7);
      }
    } catch {}
  }, []);

  const saveScheduleDays = async () => {
    setSaving(true);
    setSavedOk(false);
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ crew_schedule_days: scheduleDays }),
      });
      try {
        const u = JSON.parse(localStorage.getItem('vector_user') || '{}');
        u.crew_schedule_days = scheduleDays;
        localStorage.setItem('vector_user', JSON.stringify(u));
      } catch {}
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold pb-2 border-b border-v-gold/20">Team & Access</h2>
      {planReady && !teamAllowed && <UpgradePrompt feature="team" compact />}

      <div className="pb-6 border-b border-v-border/40">
        <h3 className="text-sm font-medium text-v-text-primary mb-2">Team members</h3>
        <p className="text-xs text-v-text-secondary mb-4">Add, remove, and manage permissions for crew members and staff.</p>
        <Link
          href="/team"
          className="inline-flex items-center min-h-[44px] px-4 py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim transition-colors"
        >
          Manage team
        </Link>
      </div>

      <div className="pb-6 border-b border-v-border/40">
        <h3 className="text-sm font-medium text-v-text-primary mb-2">Crew schedule visibility</h3>
        <p className="text-xs text-v-text-secondary mb-4">How many days of upcoming jobs crew members see in the mobile app.</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={90}
            value={scheduleDays}
            onChange={(e) => setScheduleDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
            className="w-24 bg-v-charcoal border border-v-border text-v-text-primary rounded px-3 py-2 text-sm"
          />
          <span className="text-sm text-v-text-secondary">days ahead</span>
          <button
            onClick={saveScheduleDays}
            disabled={saving}
            className="px-4 py-2 bg-[#007CB1] text-white text-xs font-semibold uppercase tracking-widest rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : savedOk ? 'Saved \u2713' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
