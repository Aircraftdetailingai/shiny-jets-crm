"use client";
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ReferralLandingPage() {
  const params = useParams();
  const router = useRouter();
  const [referrer, setReferrer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const code = params.code;
    if (!code) return;

    // Store referral code in localStorage for later claim
    localStorage.setItem('vector_referral_code', code);

    // Validate the referral code and get referrer info
    const validate = async () => {
      try {
        const res = await fetch(`/api/referrals/validate?code=${encodeURIComponent(code)}`);
        if (res.ok) {
          const data = await res.json();
          setReferrer(data.referrer);
        } else {
          setError('This referral link is invalid or has expired.');
        }
      } catch (err) {
        setError('Failed to validate referral link.');
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [params.code]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Invalid Referral Link</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Visit Vector
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
        <div className="text-5xl mb-4">&#9992;</div>
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">
          You&apos;ve Been Referred!
        </h1>
        {referrer && (
          <p className="text-gray-600 mb-2">
            <strong>{referrer.company || referrer.name}</strong> thinks you&apos;d love Vector.
          </p>
        )}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-6">
          <p className="text-green-800 font-semibold text-lg mb-1">Your Reward</p>
          <p className="text-green-700">Sign up and get a <strong>30-day free trial</strong></p>
          <p className="text-green-600 text-sm mt-1">(instead of the standard 14 days)</p>
        </div>

        <p className="text-gray-500 text-sm mb-6">
          Vector is the all-in-one platform for aircraft detailing professionals. Build quotes, accept payments, track inventory, and grow your business.
        </p>

        <a
          href="/login"
          className="block w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl text-lg hover:opacity-90 transition-opacity mb-3"
        >
          Get Started Free
        </a>
        <a
          href="/"
          className="block w-full py-3 border-2 border-[#1e3a5f] text-[#1e3a5f] font-semibold rounded-xl hover:bg-[#1e3a5f]/5 transition-colors"
        >
          Learn More About Vector
        </a>

        <p className="mt-6 text-xs text-gray-400">
          Powered by Vector &mdash; Aircraft Detailing Software
        </p>
      </div>
    </div>
  );
}
