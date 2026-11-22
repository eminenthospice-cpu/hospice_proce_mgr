import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError, assert, type Env } from './types.ts';

type Identity = { userId: string; email: string; name: string };
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const verified = new WeakMap<Request, { domain: string; audience: string; identity: Promise<Identity> }>();

// Never accept the former Sites headers or the unsigned CF email header.
export async function identity(request: Request, env: Env): Promise<Identity> {
  const domain = env.CF_ACCESS_TEAM_DOMAIN;
  const audience = env.CF_ACCESS_AUD;
  assert(domain && /^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(domain) && audience,
    503, 'access_not_configured', '직원 전용 로그인 설정이 준비되지 않았습니다.');
  const previous = verified.get(request);
  if (previous?.domain === domain && previous.audience === audience) return previous.identity;
  const result = verify(request, domain, audience);
  verified.set(request, { domain, audience, identity: result });
  return result;
}

async function verify(request: Request, domain: string, audience: string): Promise<Identity> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  assert(token && token.length <= 16384, 401, 'sign_in_required', '초대된 직원 이메일로 로그인해 주세요.');
  const issuer = `https://${domain}`;
  let keys = keySets.get(domain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000, cacheMaxAge: 600000, cooldownDuration: 30000,
    });
    keySets.set(domain, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience, algorithms: ['RS256'], clockTolerance: 30,
      requiredClaims: ['sub', 'email', 'iat', 'exp'],
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    assert(payload.type === 'app' && payload.sub && payload.sub.length <= 256 &&
      email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      401, 'invalid_access_token', '직원 로그인 인증을 다시 진행하세요.');
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email;
    return { userId: payload.sub, email, name: name.slice(0, 100) };
  } catch {
    throw new ApiError(401, 'invalid_access_token', '로그인이 만료되었거나 인증을 확인할 수 없습니다. 다시 로그인하세요.');
  }
}
