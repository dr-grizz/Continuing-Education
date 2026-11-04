export type ImpactCredential = {
  key: string;
  learnerId: string;
  kind: string;
  sourceId: string;
  badgeId: string;
  signatureValid: boolean;
  revoked: boolean;
  issuedAt?: string;
  shared?: boolean;
};
export type ImpactRow = {
  id: string;
  title: string;
  registrations: number;
  learners: number;
  assignments: number;
  completed: number;
  inProgress: number;
  awaitingVerification: number;
  notStarted: number;
  completionRate: number | null;
};
export type EngagementImpact = {
  generatedAt: string;
  range: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    days: number;
  };
  filters: { offeringId: string | null; cohortId: string | null };
  options: {
    offerings: { id: string; title: string }[];
    cohorts: { id: string; name: string; offeringId: string }[];
  };
  reach: {
    learners: number;
    registrations: number;
    previousLearners: number;
    previousRegistrations: number;
    returningLearners: number;
    enrolled: number;
  };
  progress: {
    assignments: number;
    completed: number;
    inProgress: number;
    awaitingVerification: number;
    notStarted: number;
    completionRate: number | null;
    learners: number;
    requiredSteps: number;
    verifiedSteps: number;
  };
  trend: { date: string; registrations: number }[];
  offerings: ImpactRow[];
  cohorts: ImpactRow[];
  skills: { id: string; name: string; offerings: number; learners: number }[];
  credentials: null | {
    available: boolean;
    warning: string | null;
    badges: number;
    certificates: number;
    recipients: number;
    pairedAccomplishments: number;
    sharedBadges: number;
    acknowledgedAwards: number;
    excluded: number;
  };
  canvas: { authorized: boolean; message: string };
};
