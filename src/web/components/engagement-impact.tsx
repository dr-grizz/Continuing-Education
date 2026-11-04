"use client";
import { useEffect, useId, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import type {
  EngagementImpact,
  ImpactRow,
} from "../../domain/engagement-impact";
import { api } from "./api";
import { visuallyHidden } from "./visually-hidden";
import {
  CompletionDonut,
  ImpactBars,
  progressSeries as series,
} from "./impact-charts";

const DAY = 86400000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const today = () => Date.parse(iso(Date.now()));
const count = (n: number) => n.toLocaleString("en-US");
const percent = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const dateLabel = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
const tiles = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4,1fr)" },
};
const twoColumns = {
  display: "grid",
  gap: 3,
  gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.3fr) minmax(0,1fr)" },
};
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
          fontSize: 34,
          fontWeight: 650,
          my: 0.5,
          fontVariantNumeric: "tabular-nums",
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
function Delta({ current, previous }: { current: number; previous: number }) {
  const difference = current - previous;
  return `${difference > 0 ? "+" : ""}${count(difference)} vs. previous period (${count(previous)})`;
}
function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
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
        id={id}
        component="h2"
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
function CompletionRows({
  rows,
  kind,
}: {
  rows: ImpactRow[];
  kind: "offering" | "cohort";
}) {
  const populated = rows.filter((r) => r.registrations || r.assignments);
  if (!populated.length)
    return (
      <Typography color="text.secondary">
        No registrations or progress assignments in this selection.
      </Typography>
    );
  return (
    <TableContainer>
      <Table
        size="small"
        aria-label={`${kind === "offering" ? "Offering" : "Cohort"} outcomes`}
      >
        <TableHead>
          <TableRow>
            <TableCell>{kind === "offering" ? "Offering" : "Cohort"}</TableCell>
            <TableCell align="right">Registrations</TableCell>
            <TableCell align="right">Assigned</TableCell>
            <TableCell align="right">Completed</TableCell>
            <TableCell align="right">Completion</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {populated.map((row) => (
            <TableRow key={row.id}>
              <TableCell component="th" scope="row">
                <Link
                  href={
                    kind === "offering"
                      ? `/staff/offerings/${row.id}`
                      : "/staff/progress"
                  }
                >
                  {row.title}
                </Link>
              </TableCell>
              <TableCell align="right">{count(row.registrations)}</TableCell>
              <TableCell align="right">{count(row.assignments)}</TableCell>
              <TableCell align="right">{count(row.completed)}</TableCell>
              <TableCell align="right">{percent(row.completionRate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
function OfferingChart({ rows }: { rows: ImpactRow[] }) {
  const [measure, setMeasure] = useState<
    "registrations" | "completed" | "completionRate"
  >("registrations");
  const rate = measure === "completionRate";
  const values = rows
    .filter((r) => r.registrations || r.assignments)
    .map((r) => ({
      id: r.id,
      label: r.title,
      value: r[measure],
      detail: rate
        ? `${r.completed} of ${r.assignments} assignments completed`
        : measure === "completed"
          ? `${r.assignments} progress assignments`
          : undefined,
    }))
    .sort(
      (a, b) =>
        (b.value ?? -1) - (a.value ?? -1) || a.label.localeCompare(b.label),
    );
  return (
    <>
      <TextField
        select
        label="Offering chart measure"
        value={measure}
        onChange={(e) => setMeasure(e.target.value as typeof measure)}
        sx={{ minWidth: 220, maxWidth: "100%", mb: 2 }}
      >
        <MenuItem value="registrations">Registrations</MenuItem>
        <MenuItem value="completed">Completed assignments</MenuItem>
        <MenuItem value="completionRate">Completion rate</MenuItem>
      </TextField>
      <ImpactBars
        title="Offering comparison chart"
        rows={values}
        unit={
          rate
            ? "completion"
            : measure === "completed"
              ? "completed assignments"
              : "registrations"
        }
        maximum={rate ? 100 : undefined}
        format={rate ? (n) => `${n.toFixed(1)}%` : undefined}
        empty="No registrations or progress assignments in this selection."
      />
      {values.length > 0 && (
        <Box component="details" sx={{ mt: 2 }}>
          <Box component="summary" sx={{ cursor: "pointer", mb: 1 }}>
            View offering counts and rates
          </Box>
          <CompletionRows rows={rows} kind="offering" />
        </Box>
      )}
    </>
  );
}
function CohortBars({ rows }: { rows: ImpactRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const populated = rows.filter((r) => r.assignments);
  const shown = expanded ? populated : populated.slice(0, 8);
  const max = Math.max(1, ...populated.map((r) => r.assignments));
  return (
    <Stack spacing={2}>
      {populated.length ? (
        <>
          <Stack direction="row" useFlexGap sx={{ gap: 1.5, flexWrap: "wrap" }}>
            {series.map((s) => (
              <Stack
                key={s.key}
                direction="row"
                sx={{ gap: 0.6, alignItems: "center" }}
              >
                <Box
                  aria-hidden
                  sx={{ width: 10, height: 10, bgcolor: s.color }}
                />
                <Typography variant="caption">{s.name}</Typography>
              </Stack>
            ))}
          </Stack>
          {shown.map((row) => (
            <Box key={row.id}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                {row.title} · {row.completed}/{row.assignments} completed
              </Typography>
              <Box
                role="img"
                aria-label={`${row.title}: ${series.map((s) => `${row[s.key]} ${s.name.toLowerCase()}`).join(", ")}`}
                sx={{
                  height: 22,
                  display: "flex",
                  width: `${(100 * row.assignments) / max}%`,
                  minWidth: 2,
                  overflow: "hidden",
                  borderRadius: 0.5,
                }}
              >
                {series.map((s) => (
                  <Box
                    key={s.key}
                    sx={{
                      width: `${(100 * row[s.key]) / row.assignments}%`,
                      bgcolor: s.color,
                    }}
                  />
                ))}
              </Box>
            </Box>
          ))}
          {populated.length > 8 && (
            <Button onClick={() => setExpanded(!expanded)}>
              {expanded
                ? "Show fewer cohorts"
                : `Show all ${populated.length} cohorts`}
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            Longest bar = {max} assignments. Cohorts can share learners; their
            counts are not additive.
          </Typography>
        </>
      ) : (
        <Typography color="text.secondary">
          No cohort members were assigned progress requirements during this
          period.
        </Typography>
      )}
    </Stack>
  );
}
function RegistrationTrend({ data }: { data: EngagementImpact }) {
  const [table, setTable] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...data.trend.map((p) => p.registrations));
  const active = data.trend.find((p) => p.date === selected);
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {data.range.days <= 31
          ? "Daily registrations"
          : "Registrations in seven-day buckets; the final bucket may be shorter"}{" "}
        · {count(data.reach.registrations)} total
      </Typography>
      {data.reach.registrations === 0 ? (
        <Typography sx={{ my: 3 }}>
          No registrations were recorded during this period.
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              gap: 0.4,
              height: 160,
              alignItems: "stretch",
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
                aria-label={`${dateLabel(p.date)}${data.range.days > 31 ? ", bucket starting" : ""}: ${p.registrations} registrations`}
                aria-pressed={selected === p.date}
                onClick={() => setSelected(p.date)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  px: 0,
                  border: 0,
                  bgcolor: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-end",
                  outlineOffset: 3,
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: "text.primary",
                  },
                }}
              >
                <Box
                  sx={{
                    width: "100%",
                    height: p.registrations
                      ? `${(100 * p.registrations) / max}%`
                      : "0px",
                    minHeight: p.registrations ? 3 : 0,
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
            <Typography variant="caption">
              {dateLabel(data.range.from)}
            </Typography>
            <Typography variant="caption">
              {dateLabel(data.range.to)}
            </Typography>
          </Stack>
          <Typography
            role="status"
            variant="body2"
            sx={{ minHeight: 24, my: 1 }}
          >
            {active
              ? `${dateLabel(active.date)}: ${count(active.registrations)} registrations${data.range.days > 31 ? " in this bucket" : ""}`
              : "Select a bar to inspect its count."}
          </Typography>
        </>
      )}
      <Button onClick={() => setTable(!table)} aria-expanded={table}>
        {table ? "Hide daily counts" : "Show counts table"}
      </Button>
      {table && (
        <TableContainer sx={{ maxHeight: 300 }}>
          <Table size="small" aria-label="Registration trend counts">
            <TableHead>
              <TableRow>
                <TableCell>
                  {data.range.days > 31 ? "Bucket starting" : "Date"}
                </TableCell>
                <TableCell align="right">Registrations</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.trend.map((p) => (
                <TableRow key={p.date}>
                  <TableCell>{dateLabel(p.date)}</TableCell>
                  <TableCell align="right">{p.registrations}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
function exportCsv(data: EngagementImpact) {
  const rows: (string | number)[][] = [
    [
      "Engagement and Impact",
      `${data.range.from} through ${data.range.to} UTC`,
    ],
    ["Offering filter", data.filters.offeringId ?? "All"],
    ["Cohort filter", data.filters.cohortId ?? "All"],
    ["Metric", "Value"],
    ["Registered learners", data.reach.learners],
    ["Registrations", data.reach.registrations],
    ["Previous registered learners", data.reach.previousLearners],
    ["Previous registrations", data.reach.previousRegistrations],
    ["Returning registered learners", data.reach.returningLearners],
    ["Progress assignments", data.progress.assignments],
    ["Completed assignments", data.progress.completed],
    ["Completion rate (%)", data.progress.completionRate ?? "Unavailable"],
    [
      "Definition",
      "Progress covers assignments created in the selected period, evaluated from required-step evidence recorded before the period ended. Active learners and current cohort membership only.",
    ],
    [
      "Group",
      "Name",
      "Registrations",
      "Assignments",
      "Completed",
      "In progress",
      "Awaiting verification",
      "Verified not started",
      "Completion (%)",
    ],
    ...data.offerings.map((r) => [
      "Offering",
      r.title,
      r.registrations,
      r.assignments,
      r.completed,
      r.inProgress,
      r.awaitingVerification,
      r.notStarted,
      r.completionRate ?? "Unavailable",
    ]),
    ...data.cohorts.map((r) => [
      "Cohort (overlapping)",
      r.title,
      r.registrations,
      r.assignments,
      r.completed,
      r.inProgress,
      r.awaitingVerification,
      r.notStarted,
      r.completionRate ?? "Unavailable",
    ]),
    ["Trend date / bucket start", "Registrations"],
    ...data.trend.map((p) => [p.date, p.registrations]),
    ["Course skill coverage (not mastery)", "Offerings", "Registered learners"],
    [
      "Skill source",
      "O*NET Database, USDOL/ETA, CC BY 4.0; offering coverage is an institutional addition. https://www.onetcenter.org/database.html",
    ],
    ...data.skills.map((s) => [s.name, s.offerings, s.learners]),
  ];
  if (data.credentials) {
    const c = data.credentials;
    rows.push(
      [
        "Credential scope",
        "Awards issued in the period to explicitly linked selected learners; offering/cohort filters select recipients, not the accomplishment.",
      ],
      [
        "Credential source",
        c.available ? "Available" : (c.warning ?? "Unavailable"),
      ],
    );
    if (c.available)
      rows.push(
        ["Badges", c.badges],
        ["Certificates", c.certificates],
        ["Credential recipients", c.recipients],
        ["Paired accomplishments", c.pairedAccomplishments],
        ["Currently shared badges", c.sharedBadges],
        ["Acknowledged awards by period end", c.acknowledgedAwards],
        ["Invalid/revoked records excluded", c.excluded],
      );
  }
  rows.push(
    ["Canvas activity", data.canvas.message],
    ["Generated", data.generatedAt],
    [
      "Outcome limitation",
      "No employment, salary improvement, workplace transfer, or causal impact is measured.",
    ],
  );
  const cell = (v: string | number) =>
    `"${String(v)
      .replace(/^\s*[=+\-@]/, "'$&")
      .replaceAll('"', '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `engagement-impact-${data.range.from}-${data.range.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
export function EngagementImpactDashboard() {
  const [data, setData] = useState<EngagementImpact>(),
    [options, setOptions] = useState<EngagementImpact["options"]>({
      offerings: [],
      cohorts: [],
    });
  const [preset, setPreset] = useState("30"),
    [from, setFrom] = useState(iso(today() - 30 * DAY)),
    [to, setTo] = useState(iso(today() - DAY));
  const [offering, setOffering] = useState("all"),
    [cohort, setCohort] = useState("all"),
    [query, setQuery] = useState(""),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setData(undefined);
    setError("");
    api<EngagementImpact>(
      `staff/engagement-impact${query ? "?" + query : ""}`,
      { role: "staff" },
    )
      .then((result) => {
        if (current) {
          setData(result);
          setOptions(result.options);
        }
      })
      .catch((e) => {
        if (current) setError(e.message || "Unable to load analytics.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [query, version]);
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams({ from, to });
    if (offering !== "all") params.set("offeringId", offering);
    if (cohort !== "all") params.set("cohortId", cohort);
    setQuery(params.toString());
    setVersion((v) => v + 1);
  }
  const c = data?.credentials;
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
            label="From (UTC)"
            type="date"
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
            label="Through (UTC)"
            type="date"
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
            label="Offering"
            value={offering}
            onChange={(e) => {
              setOffering(e.target.value);
              setCohort("all");
            }}
            sx={{ minWidth: 180, maxWidth: "100%", flex: 1 }}
          >
            <MenuItem value="all">All offerings</MenuItem>
            {options.offerings.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Cohort"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            sx={{ minWidth: 180, maxWidth: "100%", flex: 1 }}
          >
            <MenuItem value="all">All cohorts</MenuItem>
            {options.cohorts
              .filter((c) => offering === "all" || c.offeringId === offering)
              .map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
          </TextField>
          <Button type="submit" variant="contained" disabled={loading}>
            Apply filters
          </Button>
          <Button
            type="button"
            startIcon={<RefreshIcon />}
            disabled={loading}
            onClick={() => setVersion((v) => v + 1)}
          >
            Refresh
          </Button>
        </Stack>
      </Box>
      {loading && <LinearProgress aria-label="Loading engagement and impact" />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => setVersion((v) => v + 1)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {data && (
        <>
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
              {dateLabel(data.range.from)} – {dateLabel(data.range.to)} ·
              Complete UTC days · Active learners
              {" · "}
              {data.options.offerings.find(
                (o) => o.id === data.filters.offeringId,
              )?.title ?? "All offerings"}
              {" · "}
              {data.options.cohorts.find((c) => c.id === data.filters.cohortId)
                ?.name ?? "All cohorts"}
            </Typography>
            <Button
              startIcon={<DownloadIcon />}
              onClick={() => exportCsv(data)}
            >
              Export analytics CSV
            </Button>
          </Stack>
          <Box aria-live="polite" sx={visuallyHidden}>
            {data.reach.learners} registered learners; {data.progress.completed}{" "}
            of {data.progress.assignments} progress assignments completed.
          </Box>
          <Box sx={tiles}>
            <Metric
              label="Registered learners"
              value={count(data.reach.learners)}
              note="Distinct learners registering in the period"
              comparison={Delta({
                current: data.reach.learners,
                previous: data.reach.previousLearners,
              })}
            />
            <Metric
              label="Registrations"
              value={count(data.reach.registrations)}
              note={`${count(data.reach.enrolled)} currently enrolled`}
              comparison={Delta({
                current: data.reach.registrations,
                previous: data.reach.previousRegistrations,
              })}
            />
            <Metric
              label="Documented completion"
              value={percent(data.progress.completionRate)}
              note={`${count(data.progress.completed)} of ${count(data.progress.assignments)} assignments`}
              comparison="Assigned in period · evidence at period end"
            />
            <Metric
              label="Returning learners"
              value={count(data.reach.returningLearners)}
              note="Registered again after an earlier registration"
              comparison="Any earlier portal registration before this period"
            />
          </Box>
          {c && (
            <Section
              title="Credentials and recognition"
              note="Awards issued in this period to explicitly linked selected learners. Offering and cohort filters select recipients; they do not attribute an award to that course."
            >
              {!c.available ? (
                <Alert severity="warning">
                  {c.warning} Credential totals are unavailable.
                </Alert>
              ) : (
                <>
                  <Box sx={twoColumns}>
                    <Box>
                      <Typography
                        component="h3"
                        variant="subtitle1"
                        sx={{ mb: 1 }}
                      >
                        Credentials issued
                      </Typography>
                      <ImpactBars
                        title="Credentials issued chart"
                        unit="awards"
                        rows={[
                          {
                            id: "badges",
                            label: "Badges issued",
                            value: c.badges,
                            color: "#2a78d6",
                          },
                          {
                            id: "certificates",
                            label: "Certificates issued",
                            value: c.certificates,
                            color: "#ad7930",
                          },
                        ]}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Signature-verified, currently unrevoked awards; badges
                        and certificates count separately.
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      }}
                    >
                      <Metric
                        label="Credential recipients"
                        value={count(c.recipients)}
                        note="Distinct approved learner links"
                      />
                      <Metric
                        label="Paired accomplishments"
                        value={count(c.pairedAccomplishments)}
                        note="Both badge and certificate issued in period"
                      />
                    </Box>
                  </Box>
                  <Stack
                    direction="row"
                    useFlexGap
                    sx={{
                      gap: 1,
                      flexWrap: "wrap",
                      mt: 2,
                      "& .MuiChip-root": { height: "auto", maxWidth: "100%" },
                      "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 },
                    }}
                  >
                    <Chip
                      label={`${count(c.sharedBadges)} badges currently shared`}
                    />
                    <Chip
                      label={`${count(c.acknowledgedAwards)} awarded accomplishments acknowledged by period end`}
                    />
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    A claim records receipt, not a download or learning outcome.
                    Invalid or currently revoked records excluded: {c.excluded}.
                  </Typography>
                </>
              )}
            </Section>
          )}
          <Box sx={twoColumns}>
            <Section title="Participation over time">
              <RegistrationTrend
                key={`${data.range.from}:${data.range.to}`}
                data={data}
              />
            </Section>
            <Section
              title="Documented learning progress"
              note="Assignments created during the period; required-step evidence recorded by its end. A learner can have multiple assignments."
            >
              <CompletionDonut counts={data.progress} />
              <Typography variant="body2" sx={{ mt: 2 }}>
                {count(data.progress.verifiedSteps)} of{" "}
                {count(data.progress.requiredSteps)} required steps verified
                complete across {count(data.progress.learners)} learners.
              </Typography>
              {!data.progress.assignments && (
                <Link
                  href="/staff/progress"
                  sx={{ display: "inline-block", mt: 1 }}
                >
                  Set up progress and cohorts
                </Link>
              )}
            </Section>
          </Box>
          <Section
            title="Offering outcomes"
            note="Registration and progress assignment populations are independent; these columns are not a conversion funnel."
          >
            <OfferingChart rows={data.offerings} />
          </Section>
          <Section
            title="Cohort comparison"
            note="Current active cohort membership. Compare counts alongside rates; cohorts have different follow-up time and can overlap."
          >
            <CohortBars rows={data.cohorts} />
            {data.cohorts.some((c) => c.assignments || c.registrations) && (
              <Box component="details" sx={{ mt: 2 }}>
                <Box component="summary" sx={{ cursor: "pointer", mb: 1 }}>
                  View cohort counts and rates
                </Box>
                <CompletionRows rows={data.cohorts} kind="cohort" />
              </Box>
            )}
          </Section>
          <Section
            title="Skills reached"
            note="O*NET skills attached to selected offerings and their registered learners. Course coverage is not evidence of assessed skill mastery."
          >
            {data.skills.length ? (
              <>
                <ImpactBars
                  title="Skills coverage chart"
                  unit="registered learners"
                  rows={data.skills.map((s) => ({
                    id: s.id,
                    label: s.name,
                    value: s.learners,
                    detail: `${s.offerings} ${s.offerings === 1 ? "offering" : "offerings"}`,
                  }))}
                />
                <Box component="details" sx={{ mt: 2 }}>
                  <Box component="summary" sx={{ cursor: "pointer", mb: 1 }}>
                    View skill counts
                  </Box>
                  <TableContainer>
                    <Table size="small" aria-label="Skills coverage">
                      <TableHead>
                        <TableRow>
                          <TableCell>Skill</TableCell>
                          <TableCell align="right">Offerings</TableCell>
                          <TableCell align="right">
                            Registered learners
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.skills.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell component="th" scope="row">
                              {s.name}
                            </TableCell>
                            <TableCell align="right">{s.offerings}</TableCell>
                            <TableCell align="right">{s.learners}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </>
            ) : (
              <Typography color="text.secondary">
                No skills are attached to offerings in this selection.
              </Typography>
            )}
            <Link href="/skills" sx={{ display: "inline-block", mt: 2 }}>
              Explore skills, careers, and O*NET source information
            </Link>
            {data.skills.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Link
                  href="https://services.onetcenter.org/"
                  title="This site incorporates information from O*NET Web Services. Click to learn more."
                >
                  <Box
                    component="img"
                    src="/credential-tools/onet-in-it.svg"
                    alt="O*NET in-it"
                    sx={{ width: 130, height: 60, border: 0 }}
                  />
                </Link>
                <Typography variant="caption" component="p">
                  This site incorporates information from{" "}
                  <Link
                    href="https://services.onetcenter.org/"
                    sx={{ textDecoration: "underline" }}
                  >
                    O*NET Web Services
                  </Link>{" "}
                  by the U.S. Department of Labor, Employment and Training
                  Administration (USDOL/ETA). O*NET® is a trademark of
                  USDOL/ETA.
                </Typography>
                <Typography variant="caption" component="p">
                  <Link
                    href="https://www.onetcenter.org/database.html"
                    sx={{ textDecoration: "underline" }}
                  >
                    O*NET Database
                  </Link>{" "}
                  information is used under{" "}
                  <Link
                    href="https://creativecommons.org/licenses/by/4.0/"
                    sx={{ textDecoration: "underline" }}
                  >
                    CC BY 4.0
                  </Link>
                  ; offering skill coverage is an institutional addition.
                </Typography>
              </Box>
            )}
          </Section>
          <Alert severity="info" role="note">
            {data.canvas.message}{" "}
            <Link href="/staff/alerts" sx={{ textDecoration: "underline" }}>
              Open Alerts
            </Link>
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Impact here means participation and documented achievement.
            Employment, salary gains, and workplace application are not
            measured.
          </Typography>
          <Box component="details">
            <Box component="summary" sx={{ cursor: "pointer" }}>
              Definitions and data sources
            </Box>
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="body2">
                Registrations come from portal entitlement creation, including
                pending and declined registrations. Enrolled is the current
                status, not historical status. Re-registering the same learner
                in the same offering does not create another registration.
              </Typography>
              <Typography variant="body2">
                Completion = completed progress assignments ÷ all progress
                assignments created in the period. Only required steps count;
                missing evidence stays awaiting verification. Corrections
                recorded after the period ended are excluded. Different
                requirements versions remain separate assignments.
              </Typography>
              <Typography variant="body2">
                The previous registration period is{" "}
                {dateLabel(data.range.previousFrom)} –{" "}
                {dateLabel(data.range.previousTo)}, with the same number of
                complete UTC days and the same current learner/cohort
                eligibility. Membership and account status are not historical
                snapshots.
              </Typography>
              <Typography variant="body2">
                Credential counts use signed badge/certificate records and
                approved account links. Shared/revoked state and offering skills
                are current snapshots. Badges and certificates are separate
                awards; paired accomplishments avoid counting the pair as two
                accomplishments. Expired but unrevoked awards remain historical
                issuance.
              </Typography>
              <Typography variant="body2">
                Sources: portal registrations, versioned progress plans and
                staff evidence, cohort membership, signed credential register,
                credential claims, and curated offering skills. This report does
                not contact Canvas or change records.
              </Typography>
              <Typography variant="caption">
                Retrieved {new Date(data.generatedAt).toLocaleString()}. Refresh
                to load the latest records.
              </Typography>
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
