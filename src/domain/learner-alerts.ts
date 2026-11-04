export const alertKinds = [
  "stalled_verification",
  "completion",
  "credential_expiration",
  "canvas_inactivity",
  "canvas_performance",
] as const;
export type AlertKind = (typeof alertKinds)[number];
export const alertLabels: Record<AlertKind, string> = {
  stalled_verification: "Stalled verification",
  completion: "Completion milestone",
  credential_expiration: "Upcoming credential expiration",
  canvas_inactivity: "Canvas inactivity",
  canvas_performance: "Canvas performance",
};
export type AlertRule = {
  id: string;
  name: string;
  kind: AlertKind;
  offering_id: string | null;
  cohort_id: string | null;
  learner_id: string | null;
  days: number;
  threshold: number;
  enabled: boolean;
  version: number;
  owner_id: string;
  evaluated_at: string | null;
  evaluation_error: string | null;
  source_warning: string | null;
  sync_succeeded_at: string | null;
  sync_checked_at: string | null;
  sync_error: string | null;
  created_at: string;
};
export type LearnerAlert = {
  id: string;
  rule_id: string;
  rule_name: string;
  kind: AlertKind;
  learner_id: string;
  learner_name: string;
  title: string;
  message: string;
  evidence: Record<string, unknown>;
  state: "open" | "acknowledged" | "snoozed" | "resolved";
  detected_at: string;
  observed_at: string;
  snoozed_until: string | null;
  version: number;
  source_unavailable: boolean;
};
export type AlertDashboard = {
  canvasSession: CanvasAlertSession;
  rules: AlertRule[];
  alerts: LearnerAlert[];
  counts: Record<string, number>;
  limited: boolean;
  checkedAt: string;
  canvasEnabled: boolean;
  workerEnabled: boolean;
  lastWorkerError: string | null;
  options: {
    offerings: { id: string; title: string }[];
    cohorts: { id: string; name: string; offering_id: string }[];
    learners: { id: string; name: string }[];
  };
};
export type CanvasAlertSession = {
  mode: "mock" | "canvas";
  staffId: string | null;
  staffName: string;
  status:
    | "mock"
    | "disabled"
    | "unconfigured"
    | "forbidden"
    | "reconnect"
    | "connected";
  connected: boolean;
  canSync: boolean;
  message: string;
};
export type AlertCandidate = {
  key: string;
  subject: string;
  learnerId: string;
  title: string;
  message: string;
  observedAt: string;
  evidence: Record<string, unknown>;
};
export const DAY_MS = 86400000;
