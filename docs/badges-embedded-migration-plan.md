# Badge service integration migration plan

Prepared October 27, 2026. Status: historical proposal, superseded by the [integrated PostgreSQL credentials decision](adr/0011-integrated-postgres-credentials.md) and the hosted startup fix in PR #26. The original proposal below is retained for context; its SQLite storage and standalone compatibility recommendations do not describe the current implementation. See [the current badge documentation](badges-and-certificates.md) for operation and deployment requirements.

## Recommendation and scope

Embed badge operations in the existing NestJS API process. Keep the Next.js pages and browser-facing `/api/badges/*` routes, but have their broker call the main API instead of a separate service on port 4178. Keep SQLite, existing signing keys, approved learner mappings, and the Python certificate renderer during this migration.

The result is one normal application startup command, with the existing web/API processes and no additional badge listener. This does not mean converting the application into one operating-system process: local development still uses Next.js on 3050 and NestJS on 3051; hosted startup already supervises those two processes.

Included:

- Badge designer, version approval/archive, Canvas mapping verification, manual and CSV awards, issuance register, learner access, sharing, public verification, and certificates.
- Shared application lifecycle, authorization, configuration, packaging, operational checks, and recovery procedures.
- A compatibility launcher for the standalone pilot during transition and rollback.

Deferred:

- Moving SQLite data into PostgreSQL/Neon or moving certificate rendering to PDFKit.
- Replacing the embedded editor documents with React screens.
- Automatic Canvas completion polling, real enrollment, new identity matching rules, or Open Badges certification.
- Altering existing issued credentials, signed certificate snapshots, or historical issuer identifiers.

No GitHub issues, Canvas writes, data migrations, releases, or cloud resources are authorized by this planning document.

## Findings from the current source

| Area | Current behavior | Migration implication |
| --- | --- | --- |
| Badge runtime | `badge-service/server.mjs` creates the domain objects and wraps operations in a Node HTTP handler. | Extract application operations and lifecycle from the transport rather than forwarding requests through a hidden listener. |
| Portal boundary | `src/web/server/badges.ts` checks sessions, scope, same-origin requests, route allowlists, learner links, and private response headers before calling 4178. | Preserve those checks and add authoritative authorization in NestJS; never trust a browser-supplied actor or learner ID. |
| Store | `badge-service/core.mjs` uses `node:sqlite`, synchronous transactions, WAL, Ed25519 keys, and a configuration fingerprint containing course, issuer, base URL, and mode. | Keep one managed runtime owner, avoid long synchronous work, preserve the fingerprint inputs, and validate the storage filesystem. |
| Learner reads | `badge-service/learners.mjs` opens source databases and checks signatures using each source's original key. | Preserve multi-source identities and ownership checks; do not flatten historical records or replace keys. |
| Certificates | `badge-service/certificates.mjs` invokes Python asynchronously, with a timeout and output limit. Certificate downloads are rendered from signed frozen snapshots. | Retain the rendering contract, templates, fonts, and validation behavior. Snapshot preservation alone does not guarantee byte-identical regenerated PDFs. |
| Frontend assets | `scripts/build-badge-workspace.mjs` generates editor documents under `src/web/public/credential-tools`. | Keep existing routes, assets, frame integration, and accessibility behavior. |
| Hosted package | `scripts/package-demo.mjs` traces the API and Next standalone output. The current hosted guide explicitly excludes badge hosting. | Explicitly package dynamic imports, renderer files, fonts, and dependencies; test the actual Linux release. |
| Existing decision | ADR 0008 specifies a separate loopback service. | Add a superseding ADR when implementing; preserve ADR 0008 as history. |

The feasibility check initialized the existing badge application in a disposable directory without calling `listen()`. Catalog, award, and certificate objects were available. This proves useful separation already exists; it does not prove an embedded NestJS integration or hosted deployment works. The shell used Node 22.22.3, while the repository requires Node 24+; implementation validation must use Node 24.

## Target request and trust flow

```text
Browser / existing editor documents
  -> Next.js /api/badges/*
     - session cookies, same-origin checks, explicit route allowlist
     - no browser-controlled actor, permissions, or learner mapping
  -> Existing loopback NestJS API on 3051
     - appropriate broker authentication and current staff/learner validation
     - badges:manage for staff; active account and approved mapping for learners
  -> Embedded badge application service
     - publishing, awards, signature verification, certificate snapshots
     - SQLite and original signing identity in private persistent storage
     - bounded Python subprocess for certificate rendering
```

