"use client";
import { useEffect, useId, useState } from "react";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
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
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { EarningsDashboard as EarningsData } from "../../domain/earnings";
import { api } from "./api";
import { ManualPayments } from "./manual-payments";
import { ImpactBars } from "./impact-charts";
import { visuallyHidden } from "./visually-hidden";
const DAY = 86400000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const today = () => Date.parse(iso(Date.now()));
const count = (n: number) => n.toLocaleString("en-US");
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
const day = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
const sourceName = (provider: string) =>
  provider === "stripe"
    ? "Stripe sandbox"
    : provider === "manual"
      ? "Manual records"
      : "Simulated demo";
const paymentLabel = (data: EarningsData) =>
  data.provider === "manual" ? "Manual payments" : "Paid orders";
const cards = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4,1fr)" },
};
const columns = {
  display: "grid",
  gap: 3,
  gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.3fr) minmax(0,1fr)" },
};
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <Paper
      component="section"
      aria-labelledby={id}
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 }, minWidth: 0 }}
    >
      <Typography
        component="h2"
        id={id}
        variant="h6"
        sx={{ mb: note ? 0.5 : 2 }}
      >
        {title}
      </Typography>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {note}
        </Typography>
      )}
      {children}
    </Paper>
  );
}
function Metric({
  label,
  value,
  note,
  comparison,
}: {
  label: string;
  value: string;
  note: string;
  comparison?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography component="h2" variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 32,
          fontWeight: 650,
          my: 0.5,
          fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </Typography>
      <Typography variant="body2">{note}</Typography>
      {comparison && (
        <Typography variant="caption" color="text.secondary">
          {comparison}
        </Typography>
      )}
    </Paper>
  );
}
function MoneyTrend({ data }: { data: EarningsData }) {
  const [selected, setSelected] = useState<string | null>(null),
    [table, setTable] = useState(false);
  const max = Math.max(1, ...data.trend.map((p) => p.grossCents)),
    active = data.trend.find((p) => p.date === selected);
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {data.range.days <= 31
          ? "Daily gross receipts"
          : "Gross receipts in seven-day buckets; final bucket may be shorter"}{" "}
        · USD
      </Typography>
      {data.totals.grossCents > 0 ? (
        <>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mb: 0.5 }}
          >
            <Typography variant="caption">{money(max)}</Typography>
            <Typography variant="caption">
              {money(data.totals.grossCents)} total
            </Typography>
          </Stack>
          <Box
            role="group"
            aria-label="Gross receipts trend chart"
            sx={{
              height: 170,
              display: "flex",
              alignItems: "stretch",
              gap: 0.4,
              borderBottom: 1,
              borderColor: "divider",
              pb: 1,
            }}
          >
            {data.trend.map((p) => (
              <Box
                component="button"
                type="button"
                key={p.date}
                aria-label={`${day(p.date)}: ${money(p.grossCents)} USD, ${p.payments} payments`}
                aria-pressed={selected === p.date}
                onClick={() => setSelected(p.date)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  p: 0,
                  border: 0,
                  bgcolor: "transparent",
                  display: "flex",
                  alignItems: "flex-end",
                  cursor: "pointer",
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: "text.primary",
                    outlineOffset: 2,
                  },
                }}
              >
                <Box
                  data-earnings-date={p.date}
                  sx={{
                    width: "100%",
                    height: p.grossCents
                      ? `${(100 * p.grossCents) / max}%`
                      : "0px",
                    minHeight: p.grossCents ? 3 : 0,
                    bgcolor: "#2a78d6",
                    opacity: selected && selected !== p.date ? 0.45 : 1,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              </Box>
            ))}
          </Box>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mt: 0.5 }}
          >
            <Typography variant="caption">{day(data.range.from)}</Typography>
            <Typography variant="caption">{day(data.range.to)}</Typography>
          </Stack>
          <Typography role="status" variant="body2" sx={{ mt: 1 }}>
            {active
              ? `${day(active.date)}: ${money(active.grossCents)} · ${active.payments} payments`
              : "Select a bar to inspect its receipts and payment count."}
          </Typography>
        </>
      ) : (
        <Typography sx={{ my: 3 }}>
          {data.totals.payments
            ? "The recorded payments in this period have zero amount."
            : "No confirmed payments in this period and source."}
        </Typography>
      )}
      <Button
        onClick={() => setTable(!table)}
        aria-expanded={table}
        sx={{ mt: 1 }}
      >
        {table ? "Hide receipts table" : "Show receipts table"}
      </Button>
      {table && (
        <TableContainer sx={{ maxHeight: 320 }}>
          <Table size="small" aria-label="Gross receipts trend counts">
            <TableHead>
              <TableRow>
                <TableCell>
                  {data.range.days <= 31 ? "Date" : "Bucket starting"}
                </TableCell>
                <TableCell align="right">Payments</TableCell>
                <TableCell align="right">Gross receipts</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.trend.map((p) => (
                <TableRow key={p.date}>
                  <TableCell>{day(p.date)}</TableCell>
                  <TableCell align="right">{p.payments}</TableCell>
                  <TableCell align="right">{money(p.grossCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
function ReceiptAllocation({ data }: { data: EarningsData }) {
  const t = data.totals;
  return (
    <>
      {t.grossCents > 0 ? (
        <>
          <Box
            role="img"
            aria-label={`Receipt allocation: ${money(t.retainedCents)} after refunds; ${money(t.refundedCents)} refunded; ${money(t.grossCents)} gross USD`}
            sx={{
              height: 32,
              display: "flex",
              borderRadius: 1,
              overflow: "hidden",
              mb: 2,
            }}
          >
            <Box
              sx={{
                width: `${(100 * t.retainedCents) / t.grossCents}%`,
                bgcolor: "#38845c",
              }}
            />
            <Box
              sx={{
                width: `${(100 * t.refundedCents) / t.grossCents}%`,
                bgcolor: "#ad7930",
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {t.refundShare?.toFixed(1)}% of these receipts has been refunded to
            date.
          </Typography>
        </>
      ) : (
        <Typography sx={{ mb: 2 }}>
          No gross receipts to allocate in this selection.
        </Typography>
      )}
      <Stack spacing={1}>
        {[
          {
            label: "Receipts after refunds",
            value: t.retainedCents,
            color: "#38845c",
          },
          {
            label: "Confirmed refunds to date",
            value: t.refundedCents,
            color: "#ad7930",
          },
        ].map((r) => (
          <Stack
            key={r.label}
            direction="row"
            sx={{ gap: 1, alignItems: "center" }}
          >
            <Box
              aria-hidden
              sx={{ width: 10, height: 10, bgcolor: r.color, flexShrink: 0 }}
            />
            <Typography variant="body2" sx={{ flex: 1 }}>
              {r.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>
              {money(r.value)}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 2 }}
      >
        Refunds are the current cumulative refunds against payments received in
        the selected period. They are not refunds issued during that period.
      </Typography>
    </>
  );
}
function OfferingRevenue({ data }: { data: EarningsData }) {
  const [measure, setMeasure] = useState<
      "grossCents" | "retainedCents" | "refundedCents" | "payments"
    >("grossCents"),
    [table, setTable] = useState(false);
  const monetary = measure !== "payments";
  const rows = [...data.byOffering].sort(
    (a, b) => b[measure] - a[measure] || a.title.localeCompare(b.title),
  );
  return (
    <>
      <TextField
        select
        label="Offering earnings measure"
        value={measure}
        onChange={(e) => setMeasure(e.target.value as typeof measure)}
        sx={{ minWidth: 230, maxWidth: "100%", mb: 2 }}
      >
        <MenuItem value="grossCents">Gross receipts</MenuItem>
        <MenuItem value="retainedCents">Receipts after refunds</MenuItem>
        <MenuItem value="refundedCents">Confirmed refunds to date</MenuItem>
        <MenuItem value="payments">{paymentLabel(data)}</MenuItem>
      </TextField>
      <ImpactBars
        title="Offering earnings chart"
        rows={rows.map((r) => ({
          id: r.id,
          label: r.title,
          value: r[measure],
          detail: `${r.payments} ${paymentLabel(data).toLowerCase()} · ${r.payers} payers`,
        }))}
        unit={monetary ? "USD" : paymentLabel(data).toLowerCase()}
        format={monetary ? money : count}
        empty={`No ${paymentLabel(data).toLowerCase()} in this period and source.`}
      />
      {rows.length > 0 && (
        <>
          <Button onClick={() => setTable(!table)} aria-expanded={table}>
            {table ? "Hide offering totals" : "Show offering totals"}
          </Button>
          {table && (
            <TableContainer>
              <Table size="small" aria-label="Offering earnings totals">
                <TableHead>
                  <TableRow>
                    <TableCell>Offering</TableCell>
                    <TableCell align="right">{paymentLabel(data)}</TableCell>
                    <TableCell align="right">Gross receipts</TableCell>
                    <TableCell align="right">Refunds to date</TableCell>
                    <TableCell align="right">After refunds</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell component="th" scope="row">
                        {r.title}
                      </TableCell>
                      <TableCell align="right">{r.payments}</TableCell>
                      <TableCell align="right">{money(r.grossCents)}</TableCell>
                      <TableCell align="right">
                        {money(r.refundedCents)}
                      </TableCell>
                      <TableCell align="right">
                        {money(r.retainedCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </>
  );
}
function exportCsv(data: EarningsData) {
  const t = data.totals;
  const rows: (string | number)[][] = [
    ["Earnings", sourceName(data.provider)],
    ["From / through (UTC)", data.range.from, data.range.to],
    ["Offering filter", data.offeringId ?? "All"],
    ["Currency", "USD"],
    ["Amounts", "Decimal USD; not production earnings"],
    ["Metric", "Value"],
    ["Gross receipts", (t.grossCents / 100).toFixed(2)],
    [
      "Confirmed refunds against these payments to date",
      (t.refundedCents / 100).toFixed(2),
    ],
    [
      "Receipts after refunds before fees/costs",
      (t.retainedCents / 100).toFixed(2),
    ],
    [paymentLabel(data), t.payments],
    ["Distinct payers", t.payers],
    [
      "Average payment",
      t.averagePaymentCents === null
        ? "Unavailable"
        : (t.averagePaymentCents / 100).toFixed(2),
    ],
    ["Previous period", data.range.previousFrom, data.range.previousTo],
    ["Previous gross receipts", (data.previous.grossCents / 100).toFixed(2)],
    ["First-time payers", data.buyers.firstTime],
    ["Returning payers", data.buyers.returning],
    ["Outstanding refund requests", data.refunds.outstandingRequests],
    [
      "Requested refund amount (not deducted)",
      (data.refunds.requestedCents / 100).toFixed(2),
    ],
    [
      "Offering",
      paymentLabel(data),
      "Payers",
      "Gross USD",
      "Refunded USD to date",
      "Retained USD before fees/costs",
    ],
    ...data.byOffering.map((r) => [
      r.title,
      r.payments,
      r.payers,
      (r.grossCents / 100).toFixed(2),
      (r.refundedCents / 100).toFixed(2),
      (r.retainedCents / 100).toFixed(2),
    ]),
    ["Date / bucket start", paymentLabel(data), "Gross USD"],
    ...data.trend.map((p) => [
      p.date,
      p.payments,
      (p.grossCents / 100).toFixed(2),
    ]),
    [
      "Definition",
      "Selected-period payments; current cumulative refunds are assigned to those original payments. This is not period cash flow or profit. Checkout status is current for sessions created in the selected period.",
    ],
    [
      "Unavailable",
      "Processor fees, payouts, taxes, expenses, profit, individual card declines, and refund-by-issue-date cash flow.",
    ],
    ["Excluded unconfirmed order records", data.excludedOrders],
    ["Retrieved", data.generatedAt],
  ];
  if (data.checkouts) {
    const c = data.checkouts;
    rows.push(
      ["Checkout attempts", c.attempts],
      ["Confirmed checkout payments", c.confirmed],
      ["Completed without paid order", c.completeWithoutPayment],
      ["Open/unreconciled checkouts", c.open],
      ["Expired without confirmed payment", c.expired],
      ["Checkout confirmation (%)", c.confirmationRate ?? "Unavailable"],
    );
  } else rows.push(["Checkout outcomes", "Unavailable for simulated payments"]);
  const cell = (v: string | number) =>
    `"${String(v)
      .replace(/^\s*[=+\-@]/, "'$&")
      .replaceAll('"', '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `earnings-${data.provider}-${data.range.from}-${data.range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function EarningsDashboard({
  canTransactions = false,
  canRecord = false,
}: {
  canTransactions?: boolean;
  canRecord?: boolean;
}) {
  const [data, setData] = useState<EarningsData>(),
    [options, setOptions] = useState<EarningsData["offerings"]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("30"),
    [from, setFrom] = useState(iso(today() - 30 * DAY)),
    [to, setTo] = useState(iso(today() - DAY)),
    [provider, setProvider] = useState("stripe"),
    [offering, setOffering] = useState("all"),
    [query, setQuery] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setData(undefined);
    setLoading(true);
    setError("");
    api<EarningsData>(`staff/earnings${query ? "?" + query : ""}`, {
      role: "staff",
    })
      .then((result) => {
        if (current) {
          setData(result);
          setOptions(result.offerings);
        }
      })
      .catch((e) => {
        if (current) setError(e.message || "Unable to load earnings.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [query, refresh]);
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const p = new URLSearchParams({ from, to, provider });
    if (offering !== "all") p.set("offeringId", offering);
    setQuery(p.toString());
    setRefresh((n) => n + 1);
  }
  return (
    <Stack spacing={3}>
      <Box component="form" onSubmit={apply}>
        <Stack
          direction="row"
          useFlexGap
          sx={{ gap: 2, flexWrap: "wrap", alignItems: "center" }}
        >
          <TextField
            select
            label="Period"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              if (e.target.value !== "custom") {
                setFrom(iso(today() - Number(e.target.value) * DAY));
                setTo(iso(today() - DAY));
              }
            }}
            sx={{ minWidth: 190 }}
          >
            {[7, 30, 90, 365].map((n) => (
              <MenuItem key={n} value={String(n)}>
                Last {n} complete days
              </MenuItem>
            ))}
            <MenuItem value="custom">Custom dates</MenuItem>
          </TextField>
          <TextField
            type="date"
            label="From (UTC)"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { required: true, max: to },
            }}
          />
          <TextField
            type="date"
            label="Through (UTC)"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { required: true, min: from, max: iso(today() - DAY) },
            }}
          />
          <TextField
            select
            label="Payment source"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="stripe">Stripe sandbox</MenuItem>
            <MenuItem value="simulated">Simulated demo</MenuItem>
            <MenuItem value="manual">Manual records</MenuItem>
          </TextField>
          <TextField
            select
            label="Offering"
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            sx={{ minWidth: 180, maxWidth: "100%", flex: 1 }}
          >
            <MenuItem value="all">All offerings</MenuItem>
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.title}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="contained" disabled={loading}>
            Apply filters
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            disabled={loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            Refresh
          </Button>
        </Stack>
      </Box>
      {loading && <LinearProgress aria-label="Loading earnings" />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => setRefresh((n) => n + 1)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {data && (
        <>
          <Alert
            severity={data.provider === "stripe" ? "info" : "warning"}
            role="note"
          >
            {data.provider === "stripe"
              ? "Stripe sandbox records only. These are test payments, not production earnings."
              : data.provider === "manual"
                ? "Manually recorded external payments and refunds. Staff-entered evidence, not provider-verified transactions. Dates use the external payment date; today enters complete-day totals tomorrow (UTC)."
                : "Simulated demo payments. No money was collected for these records."}
          </Alert>
          <Stack
            direction="row"
            useFlexGap
            sx={{
              gap: 1,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {day(data.range.from)} – {day(data.range.to)} · Complete UTC days
              · {sourceName(data.provider)} ·{" "}
              {data.offerings.find((o) => o.id === data.offeringId)?.title ??
                "All offerings"}
            </Typography>
            <Button
              startIcon={<DownloadIcon />}
              onClick={() => exportCsv(data)}
            >
              Export earnings CSV
            </Button>
          </Stack>
          <Box aria-live="polite" sx={visuallyHidden}>
            {sourceName(data.provider)}: {money(data.totals.grossCents)} gross
            receipts from {data.totals.payments}{" "}
            {paymentLabel(data).toLowerCase()}.
          </Box>
          <Box sx={cards}>
            <Metric
              label="Gross receipts"
              value={money(data.totals.grossCents)}
              note={`${paymentLabel(data)} recorded in the period`}
              comparison={`${data.totals.grossCents - data.previous.grossCents >= 0 ? "+" : "−"}${money(Math.abs(data.totals.grossCents - data.previous.grossCents))} vs. previous period (${money(data.previous.grossCents)})`}
            />
            <Metric
              label="Receipts after refunds"
              value={money(data.totals.retainedCents)}
              note="Current refunds against these payments deducted"
              comparison="Before processor fees and operating costs"
            />
            <Metric
              label={paymentLabel(data)}
              value={count(data.totals.payments)}
              note={`${count(data.totals.payers)} distinct payers`}
              comparison={`${count(data.previous.payments)} in previous period`}
            />
            <Metric
              label="Average payment"
              value={
                data.totals.averagePaymentCents === null
                  ? "—"
                  : money(data.totals.averagePaymentCents)
              }
              note={`Gross receipts ÷ ${paymentLabel(data).toLowerCase()}`}
              comparison={
                data.provider === "manual"
                  ? "Uses the external payment date"
                  : "Includes zero-amount paid orders"
              }
            />
          </Box>
          <Box sx={columns}>
            <Section title="Receipts over time">
              <MoneyTrend
                key={
                  data.range.from +
                  data.range.to +
                  data.provider +
                  (data.offeringId ?? "")
                }
                data={data}
              />
            </Section>
            <Section
              title="Receipt allocation"
              note="Selected-period payments, with refunds known today."
            >
              <ReceiptAllocation data={data} />
            </Section>
          </Box>
          <Section
            title="Offering earnings"
            note="Amounts use recorded payment prices, including historical payments for unpublished offerings."
          >
            <OfferingRevenue data={data} />
          </Section>
          <Box sx={columns}>
            <Section
              title="Refunds and requests"
              note="For the payments received in the selected period. Current status, including later refunds and requests."
            >
              <Stack spacing={1.5}>
                {[
                  {
                    name: "Confirmed refunds to date",
                    value: money(data.totals.refundedCents),
                  },
                  {
                    name: `Fully refunded ${paymentLabel(data).toLowerCase()}`,
                    value: count(data.totals.fullyRefundedPayments),
                  },
                  {
                    name: `Partially refunded ${paymentLabel(data).toLowerCase()}`,
                    value: count(data.totals.partiallyRefundedPayments),
                  },
                  {
                    name: "Outstanding refund requests",
                    value: count(data.refunds.outstandingRequests),
                  },
                  {
                    name: "Requested amount",
                    value: money(data.refunds.requestedCents),
                  },
                ].map((r) => (
                  <Stack
                    key={r.name}
                    direction="row"
                    sx={{ justifyContent: "space-between", gap: 2 }}
                  >
                    <Typography variant="body2">{r.name}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {r.value}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 2 }}
              >
                Requested refunds are not deducted until confirmed. The portal's
                cumulative refund fields do not provide a complete
                refund-by-issue-date cash-flow ledger.
              </Typography>
              {canTransactions && (
                <Link
                  href="/staff/transactions"
                  sx={{
                    display: "inline-block",
                    mt: 2,
                    textDecoration: "underline",
                  }}
                >
                  Review payments and refund requests
                </Link>
              )}
            </Section>
            <Section
              title="Payer mix"
              note="Distinct payers in this selection. A returning payer has an earlier paid order anywhere in the portal, using the same payment source."
            >
              <ImpactBars
                title="Payer mix chart"
                unit="payers"
                rows={
                  data.totals.payers
                    ? [
                        {
                          id: "first-time",
                          label: "First-time payers",
                          value: data.buyers.firstTime,
                        },
                        {
                          id: "returning",
                          label: "Returning payers",
                          value: data.buyers.returning,
                          color: "#38845c",
                        },
                      ]
                    : []
                }
                empty="No payers in this period and source."
              />
            </Section>
          </Box>
          <Section
            title="Checkout outcomes"
            note="Sessions created in the selected period, evaluated from their current status. A paid order may have been recorded later than the selected period."
          >
            {data.checkouts ? (
              <>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {data.checkouts.confirmed} of {data.checkouts.attempts}{" "}
                  sessions have confirmed paid orders ·{" "}
                  {data.checkouts.confirmationRate === null
                    ? "Rate unavailable"
                    : data.checkouts.confirmationRate.toFixed(1) +
                      "% confirmed"}
                </Typography>
                <ImpactBars
                  title="Checkout outcomes chart"
                  unit="sessions"
                  rows={
                    data.checkouts.attempts
                      ? [
                          {
                            id: "confirmed",
                            label: "Confirmed paid order",
                            value: data.checkouts.confirmed,
                            color: "#38845c",
                          },
                          {
                            id: "unmatched",
                            label: "Complete, no paid order",
                            value: data.checkouts.completeWithoutPayment,
                            color: "#ad7930",
                          },
                          {
                            id: "open",
                            label: "Open or unreconciled",
                            value: data.checkouts.open,
                          },
                          {
                            id: "expired",
                            label: "Expired without payment",
                            value: data.checkouts.expired,
                            color: "#858585",
                          },
                        ]
                      : []
                  }
                  empty="No Checkout sessions were created in this period."
                />
                <Typography variant="caption" color="text.secondary">
                  Expired or unconfirmed sessions are not card-decline counts.
                  Payment failures are not separately recorded for this report.
                </Typography>
              </>
            ) : (
              <Typography color="text.secondary">
                Checkout outcomes are unavailable for manual or simulated
                records.
              </Typography>
            )}
          </Section>
          {data.excludedOrders > 0 && (
            <Alert severity="warning">
              {data.excludedOrders} order records excluded because their payment
              status is not confirmed paid.
            </Alert>
          )}
          <Box component="details">
            <Box component="summary" sx={{ cursor: "pointer" }}>
              Definitions and financial data sources
            </Box>
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="body2">
                Sources: paid portal orders, append-only manual payment/refund
                records, registration-to-offering links, current cumulative
                refund amounts, current refund requests, and saved Stripe
                sandbox Checkout sessions. This report reads existing records
                only; it does not contact Stripe, reconcile payments, or issue
                refunds.
              </Typography>
              <Typography variant="body2">
                All amounts are USD, computed from recorded integer cents.
                Historical catalog prices, current publication, learner
                deactivation, and enrollment changes do not alter recorded
                receipts. Stripe requires a paid order; Checkout completion
                alone is not earnings.
              </Typography>
              <Typography variant="body2">
                The previous gross-receipts comparison is{" "}
                {day(data.range.previousFrom)} – {day(data.range.previousTo)},
                using the same number of complete UTC days, offering, and
                source. Refunds are a current snapshot against each payment
                cohort, so after-refund figures can change on refresh.
              </Typography>
              <Typography variant="body2">
                Receipts after refunds are not profit or payouts. Processor
                fees, operating expenses, bank settlements, taxes, and
                refund-issue-date cash flow are unavailable. Averages include
                zero-amount payments; an empty payment denominator is
                unavailable.
              </Typography>
              <Typography variant="caption">
                Retrieved {new Date(data.generatedAt).toLocaleString()}. Refresh
                to load the latest stored records.
              </Typography>
            </Stack>
          </Box>
        </>
      )}
      {canTransactions && (
        <ManualPayments
          canRecord={canRecord}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      )}
    </Stack>
  );
}
