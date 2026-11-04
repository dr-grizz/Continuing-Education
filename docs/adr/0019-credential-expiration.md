# ADR 0019: Optional credential expiration

Accepted November 4, 2026 at the project owner's request.

A badge design and a certificate template each have an optional fixed `expirationDate` calendar date. Approved badge versions and template revisions supply independent defaults for new issuance. Blank means no expiration. Dates remain valid through the end of the selected day in UTC. Server validation rejects invalid calendar dates and prevents issuance after the selected date has passed.

The existing signed pilot badge payload and signed certificate JSON snapshot include `expirationDate` and the derived UTC `validUntil` deadline at issuance. PostgreSQL already persists these JSON documents; this addition needs no schema migration or rewriting of old signatures. The separate unsigned Open Badges model inherits the approved badge's date when no explicit `validUntil` is supplied; this does not change the pilot credential's certification or proof format.

Current status is computed on read, with revocation before expiration. Signature integrity is independent from current validity. Staff and learner records preserve expired awards and their historical downloads. Existing opted-in public links show an expired status, and new sharing cannot be enabled after expiration. Revoked/unverifiable source awards retain the prior download restrictions.

New certificate issuance and distribution/email workflows require a currently active source badge; certificate delivery also requires an unexpired certificate. Each reviewed or queued email is checked at confirmation, before sending, after rendering, and on bearer-link downloads. Claim creation and redemption recheck validity. Expiring a distribution code or email link remains separate from expiring the underlying credential.

No duration-based validity, per-recipient overrides, automatic renewal, retroactive modification, new duplicate exceptions, or deletion of historical records is introduced. The existing explicit staff authorization, immutable content, recipient binding, audit records, and issuance transactions remain the authority.
