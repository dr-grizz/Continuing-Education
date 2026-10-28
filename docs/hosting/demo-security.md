# Hosted demo security controls

Updated October 26, 2026. These controls apply to the single-instance Azure F1 demo. They do not constitute a production security certification or change the live deployment automatically.

## ZAP header and caching follow-up — October 28

The October 27 ZAP report scanned 38 GET endpoints on the demo and reported missing CSP, anti-clickjacking, HSTS and MIME-sniffing headers, plus informational comments/cache alerts. It does not establish authenticated write or payment coverage.

The web configuration and proxy now share CSP, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` and referrer policy definitions. The proxy also applies them to its own authentication, CSRF, rate-limit and configuration errors. Credential editor documents retain their stricter policy. The general CSP is a baseline, not a complete nonce-based script policy; tightening it requires separate Next.js/MUI/Checkout compatibility checks.

Hosted demo and beta responses add `Strict-Transport-Security: max-age=31536000`. It is host-only, without `includeSubDomains` or preload; local non-hosted development does not emit HSTS. Maintain working HTTPS before deploying this policy. API, staff, learner, settings and sign-in responses use `no-store` and `Referrer-Policy: no-referrer`; immutable public Next.js assets keep public caching. The current account pages render client-side shells, while authenticated data comes from non-cacheable APIs.

The suspicious-comment sample identifies a third-party license/source URL, not a demonstrated secret. Preserve license notices and review any remaining instances individually. A cache alert whose evidence is already `no-store` does not justify disabling caching globally. Public catalog/static caching is intentional when no personal content is embedded.

Tests cover the compiled release's normal pages, flagged route samples, private pages/API responses, errors, OAuth redirects and hashed public assets. Run a new scoped scan after deployment and test approved authenticated staff/learner workflows separately. Azure-generated network-denial/edge error pages may bypass the application and need separate inspection; app-level headers cannot change those responses. Do not claim a clean live ZAP result from local checks alone.

## Dependency remediation

The security scan identified affected packages in the portal, separate badge service and Python certificate renderer. The branch updates Next.js to 16.4.3, Prisma/client/adapter to 7.10.1, concurrently to 10.0.6, Pillow to 13.0.0, and compatible transitive dependencies in both JavaScript lockfiles. Root and badge-service npm audits and the renderer's isolated pip-audit report no known vulnerabilities at this checkpoint.

NestJS 12.1.2 pins Multer 2.4.0. A root `overrides.multer=2.5.0` selects the patched 2.x release without downgrading NestJS. No multipart interceptors are currently used; auth, Canvas, payment and badge regressions pass. Review whether the override can be removed when NestJS updates its pin. Do not replace this with an automatic forced major downgrade.

## Request budgets

The web proxy rejects cross-origin browser mutations before processing them. Same-origin headers can be supplied by non-browser clients, so they are not treated as an abuse control.

Hosted OAuth starts and browser mutations additionally use fixed 60-second rate windows:

| Scope | OAuth starts | Mutations |
| --- | --- | --- |
| Whole web process | 120 | 240 |
| Peer address | No OAuth quota | 120 |
| Verified Canvas account | 20 completed identity checks, shared by staff/learner callbacks | — |
| Portal session | — | 60; expensive Checkout/Canvas-course/reconciliation actions use a separate 10-request bucket |

Web-proxy limits return HTTP 429 with `Retry-After` and `Cache-Control: no-store`. After Canvas verifies an identity, account limits return 429 to the trusted broker; the browser returns to sign-in with a message to wait one minute and start again. Peer addresses and opaque session values are hashed in memory, not logged or persisted by the limiter. The map has at most 4,096 entries and rejects new buckets if full; expired entries are reclaimed. Shared campus/VPN addresses share only the mutation peer budget, not an OAuth sign-in quota.

The portal cannot verify a username/email before OAuth completes. The API therefore keys the account quota by a hash of the verified Canvas installation and user ID. Email/display name are not used, and the quota is shared across fresh sessions and both staff/learner login flows. One user cannot exhaust another account’s allowance by entering its email. Failed password attempts are handled by Canvas/Cedarville. The site-wide start ceiling remains a demo capacity safeguard.

Only when `WEBSITE_SITE_NAME` identifies the Azure deployment does the code use the rightmost address in Azure's appended `X-Forwarded-For` chain. Caller-controlled leftmost entries are ignored. Without a usable trusted peer address, requests share an `unattributed` bucket. A separate process-wide ceiling remains effective even if clients rotate cookies/addresses.

These counters reset on process restart, are process-local and are not a distributed service. Reassess limits and use a shared trusted edge/store before scaling to multiple instances or a larger audience. They reduce bounded demo abuse; they do not prevent every denial-of-service attack.

Signed Stripe webhook POSTs are exempt from browser-origin/rate checks so payment delivery is not blocked by audience quotas. Signature verification, live-event refusal, replay deduplication and the body budget still apply. OAuth callbacks and ordinary GET browsing do not consume these web-proxy write/start quotas; verified callbacks have the separate account quota above.

## Bounded bodies

A shared streaming reader enforces actual byte counts, even when Content-Length is absent or dishonest:

| Route | Maximum body |
| --- | --- |
| General API broker | 8 MiB |
| Badge JSON broker | 6 MiB |
| Stripe webhook | 1 MiB, exact signed bytes preserved |
| Mock sign-in brokers | 16 KiB; disabled in public Canvas mode |

Each body read has a 10-second deadline. At most four body reads run concurrently per web process; extra reads receive 503. Oversized bodies receive 413; expired reads receive 408. This limit precedes API parsing and the upstream fetch timeout. It bounds the reader's own buffers, not Azure/Next.js transport buffers or total application memory.

## Encryption and browser boundaries

Canvas token decryption requires exactly three canonical base64url fields, a 12-byte nonce and a 16-byte authentication tag. AES-GCM explicitly uses `authTagLength:16` for tokens and temporary course previews. Existing correctly encrypted records remain compatible; malformed/truncated tags fail closed. Identity-bound associated data remains required.

All portal routes set SAMEORIGIN framing, nosniff, a referrer policy and a baseline CSP restricting frame ancestors, base URIs, objects and form destinations. Embedded credential tools retain their stricter script/style/image CSP. The baseline intentionally does not claim a complete nonce-based script policy; such a policy requires a separate compatibility review of Next.js, MUI and supported media players.

## Verification and remaining limits

- `npm run test:security`: valid token roundtrip; tampered/wrong-owner/truncated/noncanonical ciphertext refusal; oversized/chunked/slow/concurrent body handling and slot recovery; bounded quota storage/expiry; shared-IP OAuth starts, verified account isolation, shared staff/learner quotas, and process-wide ceilings; webhook exception; baseline header configuration.
- Hosting, staff OAuth, learner OAuth, Canvas connector and request-driven payment/recovery regressions pass with disposable databases and mocked providers.
- Badge service: 46 tests and 63 portal integration checks pass, including real PDF rendering using the updated Python requirements.
- Build, typecheck, formatting, workflow linting and isolated packaged production verification pass. Actual production responses preserve the portal baseline and stricter embedded CSP; the packaged HTTPS catalog passes axe, keyboard skip navigation and 320 px reflow checks.
- Secret scans and static analysis are repeated before committing. Raw operational/security reports remain in ignored private artifacts.

Manual screen-reader review, independent penetration testing and sustained load testing remain unperformed. Local packaged verification is not evidence that the new release has been deployed. The owner authorized continuous deployment on October 27. Successful `azure-demo` pushes now use the separate [OIDC deployment job](azure-demo-cd.md); its first hosted verification is recorded separately from these historical local checks.
