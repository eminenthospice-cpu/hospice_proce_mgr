# Eminent Hospice Care · Office Flow

Next.js 15 / React 19 UI와 서버 API를 단일 Cloudflare Worker로 빌드합니다. 배포 대상은 `https://mgr.eminenthospice.com`이며, 직원 인증은 Cloudflare Access, 업무 권한·MFA·암호화 레코드는 기관 전용 Cloudflare D1으로 관리합니다.

## 현재 이전 상태

- Cloudflare 계정: `Eminenthospice@gmail.com's Account` (`aca0fd772c7c9e078fed7979460d4d28`).
- 생성한 D1: `eminent-hospice-mgr` (`d86f7ab8-9cb3-48a1-9431-9760a491ac86`). Western North America 배치 힌트이며 데이터 주권 보장은 아닙니다.
- Worker·도메인·DB 마이그레이션은 `wrangler.jsonc`에 준비되어 있습니다. 실제 배포에는 해당 계정의 CLI 승인과 Cloudflare Access 활성화가 필요합니다.
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
npm run cf:whoami
npm run cf:migrate
```

Access 앱의 팀 도메인과 AUD를 확인한 뒤 다음 값을 Worker secrets에 등록합니다. 실제 비밀 값을 소스·환경 파일·채팅에 넣지 마세요.

```sh
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --profile eminent-hospice
npx wrangler secret put CF_ACCESS_AUD --profile eminent-hospice
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

현재 승인된 BAA 환경이 없습니다. Cloudflare 계정이나 도메인을 보유하는 것만으로 BAA가 체결되거나 모든 제품에 적용되는 것은 아닙니다. [Cloudflare HIPAA 안내](https://www.cloudflare.com/resources/assets/slt3lc6tev37/3PeVHvuZAh7p3tN77kIfhG/596a459dd1cfbc2ad6b1dbef36ff0eb1/BDES-1265_Privacy_Compliance_Whitepapers_HIPAA.pdf)와 계약 담당자를 통해 **Workers·D1·Access 각각의 적용 여부**를 확인해야 합니다. 실환자 운영 전 기관의 접근 통제, 백업·복구, 키 관리, 감사 보존과 운영 검토도 필요합니다.

환자 생성 API는 `DEMO-` 번호와 `데모`로 시작하는 이름만 허용합니다. 자유 텍스트가 자동으로 비식별화되는 것은 아니므로 실제 환자·임상·연락처 정보를 입력하지 마세요. 빈 DB에만 고정 가상 샘플 30명을 추가할 수 있습니다. `PHI_PROCESSING_APPROVED`를 계약·기관 검토 없이 변경하지 마세요.

빌드는 `out/`와 `dist/server/index.js`를 생성합니다. `next dev`만으로는 Worker API가 실행되지 않습니다. 실제 직원의 로그인과 인증 앱 등록은 각 사용자가 직접 진행합니다. 테스트는 날짜·청구 게이트, JWT 위조·범위·만료, 직원 승인·역할, MFA·복구 코드, 세션 만료, 암호화, CSRF, 요청 크기, 동시 저장과 감사 기록 보호를 검증합니다.

전자서명, EHR·MAC 실제 전송, 계약 요율 계산, 전체 기간 이력, CSV 가져오기와 자동 알림은 구현 범위 밖입니다. AR aging은 화면에 명시한 입금일 기준입니다.