Public verification has a separate read-only operation and returns only an explicitly shared credential. It cannot reach staff operations, private evidence, recipient names from certificates, or certificate downloads.

Proposed implementation locations, subject to existing module conventions:

- `badge-service/application.mjs`: runtime factory and transport-independent operations, with an explicit `close()` method.
- `src/server/badges/`: NestJS module, lifecycle provider, controllers, request validation, and authorization adapters.
- Existing `src/web/server/badges.ts`: retain the browser broker and replace the 4178 transport with the main API transport.
- Existing `badge-service/server.mjs`: compatibility HTTP adapter around the same application operations; no duplicated business logic.

Do not invoke the old HTTP handler using fabricated request/response objects as the permanent integration. The embedded API must call typed or explicitly validated operations. Keep transport-specific host checks in the standalone adapter and portal-origin checks at the web boundary.

## Phase 1 — Inventory and freeze the contracts

1. Use Node 24 and record the source revision, dependency lockfiles, runtime configuration, and existing local/hosted startup paths.
2. Inventory every allowlisted route and its input/output shape, response status, content type, download filename, required permission, actor, size limit, and side effects. Include designer drafts, versioning, mappings, CSV preview/commit/history/report, templates/previews/downloads, issuance exports, learner sharing, and public verification.
3. Identify all private data directories, historical sources, signing keys, learner map files, font files, and Python requirements in the intended migration environment. The inspected local checkout has no `badge-service/data`; it is not evidence that other pilot environments have no records.
4. Record aggregate counts, database integrity results, configuration fingerprints, public key identifiers, and representative signature verification results. Keep personal records and private configuration outside Git and normal logs.
5. Capture a representative visual certificate set: Letter/A4, both layouts, centered logo, signature image, long names/text, Unicode, and oversized/invalid input cases.

Exit: route inventory and recoverable source-data inventory are complete. Missing keys, unknown source directories, or conflicting identity mappings block migration of those sources.

## Phase 2 — Extract the badge application

1. Move shared initialization and operations into an application factory. Preserve transaction boundaries, eligibility checks, idempotency, immutable issued versions, and error semantics.
2. Accept validated runtime configuration explicitly. Keep filesystem paths absolute and independent of process working directory.
3. Give the runtime one owner per API process, explicit startup/close hooks, and cleanup for partial initialization failures. Enable Nest shutdown hooks and close SQLite after in-flight work drains.
4. Keep asynchronous Canvas reads and PDF rendering outside SQLite write transactions. Recheck version/eligibility assumptions at commit as required by the existing workflows.
5. Keep the standalone server as a thin adapter using the extracted operations. Run the existing pilot tests to establish behavioral parity before connecting NestJS.
6. Test loading the ESM `.mjs` modules from the CommonJS API compilation under Node 24. Package runtime imports explicitly rather than relying on development source paths or bundler guesses.

Exit: both adapters use the same application logic; existing pilot tests pass; no new listener is created by the embedded factory.

## Phase 3 — Integrate authorization and portal routes

1. Add internal NestJS badge endpoints with operation-specific request validation. Preserve accepted editor payloads while rejecting unknown fields, malformed identifiers, and oversized bodies. Reconcile the API's existing 8 MB JSON limit with badge image/CSV limits.
2. Reuse existing staff and learner authentication/guard conventions. A broker token by itself must not grant a staff role or select a learner. Revalidate current account state and required scope on each operation.
3. Resolve staff attribution server-side as `portal:<staff-uuid>`. Strip/reject submitted actor identities; retain audit records in the badge store.
4. Resolve learner identity from the verified portal session and the operator-approved UUID-to-badge-account mapping. Missing/conflicting mappings fail closed; no automatic email matching.
5. Preserve Next.js route allowlists, same-origin mutation checks, private/no-store headers, safe errors, and download response contracts. Eliminate badge bearer-token file reads from the integrated transport once no longer needed there; retain compatibility tokens privately for the standalone adapter.
6. Preserve current public verification URLs and privacy behavior. Maintain `/verify/badges/:source/:id`; change displayed sharing links independently of signed issuer fields.
7. Add backend feature gates. Disabled badges do not initialize a database or generate keys. Enabled-but-invalid configuration produces an explicit unavailable/readiness state without silently creating an empty replacement store.

Exit: browsers see the same URLs and data contracts, authenticated operations reach NestJS, and direct unauthorized calls to the internal API fail.

