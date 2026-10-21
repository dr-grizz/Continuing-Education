# Open Badges 3.0 — step 1 credential model

This folder provides an **unsigned data model**, its pinned standards references, a synthetic example and offline validation. It does not produce an issued/verifiable credential, sign a proof, check issuer authority or revocation, or claim 1EdTech certification. The existing CU signed-envelope issuance/download paths remain in place; no current award or Canvas record is migrated or modified by the model builder.

## Pinned references

The selected profile follows [Open Badges 3.0, document revision 1.4.5, June 29, 2026](https://www.imsglobal.org/spec/ob/v3p0/) with the W3C Verifiable Credentials v2 context and Open Badges context 3.0.3. `vendor/manifest.json` records each source URL, resolution URL, retrieval time and SHA-256 hash. Every reference file is checked against that manifest when the model module loads; changes require review and a new pin. The official schema URL is mutable, so the checked-in bytes and hashes determine exactly what these local checks use.

| Local reference | Source |
| --- | --- |
| `achievementcredential.schema.json` | [Official credential JSON Schema, draft 2019-09](https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json) |
| `ob-context-3.0.3.json` | [Versioned Open Badges context](https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json) |
| `vc-context-v2.json` | [W3C VC v2 context](https://www.w3.org/ns/credentials/v2) |
| `ob-extensions.json` | [Official schema/refresh extension context](https://purl.imsglobal.org/spec/ob/v3p0/extensions.json) |

The downloaded official schema labels itself a JSON-LD adaptation and allows some broad forms, such as string/scalar or multilingual representations; the service preserves those bytes unchanged and additionally enforces its own narrower canonical model profile. This local profile is an implementation choice, not a claim that Open Badges requires every CU restriction below. Schema validity alone does not establish a valid proof or a verified issuer/recipient; see the specification's [verification procedure](https://www.imsglobal.org/spec/ob/v3p0/).

## Builder inputs and mapping

`../../ob3-model.mjs` exports `buildUnsignedOpenBadge(input)` and `validateUnsignedOpenBadge(model)`.

| Trusted input | Model field |
| --- | --- |
| Approved/active `PublishingCatalog` version | Immutable Achievement identifier derived from issuer origin + version UUID; `version` is the saved draft revision |
| Frozen design title/description | Credential display name/description and `credentialSubject.achievement.name`/`description` |
| Frozen earning criteria | `credentialSubject.achievement.criteria.narrative` |
| Frozen SVG artwork | Embedded `Image` data URI at credential and achievement level, with matching caption |
| Explicit HTTPS issuer profile matching the frozen issuer name | `issuer` with `Profile` type, id, name and optional homepage |
| Stable credential UUID under the issuer HTTPS origin | `id` at `/credentials/{uuid}` |
| Pre-verified recipient registry entry | `credentialSubject.id` as the registry's opaque `urn:uuid:` ID; `AchievementSubject` type |
| Explicit timestamps | `validFrom`, optional `validUntil` |

The Image model permits a URI or Data URI; embedding the already frozen SVG preserves the exact artwork without inventing a hosted asset URL. External wallet rendering of this representation remains untested. The canonical profile requires HTTPS issuer/credential URLs, version-bound achievement URLs and opaque UUID subject IDs; broader identifiers or alternative image delivery need a reviewed profile change.

The registry is a **trusted backend input**, not a browser assertion and not an identity-verification service. Each entry needs `subjectId`, `verified: true`, `method` (`canvas-sis-match`, `institutional-identity`, or explicitly synthetic test data) and `verifiedAt`; the builder requires verification and badge approval to precede validity start. The caller must establish the real identity binding before provisioning that entry and retain it for reuse; the builder does not query Canvas, resolve a DID or prove recipient control. The synthetic fixture deliberately supplies fictional verification metadata. Email, Canvas user IDs, SIS learner keys, scores and raw evidence from input are not copied into the model; known recipient verification can be added later using an institution-approved identifier strategy.

The returned object is deeply frozen and its inputs are not mutated. Editing a draft does not change a previously approved version or any model built from that frozen version; the tests exercise this with the actual `PublishingCatalog`. Archived or unsaved versions cannot be used for new model generation. Model construction does not decide course eligibility, insert an award, allocate revocation status, sign, or change sharing.

## Run and inspect

Install exact dependency versions and their lockfile dependencies from the service folder:

```sh
npm ci --ignore-scripts
node ob3-model-cli.mjs example standards/ob3/examples
node ob3-model-cli.mjs validate standards/ob3/examples/synthetic-unsigned-credential.json
node --test test/*.test.mjs
```

For this workspace's bundled Node runtime, substitute `../.local/node-v24.21.0-darwin-arm64/bin/node` for `node`; npm can be invoked with that Node executable followed by `../.local/node-v24.21.0-darwin-arm64/lib/node_modules/npm/bin/npm-cli.js`.

The example uses only fictional data and reserved `example.invalid` URLs, which are deliberately not deployed issuer endpoints. Its SVG comes from the same renderer as approved badge artwork. `validation-report.json` explicitly reports `stage: unsigned-model`, schema and JSON-LD results, and `proofVerified: false`, `issuerAuthorityVerified: false`, and `statusChecked: false`. CLI validation exits nonzero on an invalid model; it never issues credentials.

Validation performs three checks offline: the unchanged official schema with date formats, the narrower CU field/identifier/metadata profile, and safe JSON-LD expansion using only checksum-pinned context documents. Unrecognized context URLs are rejected without network fallback; arbitrary extra fields and pretend proofs are rejected by this unsigned profile. This validation does not attest that arbitrary unsigned metadata matches a trusted catalogue; that binding comes from the builder's trusted catalogue/registry inputs and is ultimately protected by signing in step 2.

## Remaining work

Step 2 adds standards-based proofs and an independent cryptographic verifier; subsequent work supplies durable issuer/key/status endpoints, credential lifecycle handling, external wallet tests and formal [1EdTech conformance testing](https://www.imsglobal.org/spec/ob/v3p0/cert/). Only after those pieces are validated should the new format be connected to actual issuance and My Badges downloads. The builder is intentionally separate from the running service's credential records and export routes.
