'use client';
import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {Languages} from 'lucide-react';
import {translate, localeTag as tag, type Locale} from '@/lib/i18n';

export const LOCALE_STORAGE_KEY = 'eh-office-locale';
let clientLocale: Locale = 'ko';
export const getClientLocale = () => clientLocale;
const LocaleContext = createContext({locale:'ko' as Locale,localeTag:'ko-KR',t:(s:string|number|null|undefined,v?:readonly unknown[])=>translate('ko',s,v),setLocale:(_locale:Locale)=>{}});

export default function LocaleProvider({children}:{children:ReactNode}) {
  const [locale, updateLocale] = useState<Locale>('ko'), [ready,setReady] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(location.search).get('lang');
    let saved: string | null = null; try { saved = localStorage.getItem(LOCALE_STORAGE_KEY); } catch {}
    const next: Locale = query === 'en' || query === 'ko' ? query : saved === 'en' || saved === 'ko' ? saved : navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
    clientLocale = next; updateLocale(next); document.documentElement.lang = next; setReady(true);
    try { localStorage.setItem(LOCALE_STORAGE_KEY,next); } catch {}
  },[]);
  const value = useMemo(() => ({locale,localeTag:tag(locale),t:(s:string|number|null|undefined,v?:readonly unknown[])=>translate(locale,s,v),setLocale:(next:Locale)=>{
    clientLocale = next; updateLocale(next); document.documentElement.lang = next;
    try { localStorage.setItem(LOCALE_STORAGE_KEY,next); } catch {}
    const url = new URL(location.href); url.searchParams.set('lang',next); history.replaceState(history.state,'',url);
  }}),[locale]);
  return <LocaleContext.Provider value={value}>{ready ? children : <div className="locale-loading" aria-busy="true">Eminent Hospice Care</div>}</LocaleContext.Provider>;
}

export function useLocale() { return useContext(LocaleContext); }
export function LanguageSwitcher() {
  const {locale,setLocale,t}=useLocale();
  return <label className="language-switcher"><Languages size={16} aria-hidden="true"/><span className="sr-only">{t('언어 선택')}</span><select aria-label={t('언어 선택')} value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="ko" lang="ko">한국어</option><option value="en" lang="en">English</option></select></label>;
}
