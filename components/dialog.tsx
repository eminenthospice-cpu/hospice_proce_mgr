'use client';
import {useRef,useEffect,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {useLocale} from './locale-provider';
export function Dialog({ children, title, subtitle, onClose, wide = false, drawer = false }: {
    children: ReactNode;
    title: string;
    subtitle?: string;
    onClose: () => void;
    wide?: boolean;
    drawer?: boolean;
}) {
 const {t: tr, locale, localeTag} = useLocale();
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        const prev = document.activeElement as HTMLElement | null;
        const get = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || []);
        get()[0]?.focus();
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape')
                closeRef.current();
            if (e.key === 'Tab') {
                const all = get();
                if (!all.length) {
                    e.preventDefault();
                    return;
                }
                if (e.shiftKey && document.activeElement === all[0]) {
                    e.preventDefault();
                    all[all.length - 1]?.focus();
                }
                else if (!e.shiftKey && document.activeElement === all[all.length - 1]) {
                    e.preventDefault();
                    all[0]?.focus();
                }
            }
        };
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; prev?.focus(); };
    }, []);
    return <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget)
        onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={tr(title)} className={`dialog ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}`}><div className="dialog-heading"><div><h2>{tr(title)}</h2>{subtitle && <p>{tr(subtitle)}</p>}</div><button className="icon-button" aria-label={tr("닫기")} onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
