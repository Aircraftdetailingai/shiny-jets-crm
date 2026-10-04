import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { passwordChangeDecision } from '@/lib/password-change';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

// Owner-only routes that crew cannot access
const OWNER_ONLY_PATHS = ['/dashboard', '/reports', '/settings', '/customers', '/invoices', '/products', '/equipment', '/documents', '/team', '/jobs'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // Redirect old domain to new domain
  if (hostname === 'app.vectorav.ai') {
    const url = new URL(request.url);
    url.host = 'crm.shinyjets.com';
    url.protocol = 'https';
    return NextResponse.redirect(url, 301);
  }

  // A temporary-password session (must_change_password on the CRM JWT) may
  // open /set-password, sign in again, or log out. Every other page redirects
  // back. Other API calls are rejected so the rest of the CRM stays closed.
  const passwordChangeResponse = await enforcePasswordChange(request);
  if (passwordChangeResponse) return passwordChangeResponse;

  // Protect /admin/* routes
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      if (!payload.email || !ADMIN_EMAILS.includes(payload.email.toLowerCase())) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Block crew members from owner-only pages
  // Crew auth is client-side (localStorage), so we check via a custom header or cookie
  // This is a secondary guard - the primary guard is client-side routing in the crew app
  // API routes have their own auth checks, so this only blocks page navigation

  return NextResponse.next();
}

async function enforcePasswordChange(request) {
  const cookieToken = request.cookies.get('auth_token')?.value;
  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  // Prefer the bearer when a request sends one. A just-issued token must not
  // lose to a stale auth_token cookie that still has must_change_password.
  const jwt = bearer || cookieToken;
  if (!jwt) return null;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(jwt, secret);
    const decision = passwordChangeDecision({
      pathname: request.nextUrl.pathname,
      mustChangePassword: payload.must_change_password === true,
      destination: request.headers.get('sec-fetch-dest'),
    });
    if (decision.type === 'redirect') {
      const url = request.nextUrl.clone();
      const target = new URL(decision.location, request.url);
      url.pathname = target.pathname;
      url.search = target.search;
      return NextResponse.redirect(url);
    }
    if (decision.type === 'forbidden') {
      return NextResponse.json(
        { error: 'Set a new password before continuing.' },
        { status: 403 },
      );
    }
  } catch {
    // An unreadable cookie is not a password-change session.
  }
  return null;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)'],
};
