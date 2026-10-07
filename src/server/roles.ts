import { StaffRole } from "../generated/prisma/enums";

// Staff role → permission scopes. Endpoints check scopes, never role names, so a later
// SSO add-on only has to resolve a signed-in person to a staff member and their roles.
export const roleScopes: Record<StaffRole, readonly string[]> = {
  approver: ["approvals:decide"],
  catalog_manager: ["catalog:write"],
  support: ["exceptions:resolve", "prototype:simulate", "learners:manage"],
  // Refunds and reconciliation actions arrive with M5; read-only until then.
  finance: [],
  it_canvas_admin: ["exceptions:resolve", "prototype:simulate"],
  staff_admin: ["staff:manage"],
};
// Every active staff member can view the staff workspace and its reports.
export const baseStaffScopes = ["staff:read", "reports:read"] as const;

export const roleLabels: Record<StaffRole, string> = {
  approver: "Approver",
  catalog_manager: "Catalog manager",
  support: "Support",
  finance: "Finance",
  it_canvas_admin: "IT/Canvas administrator",
  staff_admin: "Staff administrator",
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
    "Recovers failed provisioning, manages learner account access and runs the prototype provisioning simulation.",
  finance:
    "Views orders, reports and activity. Refund and reconciliation actions arrive with M5.",
  it_canvas_admin:
    "Recovers identity and Canvas failures, including recording manual enrollment.",
  staff_admin: "Adds staff members, assigns roles and deactivates access.",
};
export const scopeDescriptions: Record<string, string> = {
  "staff:read":
    "View the staff workspace: offerings, approvals, exceptions, activity",
  "reports:read": "Read reports and the audit log",
  "approvals:decide": "Approve or decline approval requests",
  "catalog:write": "Create, edit, publish and unpublish offerings",
  "exceptions:resolve": "Retry provisioning or record manual enrollment",
  "prototype:simulate": "Change the prototype provisioning simulation",
  "staff:manage": "Manage staff members and their roles",
  "learners:manage": "Deactivate or reactivate learner accounts",
};
