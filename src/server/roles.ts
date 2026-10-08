import { StaffRole } from "../generated/prisma/enums";

// Staff role → permission scopes. Endpoints check scopes, never role names, so a later
// SSO add-on only has to resolve a signed-in person to a staff member and their roles.
export const roleScopes: Record<StaffRole, readonly string[]> = {
  approver: ["approvals:decide"],
  catalog_manager: ["catalog:write"],
  support: [
    "exceptions:resolve",
    "prototype:simulate",
    "learners:manage",
    "payments:read",
    "refunds:request",
  ],
  it_canvas_admin: ["exceptions:resolve", "prototype:simulate"],
  // Also holds the former Finance role's permissions (removed October 8, 2026):
  // the university Finance department works in Stripe, not in the portal.
  staff_admin: [
    "staff:manage",
    "reports:sales",
    "payments:read",
    "refunds:request",
  ],
  // Reserved for the planned sales page editor; no endpoint uses it yet.
  content_editor: ["content:write"],
};
// Every active staff member can view the staff workspace and its reports.
export const baseStaffScopes = ["staff:read", "reports:read"] as const;

export const roleLabels: Record<StaffRole, string> = {
  approver: "Approver",
  catalog_manager: "Catalog manager",
  support: "Support",
  it_canvas_admin: "IT/Canvas administrator",
  staff_admin: "Staff administrator",
  content_editor: "Content editor",
};
export const staffRoles = Object.values(StaffRole);

export function scopesFor(roles: readonly StaffRole[]): string[] {
  return [
    ...new Set([
      ...baseStaffScopes,
      ...roles.flatMap((role) => roleScopes[role]),
    ]),
  ];
}

export const roleDescriptions: Record<StaffRole, string> = {
  approver: "Reviews approval requests for approval-required offerings.",
  catalog_manager:
    "Creates, edits, publishes and unpublishes offerings, including prices and policies.",
  support:
    "Recovers failed provisioning, manages learner account access, views transactions and requests refunds, and runs the prototype provisioning simulation.",
  it_canvas_admin:
    "Recovers identity and Canvas failures, including recording manual enrollment.",
  staff_admin:
    "Adds staff members, assigns roles and deactivates access; sees sales figures and transactions and records refund requests for the Finance department.",
  content_editor:
    "Chooses the learner Explore tab picks and will edit customizable sales pages once the sales page editor exists.",
};
export const scopeDescriptions: Record<string, string> = {
  "staff:read":
    "View the staff workspace: offerings, approvals, exceptions, activity",
  "reports:read": "Read reports and the audit log",
  "reports:sales": "View sales figures on the dashboard",
  "approvals:decide": "Approve or decline approval requests",
  "catalog:write":
    "Create, edit, publish and unpublish offerings and collections; choose the Explore tab picks",
  "exceptions:resolve": "Retry provisioning or record manual enrollment",
  "prototype:simulate": "Change the prototype provisioning simulation",
  "staff:manage": "Manage staff members and their roles",
  "learners:manage": "Deactivate or reactivate learner accounts",
  "payments:read": "View transactions (read-only)",
  "refunds:request":
    "Request a refund; Finance completes it in the Stripe Dashboard",
  "content:write":
    "Choose the Explore tab picks; edit sales pages (planned, no editing screens yet)",
};
