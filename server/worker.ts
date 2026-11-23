import { assets, scriptHashes } from 'site-assets';
import { handleApi } from './api.ts';
import { cookie } from './auth.ts';
import { identity } from './identity.ts';
import { ApiError, type Env } from './types.ts';
import { localizeErrorResponse } from '../lib/i18n.ts';

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/auth/logout') {
    return new Response(null, { status: 302, headers: {
      Location: new URL('/cdn-cgi/access/logout', env.SITE_ORIGIN).href,
      'Set-Cookie': cookie('', 0), 'Cache-Control': 'no-store',
    } });
  }
  // Protect assets as well as API routes if the Access edge policy is accidentally removed.
  await identity(request, env);
  if (request.method === 'GET' && path === '/auth/login') {
    return new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' } });
  }
  if (path.startsWith('/api/')) return handleApi(request, env);
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  const asset = assets[path === '/' ? '/index.html' : path];
  if (!asset) return new Response('Not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.body), c => c.charCodeAt(0)), {
    headers: { 'Content-Type': asset.type, 'Cache-Control': path.startsWith('/_next/') ? 'private, max-age=31536000, immutable' : 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try { response = await route(request, env); }
    catch (error) {
      const known = error instanceof ApiError;
      response = Response.json({ error: {
        code: known ? error.code : 'unavailable',
        message: known ? error.message : '서버 설정 또는 연결을 확인하세요.',
      } }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store, private' } });
    }
    response = await localizeErrorResponse(response, request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' ${scriptHashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    return new Response(response.body, { status: response.status, headers });
  },
};
