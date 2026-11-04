"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  ManualLedger,
  ManualOptions,
  ManualPayment,
} from "../../domain/manual-payments";
import { api } from "./api";
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
const today = () => new Date().toISOString().slice(0, 10);
const methods = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  other: "Other external payment",
};
export function ManualPayments({
  canRecord,
  onChanged,
}: {
  canRecord: boolean;
  onChanged?: () => void;
}) {
  const [ledger, setLedger] = useState<ManualLedger>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<"payment" | ManualPayment>(),
    [options, setOptions] = useState<ManualOptions>({
      learners: [],
      offerings: [],
    }),
    [lookup, setLookup] = useState(""),
    [looking, setLooking] = useState(false),
    [lookupError, setLookupError] = useState("");
  const [learner, setLearner] = useState<
      ManualOptions["learners"][number] | null
    >(null),
    [offering, setOffering] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today()),
    [method, setMethod] = useState("check"),
    [reference, setReference] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(""),
    [key, setKey] = useState(""),
    [focusPayment, setFocusPayment] = useState<string>();
  async function load() {
    setLoading(true);
    setError("");
    try {
      setLedger(
        await api<ManualLedger>("staff/manual-payments", { role: "staff" }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!focusPayment) return;
    document
      .querySelector<HTMLElement>(`[data-manual-payment="${focusPayment}"]`)
      ?.focus();
    setFocusPayment(undefined);
  }, [focusPayment, ledger]);
  useEffect(() => {
    if (dialog !== "payment") return;
    let current = true;
    setLooking(true);
    setLookupError("");
    const timer = setTimeout(() => {
      api<ManualOptions>(
        `staff/manual-payments/options?search=${encodeURIComponent(lookup)}`,
        { role: "staff" },
      )
        .then((r) => {
          if (current) setOptions(r);
        })
        .catch((e) => {
          if (current) setLookupError(e.message);
        })
        .finally(() => {
          if (current) setLooking(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [dialog, lookup]);
  function open(value: "payment" | ManualPayment) {
    setDialog(value);
    setLearner(null);
    setOffering("");
    setAmount("");
    setDate(today());
    setMethod("check");
    setReference("");
    setNote("");
    setConfirmed(false);
    setSaveError("");
    setLookup("");
    setKey(crypto.randomUUID());
  }
  // Same key survives uncertain failures and retries. An edited submission is a new command.
  function changed() {
    setKey(crypto.randomUUID());
    setSaveError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !confirmed || !dialog) return;
    if (
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      Number(amount) <= 0 ||
      Number(amount) * 100 > 2147483647
    ) {
      setSaveError(
        "Enter a positive USD amount with no more than two decimal places.",
      );
      return;
    }
    const cents = Math.round(Number(amount) * 100);
    if (
      dialog !== "payment" &&
      (date < dialog.paid_on ||
        cents > dialog.amount_cents - dialog.refunded_cents)
    ) {
      setSaveError(
        "Refund cannot precede the payment or exceed its remaining balance.",
      );
      return;
    }
    setBusy(true);
    setSaveError("");
    try {
      await api(
        dialog === "payment"
          ? "staff/manual-payments"
          : `staff/manual-payments/${dialog.id}/refunds`,
        {
          role: "staff",
          key,
          body: {
            amountCents: cents,
            date,
            reference: reference.trim(),
            note: note.trim(),
            ...(dialog === "payment"
              ? { learnerId: learner?.id, offeringId: offering, method }
              : {}),
          },
        },
      );
      setNotice(
        dialog === "payment"
          ? "Manual payment recorded. Select Manual records in Earnings to report it; today's records enter complete-day totals tomorrow (UTC)."
          : "Manual refund recorded. Earnings now deducts this amount from its original manual payment.",
      );
      setDialog(undefined);
      await load();
      if (dialog !== "payment") setFocusPayment(dialog.id);
      onChanged?.();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows =
    ledger?.payments.filter((p) =>
      `${p.learner} ${p.offering} ${p.reference}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <Paper
      component="section"
      aria-label="Manual payment and refund records"
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 }, minWidth: 0 }}
    >
      <Stack spacing={2}>
        <Typography component="h2" variant="h6">
          Manual payments and refunds
        </Typography>
        <Typography variant="body2">
          Record payments received and refunds completed outside Stripe. Do not
          re-enter payments already recorded by Stripe. These records do not
          move money, issue receipts, grant course access, or change enrollment.
          Use an external receipt or accounting reference; do not enter card or
          bank account details.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {canRecord && (
            <Button variant="outlined" onClick={() => open("payment")}>
              Record manual payment
            </Button>
          )}
          <Button disabled={loading} onClick={load}>
            Refresh manual records
          </Button>
        </Stack>
        {notice && (
          <Alert severity="success" role="status">
            {notice}
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Box component="details">
          <Box component="summary" sx={{ cursor: "pointer" }}>
            Manual payment ledger{ledger ? ` (${ledger.payments.length})` : ""}
          </Box>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Typography variant="body2">
              Latest {ledger?.limit ?? 250} recorded payments, with all linked
              refunds. Dates are UTC; actor and recording time remain in the
              history.
            </Typography>
            <TextField
              label="Search manual ledger"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {!loading && ledger && !rows.length && (
              <Typography>No matching manual payments recorded.</Typography>
            )}
            {rows.map((p) => (
              <Paper
                key={p.id}
                tabIndex={-1}
                data-manual-payment={p.id}
                variant="outlined"
                sx={{ p: 2, overflowWrap: "anywhere" }}
              >
                <Stack spacing={1}>
                  <Typography component="h3" variant="subtitle1">
                    {p.learner} · {p.offering}
                  </Typography>
                  <Typography variant="body2">
                    {usd(p.amount_cents)} received {p.paid_on} ·{" "}
                    {methods[p.method as keyof typeof methods] ?? p.method} ·
                    Reference: {p.reference}
                  </Typography>
                  <Typography variant="body2">
                    Refunded: {usd(p.refunded_cents)} · Remaining:{" "}
                    {usd(p.amount_cents - p.refunded_cents)}
                  </Typography>
                  {canRecord && p.refunded_cents < p.amount_cents && (
                    <Button
                      sx={{ alignSelf: "flex-start" }}
                      onClick={() => open(p)}
                      aria-label={`Record refund for ${p.reference}`}
                    >
                      Record manual refund
                    </Button>
                  )}
                  <Box component="details">
                    <Box component="summary" sx={{ cursor: "pointer" }}>
                      Payment and refund history: {p.reference}
                    </Box>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <Typography variant="body2">
                        Payment note: {p.note}
                      </Typography>
                      <Typography variant="caption">
                        Recorded by {p.recorded_by} at {p.recorded_at}
                      </Typography>
                      {p.refunds.map((r) => (
                        <Box key={r.id}>
                          <Typography variant="body2">
                            {usd(r.amount_cents)} refunded {r.refunded_on} ·
                            Reference: {r.reference} · {r.note}
                          </Typography>
                          <Typography variant="caption">
                            Recorded by {r.recorded_by} at {r.recorded_at}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Stack>
      <Dialog
        open={Boolean(dialog)}
        onClose={() => {
          if (!busy) setDialog(undefined);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="manual-record-title"
      >
        <Box component="form" onSubmit={save} onChange={changed}>
          <DialogTitle id="manual-record-title">
            {dialog === "payment"
              ? "Record manual payment"
              : "Record manual refund"}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="info">
                Record only money already received or refunded externally.
                Records are permanent; review the learner, offering, amount,
                date, and reference before saving.
              </Alert>
              {dialog === "payment" ? (
                <>
                  <Autocomplete
                    options={options.learners}
                    getOptionLabel={(o) => o.label}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    filterOptions={(o) => o}
                    value={learner}
                    inputValue={lookup}
                    onInputChange={(_, v) => setLookup(v)}
                    onChange={(_, v) => {
                      setLearner(v);
                      changed();
                    }}
                    loading={looking}
                    noOptionsText={
                      lookup.length < 2
                        ? "Type at least two characters"
                        : "No matching learners (first 50 shown)"
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Learner"
                        required
                        helperText="Search existing learners by name, email, or ID; select a result."
                      />
                    )}
                  />
                  {lookupError && <Alert severity="error">{lookupError}</Alert>}
                  <TextField
                    select
                    label="Offering"
                    value={offering}
                    onChange={(e) => setOffering(e.target.value)}
                    required
                  >
                    {options.offerings.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.title}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Payment method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {Object.entries(methods).map(([v, label]) => (
                      <MenuItem key={v} value={v}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                </>
              ) : (
                dialog && (
                  <>
                    <Typography>
                      {dialog.learner} · {dialog.offering}
                    </Typography>
                    <Typography>
                      Original payment: {usd(dialog.amount_cents)} on{" "}
                      {dialog.paid_on} · Reference: {dialog.reference}
                    </Typography>
                    <Typography>
                      Available to refund:{" "}
                      {usd(dialog.amount_cents - dialog.refunded_cents)}
                    </Typography>
                  </>
                )
              )}
              <TextField
                label="Amount (USD)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                slotProps={{
                  htmlInput: { inputMode: "decimal", maxLength: 14 },
                }}
              />
              <TextField
                type="date"
                label={
                  dialog === "payment"
                    ? "Payment date (UTC)"
                    : "Refund date (UTC)"
                }
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: {
                    max: today(),
                    ...(dialog && dialog !== "payment"
                      ? { min: dialog.paid_on }
                      : {}),
                  },
                }}
              />
              <TextField
                label="External reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 120 } }}
                helperText="Use a unique receipt, check, or accounting reference to prevent duplicate entry."
              />
              <TextField
                label={dialog === "payment" ? "Payment note" : "Refund reason"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                multiline
                minRows={2}
                slotProps={{ htmlInput: { minLength: 3, maxLength: 1000 } }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                }
                label="I verified these details and the money was already handled externally."
              />
              {saveError && <Alert severity="error">{saveError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setDialog(undefined)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                busy ||
                !confirmed ||
                (dialog === "payment" && (!learner || !offering))
              }
            >
              {busy ? "Saving…" : "Save manual record"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Paper>
  );
}
