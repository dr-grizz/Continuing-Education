export type ManualPayment = {
  id: string;
  learner_id: string;
  offering_id: string;
  learner: string;
  offering: string;
  amount_cents: number;
  refunded_cents: number;
  paid_on: string;
  method: string;
  reference: string;
  note: string;
  recorded_by: string;
  recorded_at: string;
  refunds: {
    id: string;
    amount_cents: number;
    refunded_on: string;
    reference: string;
    note: string;
    recorded_by: string;
    recorded_at: string;
  }[];
};
export type ManualLedger = {
  payments: ManualPayment[];
  limit: number;
};
export type ManualOptions = {
  learners: { id: string; label: string }[];
  offerings: { id: string; title: string }[];
};
