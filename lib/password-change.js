// Temporary-password gate. Login puts must_change_password on the CRM JWT
// when detailers.must_change_password is true. Middleware and the client
// guard use passwordChangeDecision so those sessions can open the set-password
// page and log out, and nothing else, until POST /api/auth/set-password clears
// the flag. This module stays free of bcrypt, Supabase, and next/headers so
// middleware can import it.

export const MUST_CHANGE_PASSWORD_STORAGE_KEY = 'vector_must_change_password';
export const MIN_PASSWORD_LENGTH = 8;
export const SET_PASSWORD_PATH = '/set-password';

const SAFE_NEXT_PATHS = ['/detailing-ai'];

const ALLOWED_DURING_PASSWORD_CHANGE = new Set([
  '/set-password',
  '/login',
  '/api/auth/set-password',
  '/api/auth/logout',
  '/api/auth/login',
]);

export function sessionTokenClaims(detailer) {
  const claims = { id: detailer.id, email: detailer.email };
  if (detailer.must_change_password === true) claims.must_change_password = true;
  return claims;
}

export function readTokenPasswordChangeFlag(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const json = decodeURIComponent(
      Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    return JSON.parse(json).must_change_password === true;
  } catch {
    return false;
  }
}

export function normalizePath(pathname) {
  if (!pathname) return '/';
  const path = pathname.split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path || '/';
}

function isStaticAsset(pathname) {
  if (pathname.startsWith('/_next/') || pathname.startsWith('/icons/')) return true;
  return /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|ttf|txt|xml|webmanifest)$/i.test(pathname);
}

export function safeNextPath(next) {
  return SAFE_NEXT_PATHS.includes(next) ? next : null;
}

export function passwordChangeRedirectPath(pathname) {
  const path = normalizePath(pathname);
  const next = safeNextPath(path);
  return next ? `${SET_PASSWORD_PATH}?next=${encodeURIComponent(next)}` : SET_PASSWORD_PATH;
}

/**
 * @returns {{ type: 'allow' } | { type: 'redirect', location: string } | { type: 'forbidden' }}
 */
export function passwordChangeDecision({ pathname, mustChangePassword, destination } = {}) {
  if (mustChangePassword !== true) return { type: 'allow' };
  const path = normalizePath(pathname);
  if (ALLOWED_DURING_PASSWORD_CHANGE.has(path) || isStaticAsset(path)) return { type: 'allow' };
  if (path.startsWith('/api/')) return { type: 'forbidden' };
  if (
    destination === 'image' ||
    destination === 'font' ||
    destination === 'style' ||
    destination === 'script' ||
    destination === 'audio' ||
    destination === 'video'
  ) {
    return { type: 'allow' };
  }
  return { type: 'redirect', location: passwordChangeRedirectPath(path) };
}

export function onboardingAlreadyComplete(account) {
  return account?.onboarding_complete === true || account?.onboarding_completed === true;
}

export function destinationAfterPasswordChange(account, next) {
  if (!onboardingAlreadyComplete(account)) return '/onboarding';
  return safeNextPath(next) || '/dashboard';
}

export function postLoginPath({ mustChangePassword, onboardingComplete, next } = {}) {
  const safeNext = safeNextPath(next);
  if (mustChangePassword === true) {
    return safeNext ? `${SET_PASSWORD_PATH}?next=${encodeURIComponent(safeNext)}` : SET_PASSWORD_PATH;
  }
  if (onboardingComplete === false) return '/onboarding';
  return safeNext || '/dashboard';
}

export function validateSetPasswordInput({ password, confirm } = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    return { error: 'Enter a new password.', field: 'password' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: 'Password must be at least 8 characters.', field: 'password' };
  }
  if (typeof confirm !== 'string' || confirm.length === 0) {
    return { error: 'Confirm your new password.', field: 'confirm' };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.', field: 'confirm' };
  }
  return null;
}

function readSubmittedPassword(body) {
  const password = typeof body?.password === 'string'
    ? body.password
    : (typeof body?.newPassword === 'string' ? body.newPassword : '');
  const confirm = typeof body?.confirm === 'string'
    ? body.confirm
    : (typeof body?.confirmPassword === 'string'
      ? body.confirmPassword
      : (typeof body?.confirm_password === 'string' ? body.confirm_password : ''));
  return { password, confirm };
}

/**
 * Set the signed-in detailer's password. `sessionUser.id` is the only account
 * id that is read or written. A userId, id, or email on the body is ignored.
 */
export async function applySetPassword({
  sessionUser,
  body,
  fetchAccount,
  savePassword,
  comparePassword,
  hashPassword,
  createToken,
}) {
  if (!sessionUser?.id) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  let loaded;
  try {
    loaded = await fetchAccount(sessionUser.id);
  } catch (err) {
    console.error('[set-password] lookup failed:', err?.message || err);
    return { status: 500, body: { error: 'Could not verify your account. Try again.' } };
  }
  if (loaded?.error) {
    return { status: 500, body: { error: 'Could not verify your account. Try again.' } };
  }
  const account = loaded?.account;
  if (!account?.id) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  const next = safeNextPath(typeof body?.next === 'string' ? body.next : null);
  const redirect = destinationAfterPasswordChange(account, next);
  const email = account.email || sessionUser.email;

  // Already cleared: do not write a new hash. Issue a token without the gate
  // so an old session can move on. This is not a general password-change API.
  if (account.must_change_password !== true) {
    const token = await createToken(sessionTokenClaims({ id: sessionUser.id, email, must_change_password: false }));
    return {
      status: 200,
      token,
      body: {
        already_set: true,
        must_change_password: false,
        onboarding_complete: onboardingAlreadyComplete(account),
        redirect,
        token,
      },
    };
  }

  const { password, confirm } = readSubmittedPassword(body);
  const validation = validateSetPasswordInput({ password, confirm });
  if (validation) {
    return { status: 400, body: { error: validation.error, field: validation.field } };
  }

  if (account.password_hash) {
    let same = false;
    try {
      same = await comparePassword(password, account.password_hash);
    } catch (err) {
      console.error('[set-password] compare failed:', err?.message || err);
      return { status: 500, body: { error: 'Could not update your password. Try again.' } };
    }
    if (same) {
      return {
        status: 400,
        body: {
          error: 'That matches your temporary password. Choose a different password.',
          field: 'password',
        },
      };
    }
  }

  let password_hash;
  try {
    password_hash = await hashPassword(password);
  } catch (err) {
    console.error('[set-password] hash failed:', err?.message || err);
    return { status: 500, body: { error: 'Could not update your password. Try again.' } };
  }

  let saved;
  try {
    saved = await savePassword(sessionUser.id, {
      password_hash,
      must_change_password: false,
    });
  } catch (err) {
    console.error('[set-password] update failed:', err?.message || err);
    return { status: 500, body: { error: 'Could not update your password. Try again.' } };
  }
  if (!saved?.ok) {
    return { status: 500, body: { error: 'Could not update your password. Try again.' } };
  }

  const token = await createToken(sessionTokenClaims({ id: sessionUser.id, email, must_change_password: false }));
  return {
    status: 200,
    token,
    body: {
      success: true,
      must_change_password: false,
      onboarding_complete: onboardingAlreadyComplete(account),
      redirect,
      token,
    },
  };
}
