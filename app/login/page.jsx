"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setUserCurrency } from '@/lib/currency';
import TermsConsentModal from '@/components/TermsConsentModal';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import BiometricLogin from '@/components/BiometricLogin';
import LanguageSelector from '@/components/LanguageSelector';
import { useTranslation } from '@/lib/i18n';
import { TERMS_VERSION } from '@/lib/terms';

function LoginContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(null);
  const [webauthnEmail, setWebauthnEmail] = useState(null);

  useEffect(() => {
    // Skip auto-login if user just logged out
    if (params.get('logged_out') !== 'true') {
      const token = localStorage.getItem('vector_token');
      const user = localStorage.getItem('vector_user');
      if (token && user) { router.push('/dashboard'); return; }
    }

    const errParam = params.get('error');
    const errMessage = params.get('message');
    if (errParam === 'auth_failed') setError(errMessage || 'Authentication failed. Please try again.');
    else if (errParam === 'no_email') setError('Could not retrieve email from your account.');
    else if (errParam === 'account_creation_failed') setError(errMessage || 'Failed to create account. Please try email signup.');
    else if (errParam === 'oauth_error') setError(errMessage || 'OAuth sign-in failed. Please try again.');
    else if (errParam === 'server_error') setError(errMessage || 'Server error. Please try again.');

    // Check for registered WebAuthn credential
    const regEmail = localStorage.getItem('webauthn_registered');
    if (regEmail && regEmail !== 'true' && window.PublicKeyCredential) {
      setWebauthnEmail(regEmail);
      setEmail(regEmail);
    }
  }, [router, params]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      if (data.token) {
        localStorage.setItem('vector_token', data.token);
        localStorage.setItem('vector_user', JSON.stringify(data.user));
        setUserCurrency(data.user?.currency || 'USD');

        // Claim referral if stored
        const refCode = localStorage.getItem('vector_referral_code');
        if (refCode) {
          try {
            await fetch('/api/referrals/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
              body: JSON.stringify({ referral_code: refCode }),
            });
            localStorage.removeItem('vector_referral_code');
          } catch {}
        }

        const redirectTo = (data.must_change_password || data.onboarding_complete === false) ? '/onboarding' : '/dashboard';
        const termsOk = data.user.terms_accepted_version === TERMS_VERSION || localStorage.getItem('terms_accepted_session') === TERMS_VERSION;
        if (!termsOk) {
          setPendingRedirect(redirectTo);
          setShowTermsModal(true);
        } else {
          router.push(redirectTo);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-transition min-h-screen flex items-center justify-center bg-v-charcoal p-4 relative">
      {/* Language selector — top right */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/images/shiny-jets-logo.png" alt="Shiny Jets CRM" className="h-12 mx-auto mb-2 object-contain" />
          <p className="text-v-text-secondary mt-2 text-sm">{t('login.professionalSoftware')}</p>
        </div>

        <div className="bg-v-surface border border-v-border rounded-sm p-6">
          {/* Biometric Login */}
          {webauthnEmail && (
            <>
              <BiometricLogin
                email={webauthnEmail}
                onSuccess={(data) => {
                  localStorage.setItem('vector_token', data.token);
                  localStorage.setItem('vector_user', JSON.stringify(data.user));
                  document.cookie = `auth_token=${data.token}; path=/; max-age=${60*60*24*30}; SameSite=Lax`;
                  window.location.href = '/dashboard';
                }}
              />
              <div className="flex items-center my-4">
                <div className="flex-grow border-t border-v-border"></div>
                <span className="mx-4 text-v-text-secondary text-xs uppercase tracking-widest">or</span>
                <div className="flex-grow border-t border-v-border"></div>
              </div>
            </>
          )}

          {/* Social Login */}
          <SocialLoginButtons />

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-v-border"></div>
            <span className="mx-4 text-v-text-secondary text-xs uppercase tracking-widest">{t('login.orContinueWithEmail')}</span>
            <div className="flex-grow border-t border-v-border"></div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 px-4 py-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">{t('login.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
                placeholder={t('login.enterEmail')}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">{t('login.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
                placeholder={t('login.enterPassword')}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-v-gold text-v-charcoal rounded-sm font-medium hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
            >
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>

          <div className="mt-3 text-right">
            <a href="/forgot-password" className="text-xs text-v-gold hover:text-v-gold-dim transition-colors">
              {t('login.forgotPassword')}
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-v-text-secondary text-sm">
            {t('login.newToShinyJets')}{' '}
            <a href="/" className="text-v-gold hover:text-v-gold-dim transition-colors">{t('login.seePlansAndPricing')}</a>
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between px-1">
          <a href="/crew/login" className="text-xs text-v-text-secondary hover:text-v-gold transition-colors">
            {t('login.crewLogin')}
          </a>
          <p className="text-xs text-v-text-secondary/50">{t('login.byShinyJets')}</p>
        </div>
      </div>

      <TermsConsentModal
        isOpen={showTermsModal}
        onAccept={() => {
          setShowTermsModal(false);
          if (pendingRedirect) router.push(pendingRedirect);
        }}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
