import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken =
    request.cookies.get('access_token')?.value ||
    request.cookies.get('ds_auth')?.value;

  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const isAuthenticated = Boolean(accessToken);

  // Redirect unauthenticated users away from protected routes to login
  if (!isPublicPath && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login/register pages to dashboard
  if ((pathname === '/login' || pathname === '/register') && isAuthenticated) {
    const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/dashboard';
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
