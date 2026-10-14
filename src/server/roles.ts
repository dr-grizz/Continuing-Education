import { StaffRole } from "../generated/prisma/enums";

// Staff role → permission scopes. Canvas OAuth resolves the approved staff identity;
// endpoints apply current portal scopes independently of Canvas API permissions.
export const roleScopes: Record<StaffRole, readonly string[]> = {
  approver: ["approvals:decide"],
  catalog_manager: ["catalog:write", "canvas:read", "canvas:sync"],
  support: [
    "exceptions:resolve",
    "prototype:simulate",
    "learners:manage",
    "payments:read",
    "refunds:request",
  ],
  it_canvas_admin: [
    "exceptions:resolve",
    "prototype:simulate",
    "canvas:read",
    "canvas:sync",
    "canvas:manage",
  ],
  // Also holds the former Finance role's permissions (removed October 8, 2026):
  // the university Finance department works in Stripe, not in the portal.
  staff_admin: [
    "canvas:read",
    "canvas:sync",
    "canvas:manage",
    "staff:manage",
    "reports:sales",
    "payments:read",
    "refunds:request",
  ],
  // Sales pages (built October 8, 2026) and, with catalog managers, the Explore tab picks.
  content_editor: ["content:write"],
};
// Every active staff member can view the staff workspace and its reports.
export const baseStaffScopes = ["staff:read", "reports:read"] as const;

export const roleLabels: Record<StaffRole, string> = {
  approver: "Approver",
  catalog_manager: "Course manager",
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
    "Edits, previews and publishes course sales pages, and chooses the learner Explore tab picks. Cannot change prices, dates or course publication.",
};
export const scopeDescriptions: Record<string, string> = {
  "canvas:read":
    "View Canvas course connection status and the last successful course preview",
  "canvas:sync":
    "Read published Canvas courses using your own OAuth authorization",
  "canvas:manage":
    "Enable or pause scheduled Canvas course reads under your authorization",
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
    "Edit, publish and remove course sales pages; choose the Explore tab picks",
};
