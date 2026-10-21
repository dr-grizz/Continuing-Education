# Canvas learner sign-in

Current scope: existing CU accounts, including staff using the portal as learners. Sign-in links a verified Canvas identity to a portal learner; it does not create a CU account or enroll anyone in Canvas.

## Configuration

Set these in the ignored root `.env`:

```dotenv
LEARNER_AUTH_MODE=canvas
LEARNER_SESSION_HOURS=8
```

Reuse the configured `CANVAS_BASE_URL`, `CANVAS_STAFF_CLIENT_ID`, `CANVAS_STAFF_CLIENT_SECRET`, `CANVAS_STAFF_REDIRECT_URI` and `CANVAS_USER_AGENT`. No additional developer key or redirect URI is required. The existing callback remains `http://localhost:3050/api/auth/canvas/callback` locally; hosted use needs the exact registered HTTPS callback. Leave `STAFF_AUTH_MODE=canvas` to keep staff sign-in enabled separately. Session hours accept integers from 1 to 24.

Run `npm run db:migrate`, then restart the API and website. Migration `021_canvas_learner_auth` adds fields and session/state tables without changing old learner registrations. No new course-read scope is required: learner login requests only `/auth/userinfo`. It never stores a Canvas access/refresh token, even when staff course reads are enabled.

## Workflow

1. Open **Sign in → Sign in with CU account**, or choose **Use as learner** while signed in as staff.
2. Complete Canvas authorization using the existing CU account. Institutional SSO/MFA remains upstream under IT policy.
3. The portal creates or reuses one learner profile bound to the configured Canvas origin and numeric user ID. No user ID needs to be supplied manually.
4. Return to the requested course/pathway or **My learning**. Registrations and payment status belong to that learner alone.
5. Learner **Sign out** revokes the learner session. Staff sign-out is independent.

The identity-only response supplies a name and ID, not a verified email. The portal shows the name and does not match historical demo accounts by email. Old demo registrations remain intact. Do not interpret successful OAuth as fresh MFA assurance, guest provisioning or permission to read grades.

## Verification

Run `npm run test:learner-auth` for isolated, mocked-provider checks. Test live login separately, then check staff-to-learner use, unchanged staff permissions, registration, Stripe sandbox return, logout, expiry and deactivation. Review the changed sign-in/settings/navigation with keyboard and a screen reader. Local mock suites should explicitly use `LEARNER_AUTH_MODE=mock`; they cannot prove real authentication.

Future registration without a CU account, followed by paid guest provisioning, is recorded in [ADR 0009](adr/0009-canvas-learner-login.md).

Local checks and unverified live/accessibility cases are recorded in the [learner OAuth verification record](testing/learner-oauth-verification.md).
