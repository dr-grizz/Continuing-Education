# Hosted demo security controls

Updated October 26, 2026. These controls apply to the single-instance Azure F1 demo. They do not constitute a production security certification or change the live deployment automatically.

## Dependency remediation

The security scan identified affected packages in the portal, separate badge service and Python certificate renderer. The branch updates Next.js to 16.4.3, Prisma/client/adapter to 7.10.1, concurrently to 10.0.6, Pillow to 13.0.0, and compatible transitive dependencies in both JavaScript lockfiles. Root and badge-service npm audits and the renderer's isolated pip-audit report no known vulnerabilities at this checkpoint.

NestJS 12.1.2 pins Multer 2.4.0. A root `overrides.multer=2.5.0` selects the patched 2.x release without downgrading NestJS. No multipart interceptors are currently used; auth, Canvas, payment and badge regressions pass. Review whether the override can be removed when NestJS updates its pin. Do not replace this with an automatic forced major downgrade.

## Request budgets

The web proxy rejects cross-origin browser mutations before processing them. Same-origin headers can be supplied by non-browser clients, so they are not treated as an abuse control.

Hosted OAuth starts and browser mutations additionally use fixed 60-second rate windows:

| Scope | OAuth starts | Mutations |
| --- | --- | --- |
| Whole web process | 120 | 240 |
| Peer address | 20 | 120 |
| Portal session | — | 60; expensive Checkout/Canvas-course/reconciliation actions use a separate 10-request bucket |

Limits return HTTP 429 with `Retry-After` and `Cache-Control: no-store`. Peer addresses and opaque session values are hashed in memory, not logged or persisted by the limiter. The map has at most 4,096 entries and rejects new buckets if full; expired entries are reclaimed. Shared campus/VPN addresses share the peer budget.

Only when `WEBSITE_SITE_NAME` identifies the Azure deployment does the code use the rightmost address in Azure's appended `X-Forwarded-For` chain. Caller-controlled leftmost entries are ignored. Without a usable trusted peer address, requests share an `unattributed` bucket. A separate process-wide ceiling remains effective even if clients rotate cookies/addresses.

These counters reset on process restart, are process-local and are not a distributed service. Reassess limits and use a shared trusted edge/store before scaling to multiple instances or a larger audience. They reduce bounded demo abuse; they do not prevent every denial-of-service attack.

Signed Stripe webhook POSTs are exempt from browser-origin/rate checks so payment delivery is not blocked by audience quotas. Signature verification, live-event refusal, replay deduplication and the body budget still apply. OAuth callbacks and ordinary GET browsing do not consume these write/start quotas.

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

- `npm run test:security`: valid token roundtrip; tampered/wrong-owner/truncated/noncanonical ciphertext refusal; oversized/chunked/slow/concurrent body handling and slot recovery; bounded quota storage/expiry; proxy throttling despite forged leftmost forwarding headers; webhook exception; baseline header configuration.
- Hosting, staff OAuth, learner OAuth, Canvas connector and request-driven payment/recovery regressions pass with disposable databases and mocked providers.
- Badge service: 46 tests and 63 portal integration checks pass, including real PDF rendering using the updated Python requirements.
- Build, typecheck, formatting, workflow linting and isolated packaged production verification pass. Actual production responses preserve the portal baseline and stricter embedded CSP; the packaged HTTPS catalog passes axe, keyboard skip navigation and 320 px reflow checks.
- Secret scans and static analysis are repeated before committing. Raw operational/security reports remain in ignored private artifacts.

Manual screen-reader review, independent penetration testing and sustained load testing remain unperformed. Local packaged verification is not evidence that the new release has been deployed. The previous live demo is unchanged until a separate deployment is requested. CI/CD deployment remains deferred.
