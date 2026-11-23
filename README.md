# Eminent Hospice Care · Office Flow

Next.js 15 / React 19 UI와 서버 API를 단일 Cloudflare Worker로 빌드합니다. 배포 대상은 `https://mgr.eminenthospice.com`이며, 직원 인증은 Cloudflare Access, 업무 권한·MFA·암호화 레코드는 기관 전용 Cloudflare D1으로 관리합니다.

## v1.2.0 · DME / Medication 주문현황

Care Operations의 **DME 주문현황 / 약품 주문현황**은 기존 환자번호로 업체 요청과 배송을 추적합니다. 원본 처방·POC는 기존 EHR에서 유지하며 처방·투약·외부 업체 전송 기능은 없습니다. HospiceMD를 호출하거나 변경하지 않습니다. CMS의 **Durable Medical Equipment (DME), Drugs and Biologicals, Medical Supplies** 용어를 사용하며 요청·배송 상태는 내부 관리용입니다.

- 필수 입력은 기존 환자 선택, 품목·기존 처방명, 공급업체·약국입니다. 같은 종류의 최근 업체를 기본값으로 사용하며 이전 품목·업체를 재사용합니다. 요청일·담당자·변경 시각은 자동 기록됩니다. 원본 참조번호와 필요 예정일 변경은 선택 사항입니다.
- 일반 업무는 **수령 확인 한 번**으로 끝납니다. 중간 접수·배송 상태는 선택 사항이고 지연·취소에만 사유가 필요합니다. Refill은 기존 환자·품목·약국을 채운 확인창을 엽니다. 수령 기록은 임상 확인·투약·청구 게이트를 변경하지 않습니다.
- 진행 중·확인 필요·종료·전체 목록, 예정일 경과와 지연 표시, 검색과 자동 변경 이력을 제공합니다. Admin·Intake·RN-QA·Case Manager가 추적 기록을 관리하며 그 외 역할은 기존 환자 조회 범위 내에서 조회합니다.
- 검증 환경의 관리자는 최근 MFA 후 **가상 주문 24건 추가**로 기존 Census 데모 환자에 DME 12건·약품 12건을 연결합니다. 기존 환자·주문·업무를 유지하며 중복 추가를 막습니다. 모든 주문 내용은 독립된 가상 시나리오이며 HospiceMD 주문을 가져온 것이 아닙니다.
- 기존 암호화 `records` 컬렉션에 `orders` 유형을 추가합니다. DB 구조 변경·원격 마이그레이션·암호화 키 변경은 필요하지 않습니다. 기존 워크스페이스는 주문 0건으로 정상 시작합니다.

## 한국어 / English

