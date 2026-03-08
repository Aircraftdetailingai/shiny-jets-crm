"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VendorLoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    company_name: '',
    contact_name: '',
    website: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/vendor/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isRegister ? 'register' : 'login',
          ...form,
          ...(isRegister ? { agreed_to_terms_at: new Date().toISOString() } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      if (isRegister) {
        setSuccess('Registration submitted! You will be notified when your account is approved.');
        setForm({ email: '', password: '', company_name: '', contact_name: '', website: '' });
        setAgreedToTerms(false);
      } else {
        // Login successful
        localStorage.setItem('vendor_token', data.token);
        localStorage.setItem('vendor_user', JSON.stringify(data.vendor));
        router.push('/vendor/dashboard');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-2">
            <span>&#9992;</span> {'Vector'}
          </h1>
          <p className="text-blue-200 mt-2">Vendor Portal</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-semibold mb-6 text-center">
            {isRegister ? 'Become a Vendor' : 'Vendor Login'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {'Company Name'} *
                  </label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    required={isRegister}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Your Company Inc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact {'Name'}
                  </label>
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="https://yourcompany.com"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {'Email'} *
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="w-full border rounded-lg px-3 py-2"
                placeholder="vendor@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password *
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="••••••••"
              />
            </div>

            {isRegister && (
              <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">
                    Privacy Policy
                  </a>
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading || (isRegister && !agreedToTerms)}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Processing...' : isRegister ? 'Submit' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
                setSuccess('');
                setAgreedToTerms(false);
              }}
              className="text-amber-600 hover:underline text-sm"
            >
              {isRegister ? 'Already have an account? Login' : 'New vendor? Apply here'}
            </button>
          </div>

          {isRegister && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Why become a vendor?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Reach thousands of professional detailers</li>
                <li>• Easy product listing and management</li>
                <li>• Flexible commission tiers (10-60%)</li>
                <li>• Analytics and sales tracking</li>
              </ul>
            </div>
          )}
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <a href="/login" className="text-blue-200 hover:text-white text-sm">
            &larr; {'Back'} to main site
          </a>
        </div>
      </div>
    </div>
  );
}
