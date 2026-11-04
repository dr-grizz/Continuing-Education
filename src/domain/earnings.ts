export type EarningsProvider = "stripe" | "simulated" | "manual";
export type EarningsTotals = {
  grossCents: number;
  refundedCents: number;
  retainedCents: number;
  payments: number;
  payers: number;
  averagePaymentCents: number | null;
  refundedPayments: number;
  fullyRefundedPayments: number;
  partiallyRefundedPayments: number;
  refundShare: number | null;
};
export type EarningsDashboard = {
  generatedAt: string;
  range: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    days: number;
  };
  provider: EarningsProvider;
  offeringId: string | null;
  offerings: { id: string; title: string }[];
  totals: EarningsTotals;
  previous: { grossCents: number; payments: number; payers: number };
  buyers: { firstTime: number; returning: number };
  trend: { date: string; grossCents: number; payments: number }[];
  byOffering: (EarningsTotals & { id: string; title: string })[];
  refunds: { outstandingRequests: number; requestedCents: number };
  checkouts: null | {
    attempts: number;
    confirmed: number;
    completeWithoutPayment: number;
    open: number;
    expired: number;
    confirmationRate: number | null;
  };
  excludedOrders: number;
};
