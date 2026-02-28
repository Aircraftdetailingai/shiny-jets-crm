"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CrewLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    const tk = localStorage.getItem('crew_token');
    const u = localStorage.getItem('crew_user');
    if (tk && u) router.push('/crew');
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/crew-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_code: pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('crew_token', data.token);
      localStorage.setItem('crew_user', JSON.stringify(data.user));
      router.push('/crew');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (d) => {
    if (pin.length < 8) setPin(p => p + d);
  };

  const removeDigit = () => setPin(p => p.slice(0, -1));

  return (
    <div className="page-transition min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center">
            <span className="mr-2">✈️</span> Crew {'Login'}
          </h1>
          <p className="text-gray-500 mt-1 text-center text-sm">
            Enter your PIN to access the crew dashboard
          </p>
        </div>

        {error && <div className="text-red-600 mb-4 text-center text-sm">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* PIN display */}
          <div className="flex justify-center gap-2 mb-6">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold ${
                  pin.length > i ? 'border-amber-500 bg-amber-50 text-[#1e3a5f]' : 'border-gray-200 bg-gray-50 text-gray-300'
                }`}
              >
                {pin[i] ? '●' : ''}
              </div>
            ))}
            {pin.length > 4 && (
              <>
                {[4, 5, 6, 7].map(i => pin[i] && (
                  <div
                    key={i}
                    className="w-12 h-14 rounded-lg border-2 border-amber-500 bg-amber-50 flex items-center justify-center text-2xl font-bold text-[#1e3a5f]"
                  >
                    ●
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => addDigit(String(d))}
                className="h-14 rounded-lg text-xl font-semibold text-[#1e3a5f] bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={removeDigit}
              className="h-14 rounded-lg text-lg font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => addDigit('0')}
              className="h-14 rounded-lg text-xl font-semibold text-[#1e3a5f] bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              0
            </button>
            <button
              type="submit"
              disabled={pin.length < 4 || loading}
              className="h-14 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-[#f59e0b] to-[#d97706] hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? '...' : 'GO'}
            </button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <a href="/login" className="text-sm text-blue-600 hover:underline">
            Owner {'Login'} →
          </a>
        </div>
      </div>
    </div>
  );
}
