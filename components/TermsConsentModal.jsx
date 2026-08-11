"use client";
import { useState } from 'react';
import { TERMS_VERSION, TERMS_UPDATE_SUMMARY } from '@/lib/terms';

export default function TermsConsentModal({ isOpen, onAccept }) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleAccept = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/terms/accept', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // Update localStorage with new terms version
        const stored = localStorage.getItem('vector_user');
        if (stored) {
          try {
            const user = JSON.parse(stored);
            user.terms_accepted_version = TERMS_VERSION;
            localStorage.setItem('vector_user', JSON.stringify(user));
          } catch {}
        }
        // Prevent modal from re-appearing this session even if refresh races
        localStorage.setItem('terms_accepted_session', TERMS_VERSION);
        onAccept();
      }
    } catch (err) {
      console.error('Terms accept error:', err);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4">
      <div className="bg-v-surface rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-lg overflow-y-auto max-h-[95vh] sm:max-h-[90vh]">
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-v-gold/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-v-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-v-text-primary">Updated Terms &amp; Privacy Policy</h2>
          <p className="text-sm text-v-text-secondary mt-1">Effective {TERMS_VERSION}</p>
        </div>

        <p className="text-sm text-v-text-secondary mb-4">
          We&apos;ve updated our Terms of Service and Privacy Policy. Here&apos;s a summary of key changes:
        </p>

        <ul className="space-y-2 mb-5">
          {TERMS_UPDATE_SUMMARY.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-v-text-primary">
              <span className="text-v-gold mt-0.5 shrink-0">&#9679;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="flex gap-3 text-sm mb-5">
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="text-v-gold hover:underline font-medium"
          >
            Read Full Terms
          </a>
          <span className="text-v-border">|</span>
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-v-gold hover:underline font-medium"
          >
            Read Full Privacy Policy
          </a>
        </div>

        <label className="flex items-start gap-3 text-sm text-v-text-primary mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-v-border text-v-gold focus:ring-v-gold"
          />
          <span>
            I have read and agree to the updated{' '}
            <span className="font-medium">Terms of Service</span> and{' '}
            <span className="font-medium">Privacy Policy</span>
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!agreed || saving}
          className="w-full py-3 rounded-lg bg-v-gold hover:bg-v-gold-dim text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {saving ? 'Saving...' : 'I Accept the Updated Terms'}
        </button>
      </div>
    </div>
  );
}
