"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { api, money } from "./api";
import {
  SortableHeader,
  SortSelect,
  TablePager,
  useTableView,
} from "./table-view";

// Read-only transactions for staff with payments:read. Refunds are only
// requested here: Finance issues them in the Stripe Dashboard, and Stripe's
// charge.refunded event marks the request refunded (ADR 0005, decision P5).
type Transaction = {
  id: string;
  created_at: string;
  amount_cents: number;
  refunded_cents: number;
  provider: "stripe" | "simulated";
  stripe_payment_intent_id: string | null;
  learner_email: string | null;
  offering_title: string;
  request_id: string | null;
  request_status: "requested" | "refunded" | "cancelled" | null;
  request_reason: string | null;
  requested_by_email: string | null;
};
type Status = "paid" | "requested" | "partly" | "refunded";
const statusLabels: Record<Status, string> = {
  paid: "Paid",
  requested: "Refund requested",
  partly: "Partly refunded",
  refunded: "Refunded",
};
const statusOf = (t: Transaction): Status =>
  t.refunded_cents >= t.amount_cents
    ? "refunded"
    : t.refunded_cents > 0
      ? "partly"
      : t.request_status === "requested"
        ? "requested"
        : "paid";
const learnerOf = (t: Transaction) =>
  t.learner_email ?? "Legacy sample learner";
const day = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const wideOnly = { display: { xs: "none", md: "block" } };
const phoneOnly = { display: { xs: "block", md: "none" } };
// Sandbox payments open in Stripe's test-mode Dashboard.
const stripeUrl = (paymentIntent: string) =>
  `https://dashboard.stripe.com/test/payments/${paymentIntent}`;

