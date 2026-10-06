// Plain-language wording for audit actions and system actors shown to staff.
export const auditLabels: Record<string, string> = {
  "approval.requested": "Approval requested",
  "approval.approved": "Approval granted",
  "approval.declined": "Approval declined",
  "approval.requested_again": "Approval requested again",
  "approval.expired": "Approval expired",
  "seat.reserved": "Seat reserved",
  "seat.expired": "Reservation expired",
  "prototype.payment_simulated": "Payment simulated",
  "prototype.identity_simulated": "Identity prepared (simulated)",
  "prototype.enrollment_simulated": "Enrollment completed (simulated)",
  "prototype.provisioning_delayed": "Provisioning delayed (simulated)",
  "prototype.provisioning_retry_scheduled": "Automatic retry scheduled",
  "prototype.provisioning_failed": "Provisioning failed — staff review needed",
  "exception.retry_requested": "Staff retried provisioning",
  "exception.resolved_manually": "Manual enrollment recorded",
  "prototype.simulation_changed": "Simulation outcome changed",
  "offering.created": "Draft offering created",
  "prototype.offering_published": "Offering published",
  "offering.settings_changed": "Offering settings changed",
};
export const actorLabels: Record<string, string> = {
  "demo-staff": "Staff (demo)",
  "demo-learner": "Legacy demo learner",
  "demo-automation": "Automation token",
  "prototype-worker": "Background worker",
};
export const stageLabels: Record<string, string> = {
  identity: "Identity preparation",
  canvas: "Canvas enrollment",
};
