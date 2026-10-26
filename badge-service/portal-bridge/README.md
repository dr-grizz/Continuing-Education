# CU Portal Badge Bridge (pilot v0.4.3)

Install this folder as a WordPress plugin. Create **My Badges** (`/my-badges/`) with `[cu_my_badges]` and **Award Badges** (`/award-badges/`) with `[cu_award_badges]`, plus **Certificates** (`/certificates/`) with `[cu_certificates]`.

Configure these privately in the WordPress server secrets loader:

- `CU_BADGE_SERVICE_URL`: reviewed badge-service origin, HTTPS when deployed.
- `CU_BADGE_PORTAL_TOKEN`: service `data/portal-token`; learner reads/downloads/sharing only.
- `CU_BADGE_AWARD_TOKEN`: service `data/portal-award-token`; separate staff award authority. Do not configure the broad `writer-token` here.

Provision each learner's server-managed `external_learner_id` to match the approved service learner directory. Learners must not edit this mapping. Manual-only learner entries may have `canvasUserId: null`; use explicit `demonstration: true` only for fictional test identities. The issuer page offers known accounts; CSV uploads never create accounts or infer identities from email.

Grant `cu_award_badges` to designated staff or a dedicated issuer role; administrators with `manage_options` also qualify. Ordinary subscribers cannot access the staff REST endpoints. The local disposable preview includes a dedicated subscriber test issuer with this capability, separate from three learner accounts. Staff attribution comes from WordPress's current user ID, not a browser actor field. Nonces, session authentication and capabilities are checked independently; tokens remain server-side.

Staff choose an approved/active badge, then enter one learner or upload CSV with `learner_id,reason,evidence_url` and optional `recipient_name` as the fourth column. A reason is required, an HTTPS evidence URL is optional. Files support quoted commas/newlines and UTF-8 BOM, up to 500 recipients / 1 MB. Staff review per-row results and explicitly attest before issuing ready rows. Draft/archived versions and unknown IDs cannot issue; duplicates and revoked prior awards are retained. Previews expire in 30 minutes, results persist, and retries do not reissue. Row reports can be downloaded and corrected rows uploaded as a new batch. Badge publishing/approval still uses the standalone issuer tools.

Awards appear privately in the learner's My Badges collection with original frozen artwork/criteria and download/sharing controls. The issuer register retains staff reasons, evidence URLs, batch IDs and audit history. These private attestation details are excluded from downloaded/public credentials; the method remains distinguishable from Canvas checks. No notification emails are sent.

Exclude both personalised pages, shortcode pages, and REST namespace `cu-badges/v1` from page/edge caches. Use HTTPS for deployed connections; same-host loopback HTTP is accepted only for local development. A container's loopback is not the host Mac. The service remains a loopback CU-format pilot: production hosting/identity and Open Badges signing are still separate work.

The package excludes all keys, databases, preview credentials and local service configuration. See the service [validation log](../VALIDATION.md) for automated and actual WordPress test evidence.

## Certificates

Staff can create reusable Classic/Modern templates with Cedarville defaults, landscape Letter/A4, customizable wording/signatory, and an optional PNG/JPEG logo. Save a template, select an existing active award and confirm its printed recipient name to create a certificate, or select the optional certificate template during new manual/CSV awards. Certificate batches require printed names; three-column badge-only CSV files still work. Already-issued badge rows remain skipped in award batches; use Certificates to attach a certificate to an earlier award.

Learners download their own certificate PDFs through My Badges. Staff downloads and learner downloads check the underlying award’s current validity/revocation; other learners are denied even if they supply a forged identity. Certificate content preserves its template revision, printed name, issuer, achievement and original award date. Creating/downloading a certificate preserves the badge credential. Samples and fictional awards are visibly marked. PDFs are not digitally signed or Open Badges credentials.

The same `cu_award_badges` capability and `CU_BADGE_AWARD_TOKEN` cover certificate actions; the token gains only the corresponding `/api/portal-staff/certificates/*` routes. No additional WordPress secret is needed. Install the Node service’s `certificate-renderer/requirements.txt` into a Python environment and configure `CERTIFICATE_PYTHON` on the badge server. `CERTIFICATE_FONT_REGULAR` can point to a suitable licensed TTF for additional script coverage; unsupported glyphs/overflow are rejected rather than silently clipped. The browser gets only authenticated base64 PDF responses, never service tokens. Exclude `/certificates/` and all shortcode pages from caches along with the REST namespace.


Certificate templates also support an optional PNG/JPEG **Signature image** (up to 2 MB), centered above the signatory block in live previews and PDFs. Upload/remove it in Certificates and save the template. Transparent, tightly cropped PNGs are recommended for placement. Frozen certificates preserve their originally captured image; a visual signature is not cryptographic PDF signing.


Certificates also has an optional, left-aligned **Header** field (140 characters) and a prominent **Custom logo** upload with thumbnail/removal controls near the top of the editor. The custom logo stays centered above the issuer whether or not a header is present; the header remains left-aligned in its own reserved area. Both appear in the live preview and PDF and are captured in the saved template and issued certificate snapshot. Legacy templates without a header remain compatible.