export function StaffTransactions({
  canRequest,
  onChanged,
}: {
  canRequest: boolean;
  onChanged: (message: string) => void;
}) {
  const [rows, setRows] = useState<Transaction[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"all" | Status>("all"),
    [dialog, setDialog] = useState<{
      mode: "request" | "cancel";
      row: Transaction;
    }>(),
    [focusRow, setFocusRow] = useState<string>();
  const load = () =>
    api<Transaction[]>("staff/transactions", { role: "staff" })
      .then((data) => {
        setRows(data);
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  useEffect(() => {
    load();
  }, []);
  // The action that opened the dialog is replaced after it succeeds, so focus
  // moves to the row's new action (on the visible layout) instead of the page.
  useEffect(() => {
    if (!focusRow) return;
    const target = [
      ...document.querySelectorAll<HTMLElement>(
        `[data-row="${focusRow}"] button, [data-row="${focusRow}"] a`,
      ),
    ].filter((element) => element.offsetParent !== null);
    (
      target.find((element) => element.tagName === "BUTTON") ?? target[0]
    )?.focus();
    setFocusRow(undefined);
  }, [rows, focusRow]);
  const view = useTableView(rows, {
    compare: {
      date: (a, b) => a.created_at.localeCompare(b.created_at),
      learner: (a, b) => learnerOf(a).localeCompare(learnerOf(b)),
      amount: (a, b) => a.amount_cents - b.amount_cents,
    },
    initial: { key: "date", direction: "desc" },
    matches: (row) =>
      (filter === "all" || statusOf(row) === filter) &&
      `${learnerOf(row)} ${row.offering_title}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  });
  const statusChip = (row: Transaction) => {
    const status = statusOf(row);
    return (
      <Chip
        label={statusLabels[status]}
        color={
          status === "paid"
            ? "success"
            : status === "requested"
              ? "warning"
              : "default"
        }
        variant="outlined"
      />
    );
  };
  const providerLabel = (row: Transaction) =>
    row.provider === "stripe" ? "Stripe" : "Simulated";
  const request = (row: Transaction) =>
    row.request_status === "requested" && (
      <Typography variant="caption" color="text.secondary" component="p">
        Requested by {row.requested_by_email ?? "staff"}: {row.request_reason}
      </Typography>
    );
  const actions = (row: Transaction) => {
    const status = statusOf(row);
    return (
      <Stack
        direction="row"
        data-row={row.id}
        sx={{ gap: 1, flexWrap: "wrap" }}
      >
        {row.stripe_payment_intent_id && (
          <Button
            href={stripeUrl(row.stripe_payment_intent_id)}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon />}
            aria-label={`View ${learnerOf(row)}'s payment for ${row.offering_title} in Stripe (opens in a new tab)`}
          >
            View in Stripe
          </Button>
        )}
        {canRequest && row.provider === "stripe" && status === "paid" && (
          <Button
            onClick={() => setDialog({ mode: "request", row })}
            aria-label={`Request a refund for ${learnerOf(row)}, ${row.offering_title}`}
          >
            Request refund
          </Button>
        )}
        {canRequest && status === "requested" && (
          <Button
            onClick={() => setDialog({ mode: "cancel", row })}
            aria-label={`Cancel the refund request for ${learnerOf(row)}, ${row.offering_title}`}
          >
            Cancel request
          </Button>
        )}
      </Stack>
    );
  };
  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Transactions
      </Typography>
      <Alert severity="info" role="note" sx={{ mb: 2 }}>
        Read-only. Refunds are issued by Finance in the Stripe Dashboard
        {canRequest ? "; you can request one here" : ""}. When Stripe reports a
        refund, its request is marked Refunded automatically. A refund does not
        change the learner&apos;s course access yet (policy P5 is open).
      </Alert>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2, mb: 2 }}>
        <TextField
          label="Search transactions"
          placeholder="Learner email or course"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          label="Status"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | Status)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All statuses</MenuItem>
          {Object.entries(statusLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <SortSelect
          view={view}
          options={{
            "date:desc": "Newest first",
            "amount:desc": "Largest amount",
            "learner:asc": "Learner A–Z",
          }}
          display={{ xs: "flex", md: "none" }}
        />
      </Stack>
      <Typography
        variant="body2"
        color="text.secondary"
        aria-live="polite"
        sx={{ mb: 1.5 }}
      >
        {view.count} of {view.total} transactions
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {loaded && !rows.length && !error && (
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography>No transactions yet.</Typography>
        </Paper>
      )}
      <Stack spacing={1.5} sx={phoneOnly}>
        {view.visible.map((row) => (
          <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", gap: 1 }}
            >
              <Typography
                variant="subtitle1"
                component="h3"
                sx={{ overflowWrap: "anywhere" }}
              >
                {row.offering_title}
              </Typography>
              {statusChip(row)}
            </Stack>
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              {learnerOf(row)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {money(row.amount_cents)} · {providerLabel(row)} ·{" "}
              {day(row.created_at)}
            </Typography>
            {request(row)}
            <Box sx={{ mt: 1 }}>{actions(row)}</Box>
          </Paper>
        ))}
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
        <Table aria-label="Transactions">
          <TableHead>
            <TableRow>
              <SortableHeader view={view} column="date" label="Date" />
              <SortableHeader view={view} column="learner" label="Learner" />
              <TableCell>Course</TableCell>
              <SortableHeader view={view} column="amount" label="Amount" />
              <TableCell>Payment</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {view.visible.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {day(row.created_at)}
                </TableCell>
                <TableCell sx={{ overflowWrap: "anywhere" }}>
                  {learnerOf(row)}
                </TableCell>
                <TableCell>
                  {row.offering_title}
                  {request(row)}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {money(row.amount_cents)}
                  {row.refunded_cents > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      {money(row.refunded_cents)} refunded
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{providerLabel(row)}</TableCell>
                <TableCell>{statusChip(row)}</TableCell>
                <TableCell>{actions(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePager view={view} label="Transactions" />
      <RefundDialog
        dialog={dialog}
        onClose={() => setDialog(undefined)}
        onDone={async (message) => {
          const id = dialog?.row.id;
          setDialog(undefined);
          await load();
          setFocusRow(id);
          onChanged(message);
        }}
      />
    </>
  );
}

function RefundDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog?: { mode: "request" | "cancel"; row: Transaction };
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [fieldError, setFieldError] = useState(""),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const reasonField = useRef<HTMLTextAreaElement | null>(null);
  const failureRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setReason("");
    setFieldError("");
    setFailure("");
  }, [dialog]);
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);
  if (!dialog) return null;
  const { mode, row } = dialog;
  async function submit() {
    if (busy || !dialog) return;
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setFieldError("Enter 10 to 500 characters.");
      reasonField.current?.focus();
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      if (mode === "request")
        await api(`staff/transactions/${row.id}/refund-requests`, {
          role: "staff",
          body: { reason: reason.trim() },
        });
      else
        await api(`staff/refund-requests/${row.request_id}/cancel`, {
          role: "staff",
          body: { reason: reason.trim() },
        });
      await onDone(
        mode === "request"
          ? `Refund requested for ${row.offering_title}. Finance completes it in Stripe.`
          : `Refund request cancelled for ${row.offering_title}.`,
      );
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="refund-dialog-title"
    >
      <DialogTitle id="refund-dialog-title">
        {mode === "request" ? "Request a refund" : "Cancel the refund request"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {failure && (
            <Alert severity="error" ref={failureRef} tabIndex={-1}>
              {failure}
            </Alert>
          )}
          <DialogContentText>
            {row.offering_title} · {learnerOf(row)} ·{" "}
            {money(row.amount_cents - row.refunded_cents)}
          </DialogContentText>
          <DialogContentText>
            {mode === "request" ? (
              <>
                This asks Finance to refund the full amount. Nothing is refunded
                here: Finance issues the refund in the Stripe Dashboard, and
                this transaction shows Refunded once Stripe confirms it.
                {row.stripe_payment_intent_id && (
                  <>
                    {" "}
                    <Link
                      href={stripeUrl(row.stripe_payment_intent_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="always"
                    >
                      Open this payment in Stripe (new tab)
                    </Link>
                  </>
                )}
              </>
            ) : (
              "Finance will no longer see this request as waiting. You can request a refund again later."
            )}
          </DialogContentText>
          <TextField
            id="refund-reason"
            label="Reason"
            required
            multiline
            minRows={2}
            value={reason}
            inputRef={reasonField}
            onChange={(e) => {
              setReason(e.target.value);
              if (fieldError) setFieldError("");
            }}
            error={Boolean(fieldError)}
            helperText={
              fieldError ||
              (mode === "request"
                ? "Shown to Finance and in the activity log. 10 to 500 characters."
                : "Recorded in the activity log. 10 to 500 characters.")
            }
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          onClick={submit}
          aria-disabled={busy || undefined}
        >
          {busy
            ? "Saving…"
            : mode === "request"
              ? "Request refund"
              : "Cancel request"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
