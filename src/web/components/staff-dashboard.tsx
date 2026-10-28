"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
import { api, money, Offering } from "./api";
import { visuallyHidden } from "./visually-hidden";

type Point = { bucket: string; value: number };
type Dashboard = {
  range: {
    days: number;
    from: string;
    to: string;
    bucket: "day" | "week" | "month";
  };
  simulated: boolean;
  enrollment: {
    registrations: number;
    enrolled: number;
    in_progress: number;
    awaiting_approval: number;
    exceptions: number;
    not_continuing: number;
    seats_capacity: number;
    seats_in_use: number;
    limited_seats_in_use?: number;
    unlimited_offerings?: number;
    unlimited_seats_in_use?: number;
    trend: Point[];
    by_offering: {
      id: string;
      title: string;
      published: boolean;
      capacity: number | null;
      unlimited_seats?: boolean;
      seats_in_use: number;
      registrations: number;
      enrolled: number;
      in_progress: number;
      awaiting_approval: number;
    }[];
  };
  sales: null | {
    orders: number;
    gross_cents: number;
    net_cents: number;
    first_time_buyers: number;
    returning_buyers: number;
    refunds_cents: null;
    failed_payments: null;
    trend: Point[];
    by_offering: {
      id: string;
      title: string;
      orders: number;
      gross_cents: number;
    }[];
  };
  completion: { available: boolean; reason: string };
};

