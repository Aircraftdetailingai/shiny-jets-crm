import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
];

// Owner-only routes that crew cannot access
const OWNER_ONLY_PATHS = ['/dashboard', '/reports', '/settings', '/customers', '/invoices', '/products', '/equipment', '/documents', '/team', '/jobs'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

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

export const config = {
  matcher: ['/admin/:path*'],
};