## Phase 4 — Data, keys, configuration, and Python

1. Keep separate configuration values for the immutable historical issuer origin and the current portal public origin. Do not substitute `WEB_URL` into an existing store's fingerprint. Changing the fingerprint requires a separately reviewed migration.
2. Separate create-new-demo mode from open-existing-store mode. Existing-store mode requires its original SQLite database, key, configuration, and expected key identifier. Never generate a replacement key when opening historical data.
3. Define one authoritative runtime configuration in the API: enabled flag, absolute data path, approved learner map path, issuer origin, demo/live configuration, historical sources, renderer executable, and optional font paths. Validate files, directory permissions, origins, and mode at startup.
4. Preserve the current Python renderer and pinned requirements. For hosted Linux, install or package Python and supported libraries through a reproducible build; do not copy a macOS virtual environment. Do not depend on a developer's Codex runtime path.
5. Bound PDF concurrency and request queues, retain timeouts/output limits, and cancel or drain child processes during shutdown. Confirm a slow or failed renderer cannot exhaust the API or leave award/certificate state partially committed.
6. Bind the main data directory to exactly one supported API instance. The code opens additional short-lived SQLite connections for learner/source operations; test those alongside the primary connection.
7. Validate SQLite WAL locking and shared-memory support on the actual persistent filesystem. Do not assume a network-mounted persistent directory supports WAL safely. If the host cannot provide durable compatible storage, block hosted enablement and choose a reviewed storage architecture; a PostgreSQL migration is separate scope.

Exit: original signatures validate, restart preserves data and keys, Python renders representative PDFs, and storage/recovery behavior has been demonstrated on the target filesystem.

## Phase 5 — Startup, packaging, and operations

1. Make normal `npm run dev` and hosted `npm start` initialize the embedded module when enabled; neither should spawn a third HTTP server. Keep the standalone script documented as a compatibility tool only.
2. Replace browser-test CI startup of `npm run dev:badges` with embedded configuration. Preserve isolated pilot tests for the compatibility adapter during transition.
3. Extend release packaging to include badge application modules, required dependencies, default configuration needed for an explicitly new demo, renderer script, and approved fonts. Private databases, keys, tokens, mappings, and learner records remain excluded from artifacts.
4. Extend packaged-runtime verification to run with badges disabled and with an isolated enabled synthetic store. Assert there is no listener on 4178 and exercise real certificate generation in the Linux artifact.
5. Keep basic process liveness lightweight. Provide a separate restricted badge readiness/diagnostic check for runtime initialization, writable compatible storage, renderer availability, and migration state; do not leak paths, keys, tokens, or personal records.
6. Measure API latency, PDF concurrency, process/native memory, CPU, artifact size, disk growth, and restart behavior under representative use. Existing Azure F1 suitability remains unproven; evaluate the deployed plan's current limits before enabling badges and do not silently upgrade the plan.

Exit: a clean installation starts without a separate badge command, and an enabled packaged Linux runtime passes functional, resource, storage, and recovery checks.

## Phase 6 — Validation matrix

| Area | Required evidence |
| --- | --- |
| Authorization | Missing/stale/revoked sessions, inactive accounts, removed scope, forged actor headers, wrong broker token, direct API access, mock/Canvas separation, CSRF and cross-site requests. |
| Learner privacy | Two distinct linked learners and an unlinked learner; cross-account requests denied; private PDFs/evidence excluded from public verification. |
| Publishing and Canvas | Draft CRUD, approved version immutability, archive, mapping checks, fresh evidence, stale/drifting mapping rejection. Use mocked Canvas evidence for routine testing. Live Canvas changes require separate authorization. |
| Awards | Manual issue, CSV preview/commit/report/history, duplicate/retry behavior, concurrent duplicate submissions, failed batch atomicity, preserved actor attribution. |
| Certificates | Template revisions, preview/create/download, Letter/A4 dimensions, both layouts, Unicode/font coverage, wrapping, logo/signature placement, missing renderer, timeout, malformed images, frozen snapshot integrity. Render and visually inspect representative PDFs. |
| Historical data | Counts, key identifiers, signature verification, revoked/shared state, source-aware exports and certificate retrieval before/after cutover and after restart. |
| Lifecycle | Disabled feature, bad configuration, partial initialization failure, graceful shutdown, restart, duplicate application initialization, concurrent reads/writes, database contention, renderer saturation. |
| Browser/accessibility | Existing staff and learner workflows in empty/loading/success/error states; keyboard operation, focus/return, iframe titles, labels, announcements, reflow and contrast; automated scans plus manual screen-reader review. |
| Release/recovery | Linux package on Node 24; Python and fonts present; no private data bundled; no 4178 listener; backup restored to a separate directory and validated. |