// Chart tokens: one validated hue per mode (dataviz reference blue; checked against
// this app's light and dark paper surfaces). The brand navy reads as gray in a fill.
const markSx = (theme: any) => ({
  bgcolor: "#2a78d6",
  ...theme.applyStyles("dark", { bgcolor: "#3987e5" }),
});
const trackSx = (theme: any) => ({
  bgcolor: "#d7e5f6",
  ...theme.applyStyles("dark", { bgcolor: "#23364d" }),
});
const ranges: Record<string, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 12 months",
  "0": "All time",
};
const bucketLabel = (bucket: string, size: string, long = false) => {
  const date = new Date(`${bucket}T12:00:00`);
  if (size === "month")
    return date.toLocaleDateString("en-US", {
      month: long ? "long" : "short",
      year: "numeric",
    });
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return size === "week" ? `${long ? "Week of " : ""}${day}` : day;
};
const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
};
// CSV of aggregate figures; cells starting with = + - @ are neutralized for spreadsheets.
function downloadCsv(name: string, rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const blob = new Blob(
    [rows.map((row) => row.map(cell).join(",")).join("\n")],
    {
      type: "text/csv",
    },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Averages keep both decimal places ($105.90), unlike whole-dollar totals.
const averageOrder = (cents: number, orders: number) =>
  (orders ? cents / orders / 100 : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        component="p"
        sx={{ fontSize: 30, fontWeight: 600, lineHeight: 1.2, mt: 0.5 }}
      >
        {value}
      </Typography>
      {note && (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      )}
    </Paper>
  );
}

function Meter({
  used,
  total,
  label,
}: {
  used: number;
  total: number;
  label: string;
}) {
  const share = total ? Math.min(1, used / total) : 0;
  return (
    <Box
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={used}
      aria-valuetext={`${used} of ${total}`}
      sx={(theme) => ({
        ...trackSx(theme),
        height: 8,
        borderRadius: 4,
        overflow: "hidden",
      })}
    >
      <Box
        sx={(theme) => ({
          ...markSx(theme),
          height: "100%",
          width: `${share * 100}%`,
          borderRadius: 4,
        })}
      />
    </Box>
  );
}

// Single-series column chart: one tab stop; arrow keys, Home and End move between
// bars; hover or focus shows the value; the table view carries every value.
function ColumnChart({
  title,
  data,
  bucket,
  format,
}: {
  title: string;
  data: Point[];
  bucket: string;
  format: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [focused, setFocused] = useState(false);
  const max = niceMax(Math.max(0, ...data.map((point) => point.value)));
  const current = active ?? (focused ? data.length - 1 : null);
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  function onKeyDown(event: React.KeyboardEvent) {
    const last = data.length - 1;
    const now = current ?? last;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, now - 1)
        : event.key === "ArrowRight"
          ? Math.min(last, now + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }
  const point = current === null ? undefined : data[current];
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="subtitle1" component="h3">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Total {format(total)}
        </Typography>
      </Stack>
      {!showTable ? (
        <Box
          tabIndex={0}
          role="group"
          aria-label={`${title}. Use the left and right arrow keys to read each ${bucket}.`}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setActive(null);
          }}
          onPointerLeave={() => setActive(null)}
          sx={{ mt: 2, position: "relative", borderRadius: 1 }}
        >
          <Stack direction="row" sx={{ gap: 1 }}>
            <Stack
              aria-hidden="true"
              sx={{
                justifyContent: "space-between",
                height: 160,
                minWidth: 40,
                textAlign: "right",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {format(max)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {format(0)}
              </Typography>
            </Stack>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack
                direction="row"
                aria-hidden="true"
                sx={{
                  height: 160,
                  alignItems: "flex-end",
                  borderBottom: 1,
                  borderColor: "divider",
                  position: "relative",
                }}
              >
                {data.map((entry, index) => (
                  <Box
                    key={entry.bucket}
                    onPointerMove={() => setActive(index)}
                    sx={{
                      flex: 1,
                      height: "100%",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      px: "1px",
                      cursor: "default",
                    }}
                  >
                    <Box
                      sx={(theme) => ({
                        ...markSx(theme),
                        width: "100%",
                        maxWidth: 24,
                        height: `${(entry.value / max) * 100}%`,
                        minHeight: entry.value ? 2 : 0,
                        borderRadius: "4px 4px 0 0",
                        opacity:
                          current === null || current === index ? 1 : 0.55,
                      })}
                    />
                  </Box>
                ))}
              </Stack>
              <Stack direction="row" aria-hidden="true" sx={{ mt: 0.5 }}>
                {data.map((entry, index) => (
                  <Typography
                    key={entry.bucket}
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      flex: 1,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      overflow: "visible",
                    }}
                  >
                    {index % labelEvery === 0
                      ? bucketLabel(entry.bucket, bucket)
                      : ""}
                  </Typography>
                ))}
              </Stack>
            </Box>
          </Stack>
          {point && (
            <Paper
              elevation={3}
              aria-hidden="true"
              sx={{
                position: "absolute",
                top: -8,
                left: `calc(48px + ${((current as number) + 0.5) / data.length} * (100% - 48px))`,
                transform: "translate(-50%, -100%)",
                px: 1.25,
                py: 0.75,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 1,
              }}
            >
              <Typography sx={{ fontWeight: 700 }}>
                {format(point.value)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {bucketLabel(point.bucket, bucket, true)}
              </Typography>
            </Paper>
          )}
          <Box aria-live="polite" sx={visuallyHidden}>
            {point && active !== null
              ? `${bucketLabel(point.bucket, bucket, true)}: ${format(point.value)}`
              : ""}
          </Box>
        </Box>
      ) : (
        <TableContainer sx={{ mt: 2, maxHeight: 280 }}>
          <Table size="small" aria-label={title} stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>
                  {bucket === "day"
                    ? "Date"
                    : bucket === "week"
                      ? "Week of"
                      : "Month"}
                </TableCell>
                <TableCell align="right">Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.bucket}>
                  <TableCell>
                    {bucketLabel(entry.bucket, bucket, true)}
                  </TableCell>
                  <TableCell align="right">{format(entry.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Button
        size="small"
        sx={{ mt: 1 }}
        onClick={() => setShowTable(!showTable)}
      >
        {showTable ? "Show chart" : "Show table"}
      </Button>
    </Paper>
  );
}

const tiles = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: {
    xs: "1fr 1fr",
    md: "repeat(3, 1fr)",
    lg: "repeat(6, 1fr)",
  },
};
const wideOnly = { display: { xs: "none", md: "block" } };
const phoneOnly = { display: { xs: "block", md: "none" } };

export function StaffDashboard({
  offerings,
  canSales,
}: {
  offerings: Pick<Offering, "id" | "title">[];
  canSales: boolean;
}) {
  const [days, setDays] = useState("30");
  const [offeringId, setOfferingId] = useState("all");
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState("");
  useEffect(() => {
    const query = new URLSearchParams({ days });
    if (offeringId !== "all") query.set("offeringId", offeringId);
    api<Dashboard>(`staff/dashboard?${query}`, { role: "staff" })
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [days, offeringId]);
  const e = data?.enrollment;
  const s = data?.sales;
  const rangeText = data
    ? `${new Date(`${data.range.from}T12:00:00`).toLocaleDateString()} – ${new Date(`${data.range.to}T12:00:00`).toLocaleDateString()}`
    : "";
  const count = (value: number) => value.toLocaleString();
  return (
    <>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2, mb: 2 }}>
        <TextField
          select
          label="Date range"
          value={days}
          onChange={(ev) => setDays(ev.target.value)}
          sx={{ minWidth: 200 }}
        >
          {Object.entries(ranges).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Offering"
          value={offeringId}
          onChange={(ev) => setOfferingId(ev.target.value)}
          sx={{ minWidth: 260 }}
        >
          <MenuItem value="all">All offerings</MenuItem>
          {offerings.map((offering) => (
            <MenuItem key={offering.id} value={offering.id}>
              {offering.title}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Alert severity="info" role="note" sx={{ mb: 3 }}>
        Sample dashboard on prototype data{rangeText ? ` (${rangeText})` : ""}.
        Payments are simulated; refunds and failed payments appear once Stripe
        is connected.
      </Alert>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {/* One short polite summary when filters change, instead of re-reading the page. */}
      <Box aria-live="polite" sx={visuallyHidden}>
        {e
          ? `${ranges[days]}, ${offeringId === "all" ? "all offerings" : (offerings.find((o) => o.id === offeringId)?.title ?? "selected offering")}: ${e.registrations} new registrations, ${e.enrolled} enrolled.`
          : ""}
      </Box>
      {e && data && (
        <Stack spacing={4}>
          <Box component="section" aria-labelledby="dash-enrollment">
            <Typography
              id="dash-enrollment"
              variant="h6"
              component="h2"
              sx={{ mb: 1.5 }}
            >
              Enrollment
            </Typography>
            <Box sx={tiles}>
              <StatTile
                label="New registrations"
                value={count(e.registrations)}
                note="In the date range"
              />
              <StatTile
                label="Enrolled"
                value={count(e.enrolled)}
                note="Of those registrations"
              />
              <StatTile
                label="In progress"
                value={count(e.in_progress)}
                note="Approved, reserved or preparing"
              />
              <StatTile
                label="Awaiting approval"
                value={count(e.awaiting_approval)}
              />
              <StatTile
                label="Needs staff review"
                value={count(e.exceptions)}
              />
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Seats filled now
                </Typography>
                <Typography
                  component="p"
                  sx={{
                    fontSize:
                      !e.seats_capacity && e.unlimited_offerings ? 24 : 30,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    mt: 0.5,
                  }}
                >
                  {e.seats_capacity
                    ? `${Math.round(((e.limited_seats_in_use ?? e.seats_in_use) / e.seats_capacity) * 100)}%`
                    : e.unlimited_offerings
                      ? "Unlimited"
                      : "0%"}
                </Typography>
                {(e.seats_capacity > 0 || !e.unlimited_offerings) && (
                  <Box sx={{ mt: 1 }}>
                    <Meter
                      used={e.limited_seats_in_use ?? e.seats_in_use}
                      total={e.seats_capacity}
                      label="Seats filled across published offerings with seat limits"
                    />
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary">
                  {!e.seats_capacity && e.unlimited_offerings
                    ? "No seat limits"
                    : `${e.limited_seats_in_use ?? e.seats_in_use} of ${e.seats_capacity} limited seats`}
                </Typography>
                {Boolean(e.unlimited_offerings) && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    {e.unlimited_offerings} unlimited offering
                    {e.unlimited_offerings === 1 ? "" : "s"} ·{" "}
                    {e.unlimited_seats_in_use ?? 0} seats in use
                  </Typography>
                )}
              </Paper>
            </Box>
            <Box sx={{ mt: 2 }}>
              <ColumnChart
                title={`New registrations per ${data.range.bucket}`}
                data={e.trend}
                bucket={data.range.bucket}
                format={(value) => count(value)}
              />
            </Box>
            <Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                mt: 3,
                mb: 1,
              }}
            >
              <Typography variant="subtitle1" component="h3">
                By offering
              </Typography>
              <Button
                size="small"
                startIcon={<DownloadIcon />}
                onClick={() =>
                  downloadCsv(
                    `enrollment-${data.range.from}-to-${data.range.to}.csv`,
                    [
                      [
                        "Offering",
                        "Capacity",
                        "Seats in use",
                        "Registrations",
                        "Enrolled",
                        "In progress",
                        "Awaiting approval",
                      ],
                      ...e.by_offering.map((row) => [
                        row.title,
                        row.unlimited_seats
                          ? "Unlimited"
                          : (row.capacity ?? "Not set"),
                        row.seats_in_use,
                        row.registrations,
                        row.enrolled,
                        row.in_progress,
                        row.awaiting_approval,
                      ]),
                    ],
                  )
                }
              >
                Export CSV
              </Button>
            </Stack>
            <Stack spacing={1.5} sx={phoneOnly}>
              {e.by_offering.map((row) => (
                <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" component="h4">
                    {row.title}
                  </Typography>
                  <Box sx={{ my: 1 }}>
                    {row.capacity !== null && (
                      <Meter
                        used={row.seats_in_use}
                        total={row.capacity}
                        label={`Seats filled for ${row.title}`}
                      />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {row.unlimited_seats
                      ? `Unlimited seats · ${row.seats_in_use} in use`
                      : row.capacity === null
                        ? "Seat capacity not set"
                        : `${row.seats_in_use} of ${row.capacity} seats`}{" "}
                    · {row.registrations} registrations · {row.enrolled}{" "}
                    enrolled · {row.in_progress} in progress ·{" "}
                    {row.awaiting_approval} awaiting approval
                  </Typography>
                </Paper>
              ))}
            </Stack>
            <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
              <Table aria-label="Enrollment by offering">
                <TableHead>
                  <TableRow>
                    <TableCell>Offering</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      Seats filled now
                    </TableCell>
                    <TableCell align="right">Registrations</TableCell>
                    <TableCell align="right">Enrolled</TableCell>
                    <TableCell align="right">In progress</TableCell>
                    <TableCell align="right">Awaiting approval</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {e.by_offering.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        {row.title}
                        {!row.published && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            Unpublished
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.capacity !== null && (
                          <Meter
                            used={row.seats_in_use}
                            total={row.capacity}
                            label={`Seats filled for ${row.title}`}
                          />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {row.unlimited_seats
                            ? `Unlimited seats · ${row.seats_in_use} in use`
                            : row.capacity === null
                              ? "Not set"
                              : `${row.seats_in_use} of ${row.capacity}`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{row.registrations}</TableCell>
                      <TableCell align="right">{row.enrolled}</TableCell>
                      <TableCell align="right">{row.in_progress}</TableCell>
                      <TableCell align="right">
                        {row.awaiting_approval}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Box component="section" aria-labelledby="dash-sales">
            <Typography
              id="dash-sales"
              variant="h6"
              component="h2"
              sx={{ mb: 1.5 }}
            >
              Sales (simulated)
            </Typography>
            {!canSales || !s ? (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography color="text.secondary">
                  Sales figures are shown to staff administrators.
                </Typography>
              </Paper>
            ) : (
              <>
                <Box sx={tiles}>
                  <StatTile
                    label="Gross sales"
                    value={money(s.gross_cents)}
                    note="Simulated payments"
                  />
                  <StatTile label="Orders" value={count(s.orders)} />
                  <StatTile
                    label="Average order"
                    value={averageOrder(s.gross_cents, s.orders)}
                  />
                  <StatTile
                    label="First-time buyers"
                    value={count(s.first_time_buyers)}
                  />
                  <StatTile
                    label="Returning buyers"
                    value={count(s.returning_buyers)}
                  />
                  <StatTile
                    label="Refunds"
                    value="—"
                    note="Arrive with Stripe and refunds (M5)"
                  />
                </Box>
                <Box sx={{ mt: 2 }}>
                  <ColumnChart
                    title={`Gross sales per ${data.range.bucket}`}
                    data={s.trend}
                    bucket={data.range.bucket}
                    format={(value) => money(value)}
                  />
                </Box>
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    mt: 3,
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle1" component="h3">
                    Sales by offering
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={() =>
                      downloadCsv(
                        `sales-${data.range.from}-to-${data.range.to}.csv`,
                        [
                          ["Offering", "Orders", "Gross (USD)"],
                          ...s.by_offering.map((row) => [
                            row.title,
                            row.orders,
                            (row.gross_cents / 100).toFixed(2),
                          ]),
                        ],
                      )
                    }
                  >
                    Export CSV
                  </Button>
                </Stack>
                {s.by_offering.length ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table aria-label="Sales by offering">
                      <TableHead>
                        <TableRow>
                          <TableCell>Offering</TableCell>
                          <TableCell align="right">Orders</TableCell>
                          <TableCell align="right">Gross</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {s.by_offering.map((row) => (
                          <TableRow key={row.id} hover>
                            <TableCell>{row.title}</TableCell>
                            <TableCell align="right">{row.orders}</TableCell>
                            <TableCell align="right">
                              {money(row.gross_cents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">
                      No sales in this date range.
                    </Typography>
                  </Paper>
                )}
              </>
            )}
          </Box>

          <Box component="section" aria-labelledby="dash-completion">
            <Typography
              id="dash-completion"
              variant="h6"
              component="h2"
              sx={{ mb: 1.5 }}
            >
              Completion
            </Typography>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography>
                Documented completion progress and cohort reports are available
                in Progress and cohorts.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Automatic Canvas completion statistics and completion trends are
                not available yet.
              </Typography>
              <Button href="/staff/progress" sx={{ mt: 2 }}>
                Open progress and cohorts
              </Button>
            </Paper>
          </Box>
        </Stack>
      )}
    </>
  );
}
