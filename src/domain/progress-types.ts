export type ProgressState =
  "awaiting_verification" | "not_started" | "in_progress" | "completed";
export type ProgressStep = {
  id: string;
  title: string;
  required: boolean;
  position: number;
  eventId: string | null;
  state: ProgressState;
  note: string;
  reference: string;
  recordedAt: string | null;
  source: string | null;
};
export type ProgressParticipant = {
  id: string;
  learnerId: string;
  name: string;
  active: boolean;
  steps: ProgressStep[];
  completed: number;
  required: number;
  percent: number;
  state: ProgressState;
};
export type ProgressReport = {
  plan: { id: string; title: string; revision: number; offeringId: string };
  steps: { id: string; title: string; required: boolean }[];
  participants: ProgressParticipant[];
  cohort?: { id: string; name: string };
  summary: {
    learners: number;
    completed: number;
    inProgress: number;
    awaitingVerification: number;
    notStarted: number;
  };
};
export type ProgressCatalog = {
  plans: {
    id: string;
    title: string;
    revision: number;
    offering_id: string;
    participants: number;
    steps: { id: string; title: string; required: boolean }[];
  }[];
  cohorts: {
    id: string;
    name: string;
    plan_id: string;
    title: string;
    revision: number;
    members: number;
  }[];
  learners: { id: string; email: string | null; display_name: string | null }[];
};
