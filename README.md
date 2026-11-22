# Eminent Hospice Care · Office Flow

기존 관리 UI에 ChatGPT 로그인, 직원 승인·7개 역할, 인증 앱 MFA 및 Cloudflare D1 공유 DB를 연결했습니다. 원본 서류는 보존했습니다.

## 관리자와 직원 접속

최초 앱 관리자는 **slee1005@gmail.com**입니다. 사용자의 선택에 따라 사이트 공유 초대를 받은 계정만 접속하도록 비공개 설정을 유지합니다. Sites 소유자 계정과 앱 내부 관리자는 별개입니다.

1. Sites 소유자가 사이트 공유에서 직원 이메일에 방문 권한을 추가합니다.
2. 직원이 자신의 ChatGPT 계정으로 로그인하고 접근 요청을 제출합니다.
3. 신규 계정은 역할이 없는 `pending` 상태입니다. 환자·업무 데이터에 접근할 수 없습니다.
4. 관리자가 `워크스페이스 설정 → 직원별 접근 권한`에서 역할을 부여합니다.
5. 승인된 직원이 인증 앱 TOTP를 설정하고 업무 세션을 시작합니다. 복구 코드 8개는 최초 설정 때 한 번 표시합니다.

직원을 미리 등록할 수도 있습니다. 앱의 직원 등록·승인은 메일을 보내거나 Sites 공유를 자동 변경하지 않습니다. 사이트 공유와 앱 승인이 모두 필요합니다.

역할은 관리자, Intake, RN-QA, Case Manager, Billing, Physician, 조회 전용이며 복수 선택이 가능합니다. 관리자가 기본적으로 간호 검토·청구 릴리스 권한까지 갖지는 않습니다. 필요 시 RN-QA·Billing 역할을 명시적으로 추가하세요. 의사 단독 역할은 배정된 환자만 조회합니다.

역할 변경·비활성화는 기존 업무 세션을 해제합니다. 최초 관리자의 접근은 해제할 수 없습니다. 민감 작업에는 최근 5분 이내 MFA가 필요하고, 세션은 유휴 15분·최대 8시간 만료를 적용합니다.

## 서버 저장과 검증

- Next.js 15 / React 19 UI와 API를 단일 Cloudflare Worker로 패키징합니다.
- Sites의 신뢰된 사용자 ID·이메일 헤더로 신원을 확인합니다. 클라이언트 역할·사용자 ID는 신뢰하지 않습니다.
- HttpOnly·Secure·SameSite=Strict 쿠키를 사용하고 세션 토큰의 해시만 DB에 저장합니다.
- 업무 레코드는 `agency_id`에 묶이며 AES-256-GCM으로 암호화합니다. 기관·유형·레코드 ID를 AAD로 검증합니다.
- 명시적인 명령 API만 허용합니다. 브라우저 전체 상태 업로드·임의 SQL 경로는 없습니다.
- 이름은 일반 응답에서 제외하고 별도 이름 조회 API에서 열람을 기록합니다.
- 청구 게이트, 서명자 역할, F2F 창, POC 승인일, 수납 항등식을 서버에서 다시 검증합니다.
- CAS 버전·idempotency receipt·D1 트랜잭션으로 동시 수정과 중복 저장을 제어합니다.
- 감사 기록에는 UPDATE/DELETE 금지 트리거와 HMAC 해시 연결을 적용합니다. 환자 이름은 감사 상세에 넣지 않습니다.
- 업무 API는 `no-store`이며 환자 데이터를 localStorage·IndexedDB에 저장하지 않습니다.

최초 DB는 비어 있습니다. 관리자는 빈 DB에만 고정된 가상 샘플 30명을 추가할 수 있습니다. 이전 브라우저 데모를 자동 이관하지 않습니다.

## 실환자 운영 제한

사용자 확인 결과 승인된 의료정보 처리 호스팅·DB/BAA 환경이 없습니다. 현재 [Sites 약관 3.3](https://openai.com/policies/chatgpt-sites-terms/)은 PHI 처리를 금지합니다. `PHI_PROCESSING_APPROVED=false`를 유지하고 실제 환자정보 입력을 활성화하지 않습니다. 이 연결은 직원 계정·권한과 가상 데이터의 서버 동작 검증용입니다.

환자 생성 API는 `DEMO-` 번호와 `데모`로 시작하는 이름만 허용합니다. 이 제한이 자유 텍스트의 비식별화를 보장하지는 않습니다. 모든 입력에서 실제 환자 정보·임상 내용·연락처를 사용하지 마세요. 승인된 환경으로 이전하고 기관 검토를 마치기 전에는 실환자 업무에 사용하지 않습니다. 사이트 접근 가능 여부는 BAA 적용을 의미하지 않습니다.

## 빌드와 테스트

```sh
npm ci
npm test
npm run check
npm run build
```

빌드는 정적 UI `out/`와 Worker `dist/server/index.js`를 생성합니다. `next dev`만으로는 Worker API가 실행되지 않습니다. 실제 사용자 계정의 첫 로그인·인증 앱 등록은 해당 사용자가 직접 진행합니다.

현재 27개 테스트는 날짜·YTD·청구 게이트, 역할 강제, MFA·복구 코드 재사용 방지, 승인 대기, 세션 만료, 암호화·이름 마스킹, CSRF, 요청 크기 제한, CAS·중복 요청, 감사 변경 거부를 검증합니다.

## DB와 비밀 값

`db/schema.ts`와 `drizzle/`가 DB 구조의 원본입니다. `npm run db:generate`로 새 마이그레이션을 생성하며, Sites 배포 중 적용합니다. 적용한 파일은 수정하지 않습니다. 요청 처리 중 테이블을 생성·변경하지 않습니다.

Sites secret에 `DATA_ENCRYPTION_KEY`(32바이트 키의 64자리 hex), `OWNER_EMAIL`, `SITE_ORIGIN`, `PHI_PROCESSING_APPROVED`를 저장합니다. 비밀 값은 소스·클라이언트 번들·환경 파일에 저장하지 않습니다. **암호화 키를 임의로 교체·삭제하면 기존 데이터와 MFA 설정을 복호화할 수 없습니다.** 외부 KMS·자동 키 회전·재해 복구 절차는 실환자 운영 환경 이전 시 추가해야 합니다.

주요 파일은 `components/access.tsx`(로그인·MFA), `components/connected-settings.tsx`(승인·직원 권한), `lib/permissions.ts`(역할), `server/api.ts`, `auth.ts`, `commands.ts`, `store.ts`(서버), `server/api.test.ts`(통합 검증)입니다.

계약 요율 계산, 전체 기간 이력, CSV 가져오기, 전자서명 연동, 자동 알림, EHR·MAC 전송은 이번 작업의 범위 밖입니다. AR aging은 현재 입금일 기준임을 화면에 명시합니다.
