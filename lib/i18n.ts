import ko from '../locales/ko.json' with { type: 'json' };
import en from '../locales/en.json' with { type: 'json' };

export type Locale = 'ko' | 'en';
type Message = string | { one: string; other: string };
export const languagePacks: Record<Locale, Record<string, Message>> = { ko, en };
export const localeTag = (locale: Locale) => locale === 'en' ? 'en-US' : 'ko-KR';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.keys(ko).filter(k => /\{\d+\}/.test(k)).sort((a,b) => b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length).map(key => ({
  key, pattern: new RegExp('^' + key.split(/(\{\d+\})/).map(p => /^\{\d+\}$/.test(p) ? '(.*?)' : escape(p)).join('') + '$'),
}));

// Source-text message IDs keep persisted enums and audit actions independent of locale.
// Only presentation text is translated; interpolation values are preserved verbatim.
export function translate(locale: Locale, source: string | number | null | undefined, values: readonly unknown[] = []): string {
  if (source === null || source === undefined) return '';
  const raw = String(source), key = raw.trim().replace(/\s+/g, ' ');
  let message = Object.hasOwn(languagePacks[locale], key) ? languagePacks[locale][key] : undefined, args = values;
  if (message === undefined && /[가-힣]/.test(key)) {
    for (const template of templates) {
      const match = template.pattern.exec(key);
      if (match) { message = languagePacks[locale][template.key]; args = match.slice(1); break; }
    }
  }
  if (message === undefined) return raw;
  const text = typeof message === 'string' ? message : new Intl.PluralRules(locale).select(Number(args[0])) === 'one' ? message.one : message.other;
  return text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
}

export function requestLocale(header: string | null): Locale {
  const choices = (header || '').split(',').map(part => {
    const [language, ...params] = part.trim().split(';');
    const weight = params.find(p => p.trim().startsWith('q='));
    return { language, q: weight ? Number(weight.trim().slice(2)) : 1 };
  }).filter(p => p.q > 0).sort((a,b) => b.q-a.q);
  for (const {language} of choices) { if (/^en(?:-|$)/i.test(language)) return 'en'; if (/^ko(?:-|$)/i.test(language)) return 'ko'; }
  return 'ko';
}

export function translateError(locale: Locale, message: string, code?: string): string {
  if (code === 'gate_blocked' && message.startsWith('청구 차단: ')) {
    return translate(locale, '청구 차단: {0}', [message.slice('청구 차단: '.length).split(', ').map(v => translate(locale,v)).join(', ')]);
  }
  return translate(locale, message);
}

export async function localizeErrorResponse(response: Response, request: Request): Promise<Response> {
  if (response.status < 400 || !response.headers.get('Content-Type')?.includes('application/json')) return response;
  const body = await response.clone().json() as {error?: {message?: string; code?: string}};
  if (!body.error?.message) return response;
  body.error.message = translateError(requestLocale(request.headers.get('Accept-Language')), body.error.message, body.error.code);
  const headers = new Headers(response.headers); headers.append('Vary', 'Accept-Language');
  return Response.json(body, {status: response.status, headers});
}
