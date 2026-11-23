'use client';
import {ExternalLink} from 'lucide-react';
import {cmsTerminology} from '@/lib/cms-terminology';
import {useLocale} from './locale-provider';

export default function CmsTerminology() {
  const {t} = useLocale();
  return <details className="cms-terminology">
    <summary>{t('CMS 업무 용어')}</summary>
    <p>{t('업무 용어는 CMS 영문 명칭을 기준으로 사용합니다. 한국어는 이해를 돕는 설명입니다.')}</p>
    <dl className="cms-term-list">{cmsTerminology.map(term => <div key={term.key}>
      <dt>{t(term.key)}</dt>
      <dd><a href={term.source} target="_blank" rel="noreferrer">{t('CMS 원문')}<ExternalLink size={12} aria-hidden="true"/></a></dd>
    </div>)}</dl>
    <h3>{t('내부 업무 상태')}</h3>
    <p>{t('담당자·업무 레인·청구 준비 배치·확인 상태는 기관 내부 관리용입니다. CMS의 청구 접수·지급 결정이나 공식 품질지표를 뜻하지 않습니다.')}</p>
  </details>;
}
