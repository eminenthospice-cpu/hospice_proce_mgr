# Google sign-in migration

Status: Google sign-in and Staff-based authorization are deployed on 2026-11-24 (v1.3.1, Worker `fdcf806d-cd3f-447b-aedd-ba2861ca0a08`). Cloudflare confirmed the identity-provider test succeeded after the user completed Google verification. A fresh visit to the actual site reached Google account selection and then the active Staff account’s first authenticator enrollment screen. At that release, the account was waiting for its own phone enrollment; existing roles and MFA registrations were preserved. On 2026-11-25 the user requested a testing-only pause of app MFA, described below.

Observed before configuration on 2026-11-24:

- The Eminent Hospice Cloudflare account dashboard is accessible in the business browser session.
- The application selects only One-time PIN, with all-provider access disabled and a six-hour session duration.
- The existing `Eminent invited staff` policy includes only `slee1005@gmail.com`. The Cloudflare account owner email is not automatically an invited app user.
- The account has One-time PIN and Cloudflare providers; no Google provider has been saved.
- Google Cloud displays `eminenthospice@gmail.com` and its first-use Terms of Service dialog. User agreement is pending before creating the OAuth project/client. No application policy changes have been saved.

Progress on 2026-11-24:

- The user approved Google Cloud/service terms and then the separate Google API Services User Data Policy.
- The user approved creation and registration of the Google-to-Cloudflare OAuth connection and Staff-based work authorization.
- Google project, branding configuration, and restricted web OAuth client were created. Cloudflare confirmed successful creation of the Google identity provider.
- The provider test redirects to Google with exactly `email profile openid` scopes. After the user completed the passkey check, Cloudflare displayed “Your connection works!” for the business account.
- The saved Allow policy is `Eminent Google sign-in`, matching only the Google login method. The live application selects only Google, accepts-all-providers is off, and instant authentication remains on. One-time PIN remains available for unrelated applications but is not selected for this application.
- The business email was already an active `read_only` Staff member. Its Google login reached first MFA enrollment without a separate edge email entry. The role was not changed.
- Local checks: 58 automated tests passed, TypeScript and the v1.3.1 build passed, and the Staff registration screen was inspected with a synthetic local account. Record-preservation tests compare full records by ID rather than relying on database row order.

## Configuration

Use the Eminent Hospice Cloudflare account (`eminenthospice@gmail.com`, account `aca0fd772c7c9e078fed7979460d4d28`) and the existing **Eminent Hospice Management** Access application. Preserve the application's audience, hostname, session settings, and all existing app members, roles, and authenticator registrations.

The user requested Staff to be the sole employee roster on 2026-11-24. Replace the edge email allowlist with an Allow rule matching the Google login method, and select Google as this application's only available identity provider. The edge verifies Google identity; the app requires an active Staff membership, the exact verified email and user binding, and app MFA before returning work data. A Google login alone must not grant workspace access. Do not use a Bypass policy or reset employee roles/MFA. Pending access requests remain without work permissions until an administrator activates them.

Created Google project: `eminent-hospice-login` (Eminent Hospice Login). Google provider: `e35fdac6-bb40-4f90-aa61-d565efde2abd`. OAuth client is restricted to the origin and callback below; its secret is stored only in Cloudflare.

Create a Google web OAuth client for this integration, with:

- JavaScript origin: `https://frosty-shadow-9706.cloudflareaccess.com`
- Redirect URI: `https://frosty-shadow-9706.cloudflareaccess.com/cdn-cgi/access/callback`
- Only the identity information required for Google sign-in; no Gmail, Drive, or patient data permissions.

Store the client secret only in Cloudflare's Google identity-provider configuration. Do not save it in this repository, logs, or chat. Keep the current one-time PIN provider available for unrelated applications. Google accounts not active in Staff must not gain work data access.

## Verification and cutover

1. Test the Google identity provider in Cloudflare before selecting it for the application.
2. Confirm the Google client requests only `openid`, `email`, and `profile`. Google explicitly exempts these identity-only requests from the Testing test-user allowlist, warning, and seven-day authorization expiry; no Google test-user list is needed. Google branding is still unverified. See [Google audience documentation](https://support.google.com/cloud/answer/15549945).
3. Sign in with the existing owner's Google account (`slee1005@gmail.com`) and complete the existing app authenticator challenge. Verify the same administrator role, workspace, and records remain available.
4. Verify a Google account not registered as active in Staff cannot access workspace data. Verify an active pre-registered Staff account can enroll MFA and receives only its assigned roles. Keep app role assignment and MFA requirements in place.
5. Deploy the matching English and Korean instructions. Record the final configuration and verification outcome here and update the README's production login method.

Cloudflare documents the Access `sub` as unique to an email address within an account. Changing identity providers does not require changing member IDs or resetting MFA. Do not delete and recreate the Zero Trust user, since that changes `sub` and breaks the existing identity binding.

References: [Cloudflare Google integration](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/), [Access application token](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/).

## Testing-only MFA pause (2026-11-25, v1.3.2)

The user explicitly requested disabling app 2FA during testing. `APP_MFA_REQUIRED=false` takes effect only alongside an explicit `PHI_PROCESSING_APPROVED=false`. Missing or invalid flags, or PHI approval, enforce MFA by default. Google sign-in and all Staff authorization checks remain required. Google account security settings are not changed.

Test sessions keep `verified_at=NULL`; they are never recorded as successful MFA. Their normal idle and maximum lifetime still apply. Recent-MFA gates follow the same server policy while role checks remain enforced. Existing authenticator secrets and recovery codes are retained. Set `APP_MFA_REQUIRED=true` and redeploy to restore challenges for test sessions before any work-data access. No database migration is needed.

Validation: 60 automated tests passed, including Staff/identity/role enforcement without MFA, unchanged authenticator credentials, restoration of MFA for existing test sessions, explicit flag validation, PHI-mode enforcement, and idle expiry. English entry and Korean settings were inspected with an isolated synthetic identity.

Live verification: Worker `27ca8188-9193-4e7b-b550-5fee17d752d5` deployed with both test flags explicitly false. Reloading the business account’s existing pending-MFA session reached the real dashboard without a code. Workspace settings displayed Google sign-in, the unchanged read-only role, and “Test mode · 2FA temporarily paused”.
