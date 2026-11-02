# QR codes, claim codes, and paired accomplishments

The **QR and claim-code distribution** section appears in **Staff → Certificates** and **Staff → Award badges**. It distributes an existing earned badge, its attached certificate, or both to the same learner. Staff need `badges:manage`; learners redeem through their own authenticated and explicitly linked portal account.

## Distribute an accomplishment

1. Select an issued accomplishment and its named recipient. The account must already be linked to an active portal learner. A certificate must already exist to choose **Certificate** or **Badge and certificate together**.
2. Choose the package and an expiry of 1–30 days. Confirm the recipient and accomplishment, then choose **Create QR and claim code**.
3. Review the recipient, package and expiry. Download the QR image, copy the private claim link, or copy the typed claim code. The QR and typed code open the same recipient-bound distribution.
4. The learner scans the QR or visits the claim page and enters the code. Sign-in returns to the claim page and retains the code in that browser tab. The claim receipt offers the badge credential, certificate PDF, or both, according to the chosen package.
5. Use **Claim history** to view status and events or revoke a code with confirmation. Expired, claimed, revoked and unavailable distributions remain recorded. Revoking a code does not revoke the earned accomplishment. Badge revocation or learner deactivation prevents subsequent claims/downloads through the normal credential ownership checks.

Claiming acknowledges receipt of an already-issued accomplishment; it does not create another badge, transfer ownership, check course completion or enroll someone. Wrong-account, invalid, expired and revoked codes return the same unavailable message. Repeated claims by the intended learner return the same receipt without issuing duplicate credentials. Attempts are limited to ten per linked learner account over five minutes, persisted across API restarts. Normal repeat creation returns the active code already assigned to that award/package; revoke it first to replace it.

Codes contain 100 bits of pseudorandom material and are stored as hashes. QR links place the code in the URL fragment, which the claim page removes from history before exchanging the code in a same-origin POST body. The pending code is stored only in that tab's session storage during sign-in and removed after successful claiming. Do not publish recipient-specific codes as an open enrollment invitation. Codes are not public badge-verification links and cannot make an unsigned Open Badges model certified.

## Award a badge and certificate together

In **Staff → Award badges**, select the approved badge and choose a certificate template under **Award badge and certificate together**. Supply the recipient's printed name, review the award and confirm issuance. Both outputs belong to that learner and the same accomplishment; the certificate is attached to the badge record. This works for individual entry and CSV batches. Existing badges can receive a certificate through **Staff → Certificates → Create from an earned award**, without issuing the badge again. Selecting a template affects new awards; an already-awarded CSV row does not silently create a second badge or attach a new certificate.

## Local demonstration records

The local development database contains two explicitly fictional sample learners:

| Demo learner | Local demo sign-in email | Records |
| --- | --- | --- |
| Alex Morgan (Demo) | `ce-qr-alex@example.test` | One demo badge with an attached certificate; combined QR/claim distribution |
| Jordan Rivera (Demo) | `ce-qr-jordan@example.test` | One demo badge with an attached certificate; separate badge and certificate distributions |

Sign in as **Demo Staff Administrator**, open **Certificates**, and find **DEMO · Foundations of Faith and Work** in the distribution selector or claim history. The certificate template is **DEMO · Completion certificate**. The awards and PDFs visibly identify themselves as fictional demonstrations. In the local mock sign-in mode, use either email above and any password to demonstrate that learner's claim and downloads. Do not use real students' addresses for these samples.

`npm run badges:seed-demo` creates the sample records and prepares active distributions; repeat runs preserve the existing sample badges/certificates. It preserves unrelated account links and refuses conflicting or inactive sample identities. It is restricted to the local mock-identity prototype and makes no Canvas or email-provider calls. The private `BADGE_DATA_DIR/distribution-demo-records.json` manifest records the sample IDs; codes are available only through the authenticated staff workspace. Existing templates, awards, learners and external identities are preserved.

## Hosting and maintenance

Run migration `027_credential_claims` and rebuild the credential assets before restarting the API. `WEB_URL` supplies the claim link origin: use the real public HTTPS portal origin in a hosted environment. The local demo uses `http://localhost:3050`; a phone scanning that URL will look for a server on the phone itself, so phone-based scanning needs a reachable HTTPS deployment. The QR image itself can be decoded independently on this computer.

Back up the private `BADGE_DATA_DIR/claim-code-key` file with the issuer keys, explicit learner links and PostgreSQL database. Losing or changing this key makes affected distributions unavailable; restore it or revoke and replace those distributions. The existing deployment audience gate still applies. No external QR service, email provider, new listener, scheduled worker or SQLite store is used by distribution.

See [ADR 0016](adr/0016-recipient-bound-credential-claims.md) and the [verification record](testing/credential-distribution-verification.md).
