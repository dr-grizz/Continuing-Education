> Integrated portal: see [the repository setup guide](../docs/badges-and-certificates.md). The standalone/WordPress instructions below describe the original pilot adapter; this branch uses the Next.js portal. Historical local validation artifacts and private runtime files are not distributed with the source.

# CU Portal badge service — local pilot

This is a CU-owned service starter, not an installed copy of Digital Promise Badge Engine. It demonstrates a separate issuer workflow and supplies a replaceable signing/export boundary in `core.mjs`. The current export is an Ed25519-signed CU pilot envelope, **not an Open Badges 3.0 credential**; no wallet interoperability or 1EdTech certification is claimed. The separate historical Canvas pilot uses only the user-designated internal test account.

The selected live pilot target is [Canvas course 9943](https://cedarville.instructure.com/courses/9943), verified as Frieling Sandbox. See [the exact isolated-module proposal and rollback](pilot/COURSE-9943-PLAN.md), [the deliberately disabled draft configuration](pilot/course-9943.draft.json), and [the provisional Azure plan](pilot/AZURE-PLAN.md). After the user's confirmation, the isolated module, page and assignment were created and published; see [the implementation receipt](pilot/IMPLEMENTATION-RECEIPT.md). Azure resources remain undeployed.

## Run locally

Requires Node.js 24 or newer. The core local service uses Node built-ins; the Open Badges model checks add pinned Ajv, ajv-formats and jsonld dependencies. From this folder:

```sh
npm ci --ignore-scripts
node server.mjs
node --test test/*.test.mjs
```

This workspace already has a local runtime, so from the workspace root you can also run:

```sh
.local/node-v24.21.0-darwin-arm64/bin/node badge-service/server.mjs
.local/node-v24.21.0-darwin-arm64/bin/node --test badge-service/test/*.test.mjs
```

Open <http://127.0.0.1:4178>. Try an incomplete course, a 79% assessment, and then a passing course; repeat issuance, download the credential, enable sharing, open verification, revoke the award, and retry issuance. A revoked award stays revoked. The original single-rule endpoint is unique per learner, course and rule version; published mappings additionally prevent re-awarding the same achievement in the same Canvas course after a version change. Browser evidence cannot authorize an award: the sample scenarios are constructed on the server.

## Badge publishing and course mapping

Open [Publish & map](http://127.0.0.1:4178/publishing), or follow the new navigation link or a saved draft's **Publish & map** link in the studio. Unlock with the same protected local issuer access key as the register, then:

1. Select a saved draft and **Approve saved revision**; earning criteria are required. Approval captures an immutable title, description, issuer, criteria and complete SVG artwork (including uploaded image overrides). Editing a draft later creates a separately approved version and preserves old snapshots.
2. Select the approved version, enter the Canvas course and assessment assignment IDs, required module IDs (comma-separated), and passing percentage. **Verify in Canvas & save mapping** reads the actual course, assessment and module requirements on the server; browser-supplied definitions or verification are never accepted as evidence.
3. **Activate verified mapping** independently checks Canvas again. A new rule/version replaces the active mapping for that same badge and course; different badges may map to the same course, and a badge may map to multiple courses.
4. **Check eligibility** reads current Canvas evidence without issuing. **Check & issue badge** performs another fresh read and issues a private signed award only when every required module/item is complete and the graded, non-excused assessment meets the threshold.
5. **Archive version** disables every mapping for that version; older signed awards retain their content and status. To replace an archived version, save and approve a new draft revision.

Each course must use published modules with `all` completion policies and nonempty supported completion requirements, plus a published assessment with positive possible points. Before issuing, the service compares requirement IDs/types, associated content references, minimum scores/percentages and assessment possible points with the verified mapping snapshot; changed requirements fail closed. New awards include the frozen badge artwork/metadata, version ID, mapping ID and exact earning rule; the register details and signed download retain these fields. A duplicate for the same learner, draft achievement and Canvas course returns the original award even after a new version is activated, including when that original award was revoked. The explicit eligibility check requires an already approved server-side learner mapping; this page does not create identities or enrollments.

The local technical pilot badge is approved and mapped to [course 9943](https://cedarville.instructure.com/courses/9943), required module **192647**, assessment **644426**, minimum **80%**. Activation and the learner eligibility check perform GET requests only; they do not publish Canvas objects or change grades. Activation enables explicit Canvas-verified issuing, not a background completion scheduler; staff-attested awards use the separate Award Badges workflow. Existing historical awards remain in their original databases with their original signing keys; they do not acquire the new design retroactively.

Set `CANVAS_BASE_URL` and `CANVAS_TOKEN` in the server process environment to enable these reads; never paste the Canvas token into a browser. On this Mac, `pilot/start-local-service.py` reuses the existing Canvas Tools configuration without printing or persisting the token, with the Canvas Tools Python runtime. The main launcher imports only the approved identities from the ignored `pilot/course-9943.local.json` file when present; an absent learner mapping disables the learner actions. The studio/demo settings remain separate from live mapped evidence.

Publishing endpoints require the issuer bearer token or an authenticated local staff session; cookie-authenticated writes additionally require the exact local Origin:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/catalog` | Drafts, frozen versions, saved mappings, mapped learner IDs and activity |
| `POST /api/admin/versions/approve` | Approve `{draftId, revision}` |
| `POST /api/admin/mappings` | Independently verify and save `{versionId, rule}` |
| `POST /api/admin/mappings/{id}/activate` | Independently re-verify and enable the mapping |
| `POST /api/admin/mappings/{id}/check` | Check `{learner}` against fresh evidence; no award |
| `POST /api/admin/mappings/{id}/issue` | Read fresh evidence and issue once to `{learner}` |
| `POST /api/admin/versions/{id}/archive` | Archive a frozen version and disable its mappings |

This remains a loopback pilot with a shared local issuer key, a configured learner directory and CU-format signed exports; institutional staff SSO/roles, Open Badges conformance, automatic Canvas completion processing and Azure deployment are not implemented.

## Issuance register

Open <http://127.0.0.1:4178/issuances>, or use **Issuance register** in the navigation. The page lists every stored credential from the configured local database sources, including the fictional demo and the separately persisted Canvas course-9943 pilot. It reads the original databases without copying, issuing, editing or revoking awards; it does not inventory other providers or Canvas courses.

The page requires the local issuer access key from the protected `data/writer-token` file. The publishing page shares this local staff session. Sign-in creates an eight-hour HttpOnly, SameSite cookie; the key is cleared from the form and is never stored in browser local storage, embedded in page source, or placed in a URL. **Lock register**, session expiry, or a service restart requires sign-in again. This is local pilot access control, not institutional staff SSO.

Each row contains credential/achievement ID, recipient ID, issuance date in Eastern time, status, source, rule version, sharing status and signature result. **View details** shows the issuer, stored achievement criteria, evidence observation time, Canvas course/user IDs, assessment score, module/item completion evidence, revocation details when applicable, and the attributable activity history. Missing fields are labeled rather than inferred: the first issued pilot did not store an assessment ID or attached badge design. Future Canvas evidence now includes the assessment ID; existing signed awards and evidence remain unchanged.

Search by learner, credential, achievement, issuer or course; filter by status, source and issuance-date range. Paging displays 25 rows at a time. CSV and JSON exports include **all matching records**, not just the current page; JSON also retains evidence/activity. A protected action downloads the original signed credential. Exported CSV neutralizes formula-like text. Source read failures are shown as incomplete results, never silently treated as zero awards. Repeated issuance requests are counted separately and displayed in the original credential's history rather than as new credentials.

The register displays issuance-time evidence, not current learner grades. It does not retrospectively attach newly created draft designs or descriptions to an already signed award, change public sharing, or perform any Canvas writes. Production deployment still needs institutional authentication, authorization and source configuration.

## Visual issuer studio

Open <http://127.0.0.1:4178/issuer>, or follow **Issuer studio** from the pilot homepage. The **Design** tab offers three starting styles, four badge shapes, five symbols, color pickers, typography, labels, border/symbol sizing, and optional PNG/JPEG/WebP artwork up to 2 MB. The **Details** tab edits the badge title, description, earning criteria and issuer name. Both tabs update the preview immediately.

All starting styles default to Cedarville's [published primary web palette](https://www.cedarville.edu/offices/creative-services/brand/logo): blue `#003A63` and gold `#FDB813`. Classic and Modern use blue backgrounds, gold accents and white lettering; Heritage uses a gold background with blue accents and lettering. New badge defaults and template thumbnails use the same palette. Color controls remain editable; saved designs, uploaded images and issued credentials are not recolored by this defaults update.

At the top of **Design**, **Upload a complete badge image** replaces the entire template with your PNG, JPEG or WebP image (up to 2 MB). The image is fitted without cropping or stretching; template shapes, borders, symbols and text overlays are not drawn. Badge details remain separately editable and are saved with the image. **Remove image and use templates** restores the previous template controls. Full-image drafts export through the same PNG, SVG and definition actions; the SVG embeds the uploaded raster image rather than tracing it into vectors. The lower logo/symbol upload continues to replace only the template's center symbol.

**Save badge draft** persists a definition in the local service database and independently reads it back; reopen saved drafts from the library. Updates increment the revision, and stale saves are rejected. Unsaved edits are kept on screen until saved or explicitly discarded. Exports include transparent 1200 × 1200 PNG, vector SVG, and a JSON badge definition containing the design, description, criteria and artwork.

The studio is available only in the loopback demo service and is not a production issuer administration interface. Drafts are stored separately from awards. Saving or exporting a design does not issue a credential, update Canvas, or change the badge already issued from course 9943; approved revisions can now be connected to future CU pilot awards through **Publish & map**. Standards-compliant export is still required for production. PNG/SVG files are artwork, and the design JSON is a draft definition rather than a signed credential.

The service creates `data/`: SQLite records, issuer private key, private issuer token, private portal reader token, and a separate private portal award token. This directory is ignored by the service's `.gitignore`; never commit its contents. The tokens are generated locally and are never delivered to browser code. Keep the database and original signing key together in protected backups. Losing the private key prevents startup with an existing database; the application will not silently invent a replacement key.

Rules, issuer label, mode, and origin are bound to the database at initialization. Use a new data directory for a new pilot configuration, or implement a reviewed migration; existing awards must retain their original definitions. Public sharing is off by default and hides the verification page until enabled. Downloads contain a random subject identifier, not the portal learner ID, email, assessment score, or internal evidence. The audit table is transactional but is not a tamper-resistant institutional audit system.

## Interfaces

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET /health` | Local | Mode and readiness indicator |
| `GET /.well-known/jwks.json` | Local/public through future proxy | Issuer public signing key |
| `GET /api/learners/{mapped-id}/badges` | Portal bearer token | Learner's badge summaries |
| `GET /api/badges/{id}/download` | Portal bearer token | Signed CU pilot export |
| `POST /api/sync` with `{"learner":"mapped-id"}` | Issuer bearer token | Read fresh Canvas evidence, evaluate, and issue once |
| `POST /api/badges/{id}/share` with `{"shared":true}` | Issuer bearer token | Record an approved sharing preference |
| `POST /api/badges/{id}/revoke` with `{"reason":"..."}` | Issuer bearer token | Revoke with a private reason |
| `GET /verify/{id}` | Public only when shared | Verification page with current status |
| `GET /api/public/{id}` | Public only when shared | Minimal current status |

The portal token is a **trusted server credential** with access to all mapped learners; the portal must select the learner from its authenticated session, never a supplied browser identifier. The issuer token likewise represents a trusted worker, not an individual staff member; production needs staff identity, authorization and attributable audit events. Public status exposes achievement and issuance date but does not reveal the revocation reason or raw learning evidence. A downloaded signature proves integrity against the trusted key; it does not by itself establish Cedarville's issuer identity or whether the award remains active.

`verify-export.mjs` independently checks an exported envelope against a trusted JWKS file:

```sh
node verify-export.mjs downloaded-credential.json trusted-jwks.json
```

## Learner My Badges and WordPress portal bridge

The connected local WordPress learner page is [My Badges](http://127.0.0.1:9400/my-badges/). It uses the normal WordPress sign-in session and its provisioned `external_learner_id`; no learner ID from the browser or query string selects another person's awards. The page shows earned/active/shared counts, title, description when originally attached, issuer, issue date, criteria, signature state and revocation state; supports search and status filters; downloads the original signed credential and available frozen SVG artwork; and lets the learner enable or disable a verification link. Older awards without stored artwork show **No artwork attached** rather than acquiring a later draft image. Sign-out removes access; an account with no awards shows an explicit empty state, while read failures show an error rather than an empty collection.

`portal-bridge/cu-badges.php` is a separate WordPress plugin with the `[cu_my_badges]` shortcode, shared page assets, authenticated REST callbacks and learner-owned sharing. It has now been installed and exercised in a disposable local WordPress site with the existing Node service. Its learner routes do not enroll learners or change Canvas; the separate staff routes support manual and CSV awards. The browser receives the WordPress request nonce, never the service's portal/issuer bearer keys; WordPress checks the logged-in user and the service independently checks badge ownership for both downloads and sharing. Learner routes expose only their own sharing changes; staff award routes require the separate issuer capability and award token. Sharing changes are audited as the mapped learner and preserve the original credential, signature and evidence.

The badge service reads learner awards from the configured local sources, including the separately signed historical course-9943 database. Source-aware download routes retain original signed envelopes and keys, and source-aware verification routes use the running service's origin. Existing signed identifiers are not rewritten: the older pilot envelope still contains its original loopback issuer/credential URLs, so it remains a local test export rather than a durable public production credential.

Installation on a reviewed WordPress deployment:

1. Install the plugin folder or `portal-bridge/cu-portal-badges.zip`; create a **My Badges** page at `/my-badges/` containing `[cu_my_badges]`.
2. Set `CU_BADGE_SERVICE_URL` and `CU_BADGE_PORTAL_TOKEN` in the WordPress server's private configuration or secrets loader; use the service's **portal reader token**, never its issuer key. Use HTTPS for a deployed connection; HTTP is accepted only for same-host loopback development.
3. Provision each authenticated user's `external_learner_id` from a verified institution-managed identity map; keep it out of learner-editable profile fields. The service must also know the learner. Do not infer identity from an email address or browser-supplied value.
4. Exclude `/my-badges/`, any other page containing the shortcode, and `/wp-json/cu-badges/v1/` from page/edge caches; personalised responses also send no-store headers and the page sets `DONOTCACHEPAGE`.
5. Confirm two-user isolation, signed downloads, sharing on/off, sign-out and revocation behavior before release. The existing CE sample shell includes **My Badges** navigation and routes this page to the shortcode; its wp-env configuration now mounts the bridge too.

The WordPress server needs backend access to the service. `127.0.0.1` in a Docker container is that container, so the loopback Node listener cannot simply be reached from an unrelated container. The native local WordPress preview avoids that boundary; production still needs reviewed hosting, network trust, institutional sign-in integration and stable HTTPS verification URLs.

For this Mac's disposable WordPress preview, first run the badge service, then run `../.local/node-v24.21.0-darwin-arm64/bin/node --experimental-wasm-jspi pilot/start-portal-preview.mjs` from `badge-service`. This uses the already installed WordPress Playground runtime, binds only to loopback port 9400, creates three local learner test accounts and one subscriber with the dedicated badge issuer capability and stores their random credentials and service configuration only under protected, ignored `data/wp-preview/`. It does not modify an existing production WordPress database. The site is disposable; restarting the script recreates its test accounts and invalidates their old sessions. Do not install its private preview files on a public server. The bridge package excludes all data, keys and account credentials.

A separate [local staff preview](http://127.0.0.1:4178/my-badges) shares the same learner page assets. Only an authenticated issuer can choose an approved account to preview; the resulting one-hour HttpOnly session is bound to that learner and cannot call staff APIs. This preview is not learner SSO. Use the connected WordPress page to exercise real portal sign-in.

Service interfaces for the trusted WordPress backend:

| Endpoint | Access / purpose |
| --- | --- |
| `GET /api/learners/{learner}/badges` | Portal bearer; learner's own awards across configured sources |
| `GET /api/learners/{learner}/badges/{source}/{id}/download` | Portal bearer plus exact award ownership; original signed envelope |
| `POST /api/learners/{learner}/badges/{source}/{id}/sharing` | Portal bearer plus exact ownership; boolean `{shared}` only |
| `GET /verify/{source}/{id}` | Available only when shared; public achievement and status, no learner ID/grades/evidence |
| `POST /api/admin/learner-preview` | Authenticated issuer; create a learner-bound local preview session |

Public sharing defaults off; valid active badges may be shared, and a shared revoked award reports revocation. Revoked or unverifiable awards cannot be newly shared. Disabling sharing removes the verification page but cannot recall previously downloaded/copied credentials. The plugin uses [WordPress nonce protection](https://developer.wordpress.org/apis/security/nonces/) with cookie authentication plus independent ownership checks, not nonces alone as authorization.

## Canvas read-only integration

The connector is tested with mocked API responses and has now been exercised read-only against the new live pilot module and designated internal learner. It retrieves per-student module completion, the approved final assignment's possible points, and that learner's submission. It handles pagination, rejects cross-origin pagination, sends GET requests only, and fails without awarding on missing evidence, identity mismatch, or upstream errors. The 80% threshold is approved for this technical test, not as an institutional credential policy.

The initial course configuration audit used `inventory-course.py`, without learner grades or completion reads. The subsequent user-designated learner check verified the supplied Canvas/SIS identity mapping and active student enrollment; its pilot assignment was unsubmitted. The issuance connector additionally requires published modules with `all` completion policies, a nonempty set of verified completed requirements, and a published assessment; a module with no requirements cannot qualify just because Canvas reports a completed state. Canvas omitted `published` in the student-specific module list during the live test, so the connector now reads module definition metadata separately when necessary.

Before testing against Canvas:

1. Choose an approved sandbox course, required module IDs, final assignment ID, and exact passing criterion.
2. Copy `config.example.json` into a private configuration file; set numeric `canvasCourseId`, `canvasAssignmentId`, `requiredModuleIds`, and approved learner-to-`canvasUserId` mappings; change the issuer label and course ID.
3. Set `CANVAS_BASE_URL` to the approved HTTPS origin and load `CANVAS_TOKEN` from protected environment configuration, with permission for the documented GET endpoints.
4. Set `BADGE_DEMO=false`, `BADGE_CONFIG` to that file, and `BADGE_DATA_DIR` to a **new** pilot data directory before starting.
5. A trusted server worker can then POST a mapped learner ID to `/api/sync` with the issuer token; submitted scores or module arrays are ignored.

There is no scheduler, event queue, notification email, institutional SSO, payment integration, enrollment provisioning, or standards issuer adapter in this build. An HTTP read failure can safely be retried; a successful duplicate sync keeps the original award. Production must add retry/backoff and an exception queue, plus a reviewed policy for changed grades and credential replacement.

## Open Badges 3.0 credential model — step 1

The isolated `ob3-model.mjs` adapter now maps approved frozen badge versions and a trusted, pre-verified recipient registry into an **unsigned** `OpenBadgeCredential` data model using the pinned official schema and contexts. It retains artwork, title, description, criteria and issuer; uses an opaque recipient UUID; and excludes input Canvas IDs, grades, SIS keys and raw evidence. Offline validation combines JSON Schema, the service's narrower canonical profile and JSON-LD expansion with a context allowlist. A synthetic example and explicit unsigned validation report are checked in under `standards/ob3/examples/`; see [model instructions and boundaries](standards/ob3/README.md).

This completes model construction only. The adapter is not connected to live issuance or existing downloads, and it does not supply signatures, revocation, issuer authority, external interoperability or certification. Original signed pilot awards keep their existing format and content.

## Next implementation gates

- Choose the credential issuer: evaluate the actual [Badge Engine source and technical documentation](https://github.com/digital-promise/badge-engine) as an adapter or replace the CU envelope with a standards implementation; do not guess its API or claim a turnkey Canvas connection.
- Implement and independently validate signed Open Badges exports, supported credential status, issuer key provenance, and wallet import/export using the [1EdTech implementation guide](https://standards.1edtech.org/open-badges/guides/standards/v3p0/impl).
- Assign the institutional issuer, application owner, approved course rule, privacy/sharing policy, correction/revocation process, and records retention.
- Configure institutional identity, a stable HTTPS issuer domain, scoped server authorization, secret/key management, rate limits, monitoring, backups with restoration tests, and durable credential verification URLs.
- Repeat the now-verified local WordPress two-user isolation and sharing checks in the institutional deployment; replace shared staff-key access with authenticated staff workflows.
- Pilot with ten internal learners, verify external portability and revocation, and document support ownership before production.

The application intentionally refuses non-loopback issuer origins. Production hosting requires a deliberate change and review of reverse-proxy trust, authentication, public origin, and demo disablement; this starter must not simply be exposed as a public production service.

Sources: [Canvas modules API](https://developerdocs.instructure.com/services/canvas/resources/modules), [Canvas assignments API](https://developerdocs.instructure.com/services/canvas/resources/assignments), [Canvas submissions API](https://developerdocs.instructure.com/services/canvas/resources/submissions), [1EdTech Open Badges guide](https://standards.1edtech.org/open-badges/guides/standards/v3p0/impl), [Digital Promise Badge Engine](https://github.com/digital-promise/badge-engine).


## Certificate signature images

In **Certificates**, use **Signature image** to upload a PNG or JPEG up to 2 MB; a tightly cropped transparent PNG gives the cleanest placement. The image is centered above the signatory line/name in both the live preview and PDF, without stretching. **Remove signature image** clears it from the current design. Save the template before using it for future certificates or manual/CSV batches. Issued certificates retain their original frozen images; changing a template does not retrofit a signature into an earlier certificate. The uploaded image is visual artwork, not a cryptographic PDF signature.

The local operator-requested issuer-key change applies to both existing `data/writer-token` and `data/course-9943/writer-token` files; each retains mode 0600. The local publishing, awards, register, certificate and learner-preview sign-ins share the active service’s issuer authentication. Portal service tokens and cryptographic signing keys are separate. Fresh data directories continue to generate random keys rather than inheriting a hard-coded development password.


## Left-aligned certificate header and custom logo

The **Header** field near the top of Certificates adds optional, left-aligned text (up to 140 characters) to the top-left of the certificate. The PDF wraps it within a reserved area and rejects overflow. The **Custom logo** upload sits directly below this field and accepts PNG/JPEG up to 2 MB; a saved-logo thumbnail and **Remove custom logo** control show which image is included. Both fields update the live preview and persist in saved template revisions. The logo stays centered above the issuer whether or not a header is present; the header remains left-aligned in its own reserved area. Save the template before using it for new certificates. Old templates without a header remain valid, and already-issued certificates keep their original header/logo content.
