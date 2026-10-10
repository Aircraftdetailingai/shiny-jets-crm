// Attach the CRM session cookie on the same response that returns the JWT.
// cookies().set() followed by a bare Response.json() drops Set-Cookie in the
// App Router, so the browser keeps only localStorage.vector_token. Cookie-only
// calls (plan polling, middleware) then 401 and used to look like a logout.

import { NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'auth_token';

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  };
}

export function jsonWithAuthCookie(body, token, status = 200) {
  const res = NextResponse.json(body, { status });
  if (token) res.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions());
  return res;
}
