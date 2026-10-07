# ADR 0004: Staff roles with mock sign-in; SSO as a later add-on

Status: accepted for the local prototype, October 7, 2026. It partly addresses decision A4 (authentication) by deferring real staff authentication. It supersedes ADR 0001's single shared staff profile.

## Context

Real authentication (university SSO with MFA for staff) is not available yet. Previously every staff request used one shared `STAFF_API_TOKEN` profile, so anyone using the website could act as staff with every permission, and the audit log could not say which person acted. The plan's M5 calls for distinct staff roles.

## Decision

- **Staff directory:** a `staff_members` table holds email, display name, one or more roles (`staff_role` enum), an active flag and a version. It also reserves `auth_provider` (default `mock`) and `external_subject` for SSO.
  - Six synthetic demo staff are seeded on the reserved `.test` domain (`*@cuce.test`, for example `approver@cuce.test`): one per role, plus an administrator with every role. The domain can never reach a real mailbox.
- **Roles:** the plan's five M5 roles (approver, catalog manager, support, Finance, IT/Canvas administrator), plus a proposed **staff administrator** role for managing staff and roles, and a **content editor** role for sales pages (decision F2). Adding an enum value takes its own migration (`4_content_editor_role`), because the value cannot be used in the transaction that adds it.
  - Roles map to permission scopes in `src/server/roles.ts`. Endpoints check scopes, never role names.
  - Every staff member gets `staff:read` and `reports:read`. A member with several roles gets every scope they grant.

    | Role | Additional scopes |
    | --- | --- |
    | Approver | `approvals:decide` |
    | Catalog manager | `catalog:write` |
    | Support | `exceptions:resolve`, `prototype:simulate` |
    | Finance | `reports:sales` (sales figures on the dashboard; refunds arrive in M5) |
    | IT/Canvas administrator | `exceptions:resolve`, `prototype:simulate` |
    | Staff administrator | `staff:manage` |
    | Content editor (added Oct 7, 2026) | `content:write`, reserved for the planned sales page editor; no endpoint uses it yet |

  - Role permissions are fixed in code. Staff administrators assign roles to people but cannot change what a role allows.
- **Mock staff sign-in:** the staff token alone grants only `staff:session`, which allows looking up the staff directory and running mock sign-in.
  - To act, a request must also carry `X-Prototype-Staff-Id` naming an **active** member. The guard then grants exactly that member's scopes and records the actor as `staff:<id>`.
  - The website signs staff in by email with no password, and keeps the member ID in an HTTP-only `ce-demo-staff` cookie, which lasts 8 hours.
  - Deactivated members lose access on their next request.
- **Staff management:** staff administrators add members, change names, assign roles and activate or deactivate members (version-checked, audited as `staff.created` and `staff.updated`). Email cannot change.
  - At least one active staff administrator must remain, enforced in a transaction under an advisory lock.
  - Members are deactivated, never deleted, so audit history stays attributable.

## SSO add-on (later)

Replace only the sign-in step:

1. Add an OIDC or SAML login route in the web app. Staff sign-in becomes "Sign in with university SSO", and the mock directory is removed.
2. On callback, resolve the verified identity to a `staff_members` row by `(auth_provider, external_subject)`, falling back to verified email on the first login and recording the subject. Refuse inactive or unknown people instead of creating them.
3. Issue the session as a **signed** or server-side session instead of the plain member-ID cookie, and require MFA at the identity provider.
4. Optionally map identity-provider groups to roles. Otherwise keep role assignment in the Staff tab.
5. Remove the `prototype/staff-sessions` and `prototype/staff-directory` endpoints and the browser-chosen role header. A staff session becomes the only way to act as staff.

Scopes, roles, endpoint checks, audit actors and the management UI do not change.

## Consequences

- Roles can be exercised end to end now, and audit entries name the individual staff member.
- **This is not authentication.**
  - Anyone who can reach the site can choose any demo staff member.
  - The member-ID cookie is unsigned, like the learner cookie.
  - The staff token still sits behind the web proxy.

  The prototype must remain local-only (ADR 0001).
- Earlier audit entries keep the shared `demo-staff` actor.
- The staff administrator role and the scope mapping are proposals and need sponsor review. They are recorded in the decision register.