Run `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run test:badges`, relevant API/auth/security/hosting tests, and the required accessibility suite. Extend tests to exercise the actual embedded NestJS boundary, rather than only mocking away the new authorization layer. Run unrelated payment/catalog smoke checks because badges now share the API lifecycle. Use isolated synthetic records and stores; never point destructive tests at Neon or historical badge data.

Exit: all required checks have recorded results; unresolved screen-reader or deployment checks are disclosed and cannot be described as passed.

## Cutover procedure

1. Finish code review, the superseding ADR, documentation, local validation, and packaged-runtime verification. Keep hosted badges disabled until all hosted gates pass.
2. Prepare a manifest containing source/target paths, release revision, runtime versions, aggregate counts, expected key identifiers, configuration fingerprints, and backup checksums. Store the private manifest and rollback package outside Git.
3. Pause badge mutations and stop the original writer. Confirm no other standalone process or API instance is using the store. Follow a documented drain procedure for in-flight awards and PDF work.
4. Create a consistent backup using SQLite's backup facility or a verified cleanly closed database copy. Do not copy just `badges.sqlite` from an active WAL store. Preserve matching keys, configuration, approved mappings, historical source data, and renderer/fonts.
5. Restore the backup into a separate validation directory and verify integrity, counts, signatures, and representative exports. Retain the untouched original and validated backup.
6. Configure the embedded API to use the approved target data directory with the original issuer configuration. Never run old and new application writers concurrently against it.
7. Start with staff mutation access paused, verify readiness and historical reads, then allow a small controlled synthetic issuance/CSV/certificate workflow. Compare results and check logs without exposing personal data.
8. Enable normal badge operations after the checks pass. Confirm existing public verification links, private learner access, restart persistence, and absence of the 4178 listener.
9. Retain the compatibility release and backups through an agreed observation period. Retire the standalone launch requirement only after recovery has been rehearsed.

Local implementation, shared-data cutover, and hosted deployment are separate milestones. Local success does not automatically authorize a live cutover or release.

## Rollback and failure handling

- Before any new writes, revert the application/configuration and restart the standalone adapter against the preserved compatible store. Return the portal broker to the known-good transport if needed.
- After new awards, sharing changes, revocations, or certificates exist, pause writes and back up the current store first. Prefer rolling back code against the current store only after compatibility is verified; never restore an older backup and silently discard those records.
- If schema changes are unavoidable, document backward compatibility and exact restore/reconciliation steps before cutover. Keep schema changes additive where practical; do not assume the old adapter can open every new schema.
- If origin/key/fingerprint validation fails, stop and restore the matching configuration/key set. Do not bypass the guard or generate a new identity.
- If persistent storage or Python fails in hosted validation, leave hosted badges disabled while the rest of the portal remains available. Report badge unavailability explicitly.
- Preserve audit history. Invalidated sessions require a fresh sign-in; session restoration is not part of recovery.

## Documentation and completion criteria

Implementation must update `docs/badges-and-certificates.md`, the README startup/test instructions, environment examples, CI startup, release verification, and the hosting/deployment guides. Add a new ADR superseding ADR 0008's transport/lifecycle decision without rewriting its historical record. Record the Node-only PDF renderer and PostgreSQL migration as deferred decisions, not prerequisites.

Complete when:

- [ ] Normal app startup serves all enabled badge workflows through the existing main application.
- [ ] No separate service or listener on 4178 is required.
- [ ] Backend authorization, learner isolation, and public privacy checks pass.
- [ ] Historical records, signing identities, configuration fingerprints, snapshots, and approved mappings are preserved and verified.
- [ ] Certificates render correctly with the retained Python runtime.
- [ ] Accessibility verification and affected workflow checks are recorded.
- [ ] Restart persistence, consistent backup restoration, and rollback are demonstrated.
- [ ] Hosted enablement has separate packaging/storage/resource evidence, or is explicitly left disabled.

Suggested delivery order: application extraction → embedded API/authentication → broker switch → local verification → Linux packaging/storage validation → approved cutover. Estimate implementation after Phase 1; hosted filesystem suitability and preservation of historical origins are the largest unresolved constraints.
