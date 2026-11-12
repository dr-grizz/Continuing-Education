# Optional badge and certificate expiration

## Set a date

- **Badge:** open **Admin → Badges → Details → Expiration date**, choose a date, save the draft, then approve that saved revision in **Badge publishing**. The approved version supplies the expiration for new manual, CSV, or Canvas-mapped awards.
- **Certificate:** open **Admin → Certificates → Expiration date** in the template editor, choose a date, and save the template. New certificates created individually or together with badges use that saved template date.
- Leave the field blank for **no expiration**. Clear it and save a new revision to remove the requirement for future awards. A badge and its certificate may have different dates.

These are fixed calendar dates, not a duration after issuance. Every recipient of a version/template receives the same date. The credential remains valid through the entire selected day in **UTC** (`23:59:59.999Z`) and is expired after that instant. A passed date cannot be used to approve a new badge version or issue new credentials. Past certificate template dates can still be reviewed/saved as templates, but new issuance is rejected. Dates are validated on the server, including impossible calendar dates.

## Issued records and expired credentials

The date and its UTC deadline are frozen inside the signed badge payload or certificate snapshot in the existing PostgreSQL JSON storage. No schema migration is required. Existing credentials without a date remain without expiration; editing a draft/template does not change any previously issued credential or signature.

My Badges, the issuance register, certificate records, and public badge verification show expiration independently of signature integrity. The register and My Badges have an **Expired** filter. The certificate design preview and PDF print **Valid through YYYY-MM-DD (UTC)** when a date is present. Badge public sharing still requires the learner's explicit choice and never exposes certificate recipient names or PDFs.

Expired badges stop counting as active. Previously enabled verification links continue to show the historical award as **Expired**. Learners cannot newly enable sharing of an expired badge, but can disable an existing link. Authorized staff and owners retain downloads of the original historical files; revoked or unverifiable source awards still block certificate downloads. Revocation takes precedence over badge expiration.

New certificates require an active source badge. QR/claim creation and redemption, and certificate email preview, confirmation, send preflight, and emailed download links recheck current credential validity. A badge-only distribution checks the badge; certificate/both distribution also checks its certificate. Certificate email requires both an active badge and an unexpired certificate. This applies to queued and automatic email as well as reviewed sends. Expiration does not delete delivery/claim history or recall files already downloaded or emailed.

A different certificate date does not change its source badge's date. Expiration does not revoke an award, change course completion, or automatically create a renewal. Existing duplicate-issuance protection remains in place; renewal/reassessment workflows are outside this addition. Refresh a workspace to retrieve the current computed status; no background expiry job is needed.

## Verification

See [the verification record](testing/credential-expiration-verification.md) for tests and remaining review limits.