로그인 화면과 업무 화면 오른쪽 위의 언어 선택에서 **한국어 / English**를 전환합니다. [영문 바로가기](https://mgr.eminenthospice.com/?lang=en)와 [한국어 바로가기](https://mgr.eminenthospice.com/?lang=ko)를 사용할 수 있습니다. 명시된 URL 언어, 같은 브라우저의 저장된 선택, 브라우저 기본 언어 순서로 적용합니다.

`locales/ko.json`과 `locales/en.json`이 공통 언어팩입니다. 화면 표시와 오류 안내, 날짜 형식, CSV 제목을 번역하며 DB의 역할·구분 값과 업무 규칙은 바꾸지 않습니다. 직원·환자 이름, 내부번호와 입력한 증빙 참조는 원문을 유지합니다. 브라우저에는 `eh-office-locale` 언어 선택만 저장하며 환자 데이터는 저장하지 않습니다. 새 문구는 두 언어팩에 함께 추가하고 `npm test`로 키·변수 일치를 확인하세요.

업무 용어는 CMS 영문 명칭을 기준으로 통일했습니다. 도움말과 설정의 CMS 용어표에서 공식 출처를 열 수 있습니다. 한국어는 설명용 번역입니다. [CMS 용어 기준](docs/cms-terminology.md)과 [변경 이력](CHANGELOG.md)을 참조하세요.

## 38명 가상 Census 데모

관리자 설정의 `38명 Census 가상 데모 추가`는 검증 환경에서만 사용할 수 있습니다. 최근 MFA 확인 후 `DEMO-HMD-` 번호의 가상 환자 38명과 가상 확인 업무를 추가합니다. 기존 환자·업무·청구는 덮어쓰지 않으며 중복 추가를 차단합니다. 환자 목록의 `38명 Census 데모` 필터로 별도 조회합니다.

가상 명단은 집계된 업무 구성만 참고한 독립된 테스트 데이터입니다. 이름·번호·날짜·의사·시설·증빙·확인 상태는 가상 값입니다. 원본 환자의 개별 기록이나 연결표는 코드·D1에 저장하지 않습니다. HospiceMD 연결·수정·자동 동기화 기능은 없습니다. `Residential`은 장소 분류 확인이 필요한 내부 값이며 CMS 청구 POS 코드를 자동 지정하지 않습니다.

## 현재 이전 상태

- Cloudflare 계정: `Eminenthospice@gmail.com's Account` (`aca0fd772c7c9e078fed7979460d4d28`).
- 생성한 D1: `eminent-hospice-mgr` (`d86f7ab8-9cb3-48a1-9431-9760a491ac86`). Western North America 배치 힌트이며 데이터 주권 보장은 아닙니다.
- Worker `eminent-hospice-mgr`를 `https://mgr.eminenthospice.com`에 배포했습니다. D1 마이그레이션 2개가 원격 적용되어 앱 테이블 11개와 감사 보호 트리거 2개를 확인했습니다.
- Cloudflare Access 앱 `Eminent Hospice Management` (`3ce4039e-9558-49a0-8cfc-4ee75663cb4e`)은 One-time PIN만 사용하고 개별 초대 이메일 정책을 적용합니다. 초기 허용 이메일은 `slee1005@gmail.com` 하나입니다. Access 세션은 6시간이며 HttpOnly·Binding Cookie·SameSite=Lax를 적용했습니다.
- 최종 Worker 버전: `551255c8-7679-4c67-8fd6-600c448bf2be` (v1.1.1 · 2026-11-23). 비로그인 화면·업무 API는 Access 로그인으로 이동합니다.
- `slee1005@gmail.com` 관리자가 첫 이메일 인증·TOTP 등록을 완료한 뒤 실제 어드미션 화면에서 관리자·MFA 표시와 Cloudflare D1 연결을 확인했습니다. 다른 직원의 첫 인증 앱 등록도 각 본인이 진행해야 합니다.
- 기존 Sites의 `records`와 `members`가 비어 있음을 2026-11-22에 확인했습니다. 새 D1에서 시작하며 기존 Sites 앱과 비밀 키는 변경하지 않았습니다. 이후 기존 사이트에 데이터가 추가되면 두 환경을 동시에 업무에 사용하지 말고 이관 범위를 다시 확인하세요.
- `PHI_PROCESSING_APPROVED=false`입니다. BAA와 Workers·D1·Access의 계약상 적용 범위를 확인하기 전에는 실제 환자정보를 입력하지 마세요.

## 관리자와 초대 직원

최초 앱 관리자는 **slee1005@gmail.com**입니다. 첫 방문자에게 관리자 권한을 주지 않습니다. Cloudflare 계정 소유자와 앱 내부 관리자는 별개입니다.

1. Cloudflare Zero Trust에서 `mgr.eminenthospice.com`용 Self-hosted Access 앱을 만듭니다. One-time PIN 또는 승인된 조직 IdP를 연결합니다.
2. Allow 정책에 **초대받은 직원의 개별 이메일만** 등록합니다. 초기에는 `slee1005@gmail.com`만 허용합니다. Everyone·전체 이메일 도메인 허용·Bypass 정책은 사용하지 않습니다.
3. 직원은 이메일로 로그인한 뒤 앱에서 접근 요청을 제출합니다. 신규 계정은 역할이 없는 `pending` 상태로 업무 데이터에 접근할 수 없습니다.
4. 앱 관리자가 `워크스페이스 설정 → 직원별 접근 권한`에서 역할을 부여합니다.
5. 승인 직원은 자신의 인증 앱으로 TOTP를 설정합니다. 복구 코드 8개는 최초 설정 때 한 번 표시합니다.

앱에서 직원 권한을 등록하는 작업은 초대 메일을 보내거나 Cloudflare 정책을 자동 변경하지 않습니다. Access 이메일 허용과 앱 승인이 모두 필요합니다. 퇴사자는 앱에서 비활성화하고 Access 허용 목록에서도 제거하세요.

역할은 관리자, Intake, RN-QA, Case Manager, Billing, Physician, 조회 전용이며 복수 선택이 가능합니다. 관리자가 간호 검토·청구 릴리스 권한까지 자동으로 갖지는 않습니다. 의사 단독 역할은 배정 환자만 조회합니다. 역할 변경·비활성화는 기존 업무 세션을 해제하고, 최초 관리자의 관리자 접근은 보호합니다.

## 배포

```sh
npm ci
npm test
npm run check
npm run cf:dry-run
```

전용 CLI 프로필 `eminent-hospice`를 사용하여 다른 Cloudflare 계정의 기존 로그인을 보존합니다. 승인할 계정은 `eminenthospice@gmail.com`입니다.

```sh
npx wrangler auth create eminent-hospice --scopes account:read user:read workers:write workers_routes:write workers_scripts:write d1:write zone:read ssl_certs:write
npx wrangler auth activate eminent-hospice
npm run cf:whoami
npm run cf:migrate
```

Access 앱의 팀 도메인과 AUD는 공개 검증 메타데이터이며 `wrangler.jsonc`의 vars에 설정되어 있습니다. 암호화 키는 Worker secret에만 저장합니다. 이미 배포된 Worker에는 키가 등록되어 있으므로 다시 생성하지 마세요. 새 환경을 처음 만들 때만 아래 명령으로 등록합니다. 실제 비밀 값을 소스·환경 파일·채팅에 넣지 마세요.

```sh
npx wrangler secret put DATA_ENCRYPTION_KEY --profile eminent-hospice
npm run cf:deploy
```

`CF_ACCESS_TEAM_DOMAIN`은 `your-team.cloudflareaccess.com` 형식의 호스트명이며, `CF_ACCESS_AUD`는 이 Access 앱의 AUD입니다. `DATA_ENCRYPTION_KEY`는 안전하게 생성한 32바이트 키의 64자리 hex입니다. **기존 암호화 키를 임의로 교체·삭제하면 저장 데이터와 MFA 설정을 복호화할 수 없습니다.** 운영 책임자가 승인한 비밀 관리 시스템에 복구 가능한 백업을 마련하세요.

배포는 Custom Domain을 통해 `mgr.eminenthospice.com`의 DNS와 인증서를 연결합니다. `workers.dev`와 Preview URL은 비활성화합니다. 기존 홈페이지와 메일 DNS는 변경하지 않습니다. 인증 설정이나 JWT가 없으면 정적 화면과 API 모두 차단합니다.

D1 구조의 원본은 `db/schema.ts`, 마이그레이션은 `drizzle/`입니다. 적용한 마이그레이션 파일을 수정하거나 요청 처리 중 테이블을 생성하지 않습니다. 원격 마이그레이션은 `npm run cf:migrate`로 적용합니다. 로컬 검증은 `npx wrangler d1 migrations apply DB --local`로 별도 DB를 사용합니다.

## 인증·권한·저장

- Access의 RS256 JWT를 공개 JWKS로 검증하며 발급자, 앱 AUD, 만료, nbf, 사용자 이메일을 확인합니다. 이전 Sites 헤더와 서명되지 않은 Cloudflare 이메일 헤더는 신뢰하지 않습니다.
- 사이트의 정적 자산도 검증을 거칩니다. 업무 API는 별도로 직원 활성 상태와 역할, TOTP를 확인합니다.
- 업무 쿠키는 HttpOnly·Secure·SameSite=Strict이며 토큰 해시만 DB에 저장합니다. 세션은 유휴 15분·최대 8시간이고 민감 작업에는 최근 5분 이내 MFA가 필요합니다.
- 업무 레코드는 기관별 AES-256-GCM으로 암호화하며 기관·유형·ID를 AAD로 검증합니다.
- 서버 명령 API가 청구 게이트, 임상 서명자 역할, F2F 창, POC 승인일과 수납 항등식을 다시 검증합니다. 임의 SQL·전체 상태 업로드 API는 없습니다.
- 환자 이름은 일반 응답에서 제외하며 별도 조회를 감사 기록에 남깁니다. 감사 로그에는 UPDATE/DELETE 금지 트리거와 HMAC 해시 연결을 적용합니다.
- CAS 버전과 중복 요청 식별자, D1 트랜잭션으로 동시 수정·중복 저장을 제어합니다.
- 업무 데이터는 `no-store`이며 브라우저 localStorage·IndexedDB에 환자 데이터를 저장하지 않습니다. Worker 요청 로그는 기본 비활성화했습니다.

## 실환자 운영 제한

현재 이 계정의 체결된 BAA는 확인되지 않았습니다. 최신 [Cloudflare HIPAA FAQ](https://www.cloudflare.com/trust-hub/compliance-resources/hipaa/)에는 **Workers·D1·Access가 HIPAA AoC 범위**로 명시되어 있지만, 기관의 실제 PHI 처리에는 Enterprise BAA를 양측이 체결하고 적용 계정·서비스와 조건을 확인해야 합니다. 현재 계정은 Workers Free / Teams Free이며 단순 유료 업그레이드는 BAA를 대신하지 않습니다. 실환자 운영 전 기관의 접근 통제, 백업·복구, 키 관리, 감사 보존과 운영 검토도 필요합니다.

환자 생성 API는 `DEMO-` 번호와 `데모` 또는 `Demo `로 시작하는 이름만 허용합니다. 자유 텍스트가 자동으로 비식별화되는 것은 아니므로 실제 환자·임상·연락처 정보를 입력하지 마세요. 빈 DB에만 고정 가상 샘플 30명을 추가할 수 있습니다. `PHI_PROCESSING_APPROVED`를 계약·기관 검토 없이 변경하지 마세요.

빌드는 `out/`와 `dist/server/index.js`를 생성합니다. `next dev`만으로는 Worker API가 실행되지 않습니다. 실제 직원의 로그인과 인증 앱 등록은 각 사용자가 직접 진행합니다. 테스트는 날짜·청구 게이트, JWT 위조·범위·만료, 직원 승인·역할, MFA·복구 코드, 세션 만료, 암호화, CSRF, 요청 크기, 동시 저장과 감사 기록 보호를 검증합니다.

전자서명, EHR·MAC 실제 전송, 계약 요율 계산, 전체 기간 이력, CSV 가져오기와 자동 알림은 구현 범위 밖입니다. AR aging은 화면에 명시한 입금일 기준입니다.

계약·백업·키 복구·가동 승인 진행 상태는 [실환자 운영 전환 기록](docs/production-readiness.md)에 기록합니다. 운영 모드의 환자 표시명은 `J. Smith`처럼 첫 이니셜과 성만 저장하며 전체 이름 형식은 서버에서 거부합니다. 이 표기와 내부번호도 PHI로 관리하며 현재 실환자 입력 제한은 유지합니다.
