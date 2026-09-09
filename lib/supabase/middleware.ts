import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isLoginPage = path.startsWith('/login');
  const isSessionResetPage = path.startsWith('/external-login');
  const isLogoutPage = path.startsWith('/logout');

  if (request.method !== 'GET' || isLoginPage || isSessionResetPage || isLogoutPage) {
    return response;
  }

  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));

  if (!hasSupabaseAuthCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}
