# Email certificates

In **Staff → Certificates**, use **Email certificate** next to an issued certificate's **Download PDF** button, or use the **Email certificates** section below the list for multiple recipients. Every selected certificate creates a separate email; recipients never appear in each other's messages.

1. For an individual, choose **Email certificate** on their certificate. For a cohort, choose **Filter certificates by cohort**, then select the specific certificates to send. Selecting a cohort does not issue missing certificates or verify completion.
2. Choose a PDF attachment, a private download link, or both. Edit the subject/message using `{{name}}`, `{{achievement}}` and `{{awardDate}}` as needed.
3. Choose **Build personalized previews**. Review each actual recipient, subject and message, and use **Review certificate PDF** to check the issued certificate. Link delivery adds a private link that expires seven days after preview creation.
4. Check the authorization box and choose **Send emails**. Confirmation queues the reviewed content; use **Refresh delivery history** to see sending attempts and outcomes. Previews expire after 30 minutes. A changed email address or revoked award requires a new review.
5. Normal sends are duplicate-protected. To resend, open the previous attempt in history, select **Review and resend**, explain why, and review the individual preview again. An uncertain outcome may already have reached the provider: inspect the provider first. There are no automatic retries of uncertain sends.

**Provider accepted** means the provider accepted the request, not that it reached the learner's inbox. This addition records attempts, failures and resends; inbox delivery and bounce webhooks are not implemented. The interface shows the latest 250 non-preview attempts; older attempts remain in PostgreSQL.

## Recipient setup

A learner needs an active portal record, a valid email address on that record, and an explicit approved badge-account link. Existing `npm run badges:link-learner -- <portal-learner-uuid> <approved-badge-learner-id>` establishes the identity link; it never guesses from a printed name or email address. Duplicate/ambiguous links fail closed. Correct missing email addresses through the learner record before sending. Cohort membership comes from **Progress and cohorts**, and filters the certificates available for selection; it does not assume all that learner's certificates belong to the cohort's course.

## Server configuration

The requested sender is `continuinged@cedarville.edu`. Sending remains disabled until a provider is selected, its sender/domain verification is completed, and server credentials are installed. A Resend adapter is included; using that provider is optional and requires an institutional decision/account. Other transports, including Microsoft 365 SMTP/Graph, would need an adapter for the institution's approved authentication method.

```dotenv
CERTIFICATE_EMAIL_FROM=continuinged@cedarville.edu
CERTIFICATE_EMAIL_PROVIDER=resend
CERTIFICATE_EMAIL_ENABLED=true
RESEND_API_KEY=<private-server-credential>
WEB_URL=https://your-public-portal.example.edu
CERTIFICATE_EMAIL_ALLOW_DEMO=false
```

Keep credentials in the private server environment, never `NEXT_PUBLIC_` variables, source files, or browser storage. Restart the API after changing environment settings. `WEB_URL` must be the real public HTTPS portal origin for links; attachment-only delivery does not require a link origin. Do not point learner emails at a developer's localhost address. The application does not verify domain ownership itself; the provider must authorize the sender. See [Resend sending API](https://resend.com/docs/api-reference/emails/send-email) and [idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

**Automatic delivery** is a separate staff setting under **Email settings and automatic delivery**, off by default. Save the desired message/format and explicitly enable it after provider configuration. Only newly created certificates queue emails, including certificates created atomically with manual/CSV badge awards. Existing certificates are never backfilled. Fictional demonstration awards are blocked by default; `CERTIFICATE_EMAIL_ALLOW_DEMO=true` is an explicit testing override. Turning off automatic delivery cancels automatic emails that have not started sending.

The API's built-in worker processes the durable PostgreSQL queue while the app is running; a restart preserves jobs. Back up `BADGE_DATA_DIR/certificate-email-link-key` with the existing private issuer keys, account links and database. This secret is created locally with restricted permissions and never appears in the browser. Link holders can download only the associated certificate while its award/contact binding remains valid; links can be forwarded, so keep them private. Revoking an award invalidates future downloads but cannot recall a PDF already received.

Architecture and state guarantees: [ADR 0015](adr/0015-certificate-email-delivery.md).
