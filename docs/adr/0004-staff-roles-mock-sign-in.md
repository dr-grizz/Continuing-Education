# ADR 0004: Staff roles and configurable Canvas OAuth sign-in

Status: accepted for the local prototype October 7, 2026; amended October 14 with the implemented Canvas OAuth staff flow. It addresses the local staff portion of A4; learner authentication and institutional acceptance remain open. It supersedes ADR 0001's single shared staff profile.

## Context

At the original October 7 decision, real staff authentication was not available. The amendment below records the subsequently implemented Canvas OAuth integration backed by Canvas's institutional sign-in. Previously every staff request used one shared `STAFF_API_TOKEN` profile, so anyone using the website could act as staff with every permission, and the audit log could not say which person acted. The plan's M5 calls for distinct staff roles.

## Decision

- **Staff directory:** a `staff_members` table holds email, display name, one or more roles (`staff_role` enum), an active flag and a version. It also reserves `auth_provider` (default `mock`) and `external_subject` for the configured provider/origin and verified Canvas user ID.
  - Six synthetic demo staff are seeded on the reserved `.test` domain (`*@cuce.test`, for example `approver@cuce.test`): one per role, plus an administrator with every role. The domain can never reach a real mailbox.
- **Roles:** the plan's five M5 roles (approver, catalog manager, support, Finance, IT/Canvas administrator; **Finance was removed on October 8, 2026**, migration `013_remove_finance_role`, because the university Finance department is outside Continuing Education and works only in Stripe), plus a proposed **staff administrator** role for managing staff and roles, and a **content editor** role for sales pages (decision F2). Adding an enum value takes its own migration (`4_content_editor_role`), because the value cannot be used in the transaction that adds it.
  - Roles map to permission scopes in `src/server/roles.ts`. Endpoints check scopes, never role names.
  - Every staff member gets `staff:read` and `reports:read`. A member with several roles gets every scope they grant.

    | Role | Additional scopes |
    | --- | --- |
    | Approver | `approvals:decide` |
    | Course manager | `catalog:write`, `canvas:read`, `canvas:sync` |
    | Support | `exceptions:resolve`, `prototype:simulate`, `learners:manage`, `payments:read`, `refunds:request` |
    | ~~Finance~~ (removed Oct 8, 2026) | `reports:sales` (sales figures on the dashboard). Its scopes, with `payments:read` and `refunds:request` added in M5, moved to the staff administrator |
    | IT/Canvas administrator | `exceptions:resolve`, `prototype:simulate`, `canvas:read`, `canvas:sync`, `canvas:manage` |
    | Staff administrator | `staff:manage`, `reports:sales`, `payments:read`, `refunds:request`, `canvas:read`, `canvas:sync`, `canvas:manage` |
    | Content editor (added Oct 7, 2026) | `content:write`: Explore tab picks (decision F12, shared with `catalog:write`); offering sales-page editing/publishing (implemented) |

  - Role permissions are fixed in code. Staff administrators assign roles to people but cannot change what a role allows.
- **Mock staff sign-in:** the staff token alone grants only `staff:session`, which allows looking up the staff directory and running mock sign-in.
  - To act, a request must also carry `X-Prototype-Staff-Id` naming an **active** member. The guard then grants exactly that member's scopes and records the actor as `staff:<id>`.
  - The website signs staff in by email with no password, and keeps the member ID in an HTTP-only `ce-demo-staff` cookie, which lasts 8 hours.
  - Deactivated members lose access on their next request.
- **Staff management:** staff administrators add members, change names, assign roles and activate or deactivate members (version-checked, audited as `staff.created` and `staff.updated`). Email cannot change.
  - At least one active staff administrator must remain, enforced in a transaction under an advisory lock.
  - Members are deactivated, never deleted, so audit history stays attributable.

## Canvas OAuth sign-in (implemented amendment)

The implemented staff adapter uses Canvas OAuth with the existing developer key/callback. This supersedes the originally proposed direct portal OIDC/SAML staff add-on. Canvas continues using IT-managed SSO/MFA upstream; the portal does not configure a new institutional login integration or assert a fresh MFA challenge from OAuth success.

1. In `STAFF_AUTH_MODE=canvas`, bind an existing active portal staff member to `(canvas:<origin>, numeric Canvas user ID)` through the administrative linking tool. Email only selects the pre-approved portal record for that tool. No automatic login-time email matching, unknown-user admission, group-to-role mapping or role assignment is implemented.
2. OAuth state and an independent HTTP-only browser nonce are hashed, expire after ten minutes and are consumed once. Exchange the returned code server-side over HTTPS at the configured Canvas origin, using the exact registered redirect URI and explicit User-Agent.
3. Identity-only mode requests `/auth/userinfo` and retains no API token. When course reads are enabled, the same OAuth client requests the narrow GET scopes in [Canvas courses](../canvas-courses.md); authorized staff access/refresh tokens are encrypted server-side with staff/configuration binding. The browser receives only the opaque portal session cookie; its hash is persisted.
4. Every staff request rechecks session expiry, active identity binding and current portal roles. Mutations/logout enforce same-origin protection. Mock directory/session selection and browser-supplied staff identity headers cannot bypass Canvas mode. Missing configuration fails closed.
5. Staff grants authorize Canvas reads only as permitted by that user's Canvas permissions and developer-key scopes; portal roles independently limit who can read/import/manage schedules. Imports can create unpublished drafts with `canvas:sync`; editing/publishing still needs `catalog:write`. Staff administration alone does not grant that scope.
6. Portal logout revokes the portal session but retains the staff API grant for explicitly owned scheduled previews. Disconnect removes that API grant and pauses its schedule. Stored mappings/history and the upstream Canvas/SSO session are preserved; revocation/deactivation/lost permissions stop or pause reads.

`STAFF_AUTH_MODE=mock` remains the default for synthetic local demonstrations, with the original directory/cookie behavior. Production machine authentication, real learner authentication, MFA assurance and identity recovery remain separate decisions. See [authentication configuration and verification](../canvas-staff-auth.md), [ADR 0007](0007-canvas-course-connector.md) and the [current plan and diagrams](../implementation-plan.md).

## Consequences

- Roles can be exercised end to end now, and audit entries name the individual staff member.
- **Mock mode is not authentication.** The following limitations apply to mock selection, not to the implemented Canvas-mode session flow.
  - Anyone who can reach the site can choose any demo staff member.
  - The member-ID cookie is unsigned, like the learner cookie.
  - The staff token still sits behind the web proxy.

  The prototype must remain local-only (ADR 0001).
- Earlier audit entries keep the shared `demo-staff` actor.
- The staff administrator role and the scope mapping are proposals and need sponsor review. They are recorded in the decision register.
