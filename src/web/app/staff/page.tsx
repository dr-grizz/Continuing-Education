"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import {
  api,
  date,
  courseStart,
  money,
  Offering,
  Learning,
} from "../../components/api";
import { LoadingCards } from "../../components/loading";
import {
  SortableHeader,
  SortSelect,
  TablePager,
  useTableView,
} from "../../components/table-view";
type AuditEntry = {
  actor: string;
  action: string;
  created_at: string;
  actor_email: string | null;
  offering_title: string | null;
  subject_email: string | null;
};
type ApprovalRequest = Learning & {
  created_at: string;
  learner_email: string | null;
};
const auditLabels: Record<string, string> = {
  "approval.requested": "Approval requested",
  "approval.approved": "Approval granted",
  "approval.declined": "Approval declined",
  "seat.reserved": "Seat reserved",
  "seat.expired": "Reservation expired",
  "prototype.payment_simulated": "Payment simulated",
  "prototype.identity_simulated": "Identity prepared (simulated)",
  "prototype.enrollment_simulated": "Enrollment completed (simulated)",
  "offering.created": "Draft offering created",
  "prototype.offering_published": "Offering published",
};
const actorLabels: Record<string, string> = {
  "demo-staff": "Staff (demo)",
  "demo-learner": "Legacy demo learner",
  "demo-automation": "Automation token",
  "prototype-worker": "Background worker",
};
const actorLabel = (entry: AuditEntry) =>
  entry.actor_email ?? actorLabels[entry.actor] ?? entry.actor;
const eventLabel = (entry: AuditEntry) =>
  auditLabels[entry.action] ?? entry.action;
const eventDetail = (entry: AuditEntry) =>
  [
    entry.offering_title,
    entry.subject_email && entry.subject_email !== entry.actor_email
      ? `for ${entry.subject_email}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
// Tables on tablet/desktop; stacked cards on phones where columns would scroll.
const wideOnly = { display: { xs: "none", sm: "block" } };
const phoneOnly = { display: { xs: "block", sm: "none" } };
const initial = {
  title: "",
  category: "Technology",
  summary: "",
  description: "",
  format: "Online",
  courseType: "self_paced",
  startDate: "2026-11-02",
  endDate: "2026-12-11",
  price: "149",
  capacity: "20",
  approvalRequired: false,
};
export default function Staff() {
  const [tab, setTab] = useState(0),
    [courses, setCourses] = useState<Offering[]>([]),
    [requests, setRequests] = useState<ApprovalRequest[]>([]),
    [report, setReport] = useState<{
      simulated_orders: number;
      simulated_enrollments: number;
      pending_operations: number;
      audit: AuditEntry[];
    }>(),
    [loaded, setLoaded] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState<"all" | "published" | "draft">("all"),
    [approvalQuery, setApprovalQuery] = useState(""),
    [activityQuery, setActivityQuery] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState(initial);
  async function refresh() {
    const [c, r, p] = await Promise.all([
      api<Offering[]>("staff/offerings", { role: "staff" }),
      api<ApprovalRequest[]>("approval-requests", { role: "staff" }),
      api<typeof report>("reconciliation", { role: "staff" }),
    ]);
    setCourses(c);
    setRequests(r);
    setReport(p);
    setLoaded(true);
  }
  const byText = (a: string, b: string) => a.localeCompare(b);
  const offeringsView = useTableView(courses, {
    compare: {
      title: (a, b) => byText(a.title, b.title),
      // Self-paced courses have no start date and sort first.
      start: (a, b) =>
        byText(a.start_date ?? "", b.start_date ?? "") ||
        byText(a.title, b.title),
      price: (a, b) => a.price_cents - b.price_cents,
      seats: (a, b) => a.seats_available - b.seats_available,
      status: (a, b) => Number(a.published) - Number(b.published),
    },
    initial: { key: "start", direction: "asc" },
    matches: (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || (status === "published") === c.published),
  });
  const approvalsView = useTableView(requests, {
    compare: {
      learner: (a, b) => byText(a.learner_email ?? "", b.learner_email ?? ""),
      title: (a, b) => byText(a.title, b.title),
      requested: (a, b) => byText(a.created_at, b.created_at),
    },
    initial: { key: "requested", direction: "asc" },
    matches: (r) =>
      `${r.learner_email ?? ""} ${r.title}`
        .toLowerCase()
        .includes(approvalQuery.toLowerCase()),
  });
  const activityView = useTableView(report?.audit ?? [], {
    compare: {
      time: (a, b) => byText(a.created_at, b.created_at),
      event: (a, b) => byText(eventLabel(a), eventLabel(b)),
      by: (a, b) => byText(actorLabel(a), actorLabel(b)),
    },
    initial: { key: "time", direction: "desc" },
    matches: (entry) =>
      `${eventLabel(entry)} ${eventDetail(entry)} ${actorLabel(entry)}`
        .toLowerCase()
        .includes(activityQuery.toLowerCase()),
  });
  const publish = (c: Offering) =>
    action(
      `offerings/${c.id}/publish`,
      { version: c.version },
      "Sample offering published. Real Canvas mapping checks are deferred.",
    );
  const decide = (r: ApprovalRequest, decision: "approved" | "declined") =>
    action(
      `approval-requests/${r.id}/decision`,
      { decision },
      decision === "approved"
        ? "Request approved. The learner can now reserve a seat."
        : "Request declined.",
    );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function action(path: string, body: unknown, text: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(path, { role: "staff", body });
      await refresh();
      setMessage(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("offerings", {
        role: "staff",
        body: {
          title: form.title,
          category: form.category,
          summary: form.summary,
          description: form.description,
          format: form.format,
          courseType: form.courseType,
          ...(form.courseType === "cohort"
            ? { startDate: form.startDate, endDate: form.endDate }
            : {}),
          priceCents: Math.round(Number(form.price) * 100),
          capacity: Number(form.capacity),
          approvalRequired: form.approvalRequired,
        },
      });
      await refresh();
      setOpen(false);
      setForm(initial);
      setMessage("Draft offering saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Staff workspace
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Manage sample offerings, review requests and follow workflow
            activity.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          href="http://localhost:3001/api/docs"
          target="_blank"
        >
          API documentation
        </Button>
      </Stack>
      <Alert severity="info" sx={{ mt: 3 }}>
        Demo staff access is enabled locally. Production SSO, roles and
        integration checks are not connected.
      </Alert>
      {error && !open && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      <Snackbar
        open={Boolean(message)}
        autoHideDuration={6000}
        onClose={() => setMessage("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setMessage("")}
        >
          {message}
        </Alert>
      </Snackbar>
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="scrollable"
        sx={{ mt: 3, mb: 3, borderBottom: 1, borderColor: "divider" }}
        aria-label="Staff workspace"
      >
        <Tab label="Offerings" />
        <Tab label={`Approvals (${requests.length})`} />
        <Tab label="Activity" />
      </Tabs>
      {!loaded && !error && <LoadingCards label="Loading staff workspace" />}
      {loaded && tab === 0 && (
        <>
          <Stack
            direction="row"
            sx={{
              mb: 2,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="h6" component="h2">
              Course offerings
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setError("");
                setOpen(true);
              }}
            >
              New offering
            </Button>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2, mb: 2 }}>
            <TextField
              label="Search offerings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="published">Published</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
            </TextField>
            <SortSelect
              view={offeringsView}
              options={{
                "start:asc": "Soonest start",
                "title:asc": "Title A–Z",
                "price:asc": "Price: low to high",
                "price:desc": "Price: high to low",
                "seats:asc": "Fewest seats left",
                "status:asc": "Drafts first",
              }}
            />
          </Stack>
          <Typography
            variant="body2"
            color="text.secondary"
            aria-live="polite"
            sx={{ mb: 1.5 }}
          >
            {offeringsView.count} of {offeringsView.total} offerings
          </Typography>
          <Stack spacing={1.5} sx={phoneOnly}>
            {offeringsView.visible.map((c) => (
              <Paper key={c.id} variant="outlined" sx={{ p: 2 }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", gap: 1 }}
                >
                  <Typography variant="subtitle1" component="h3">
                    {c.title}
                  </Typography>
                  <Chip
                    label={c.published ? "Published" : "Draft"}
                    variant="outlined"
                    color={c.published ? "success" : "default"}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {c.category}
                  {c.approval_required ? " · Approval required" : ""}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {courseStart(c)} · {money(c.price_cents)} ·{" "}
                  {c.seats_available} / {c.capacity} seats
                </Typography>
                {!c.published && (
                  <Button
                    variant="outlined"
                    disabled={busy}
                    onClick={() => publish(c)}
                    aria-label={`Publish ${c.title}`}
                    sx={{ mt: 1.5 }}
                  >
                    Publish
                  </Button>
                )}
              </Paper>
            ))}
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
            <Table aria-label="Course offerings">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    view={offeringsView}
                    column="title"
                    label="Offering"
                  />
                  <SortableHeader
                    view={offeringsView}
                    column="start"
                    label="Schedule"
                  />
                  <SortableHeader
                    view={offeringsView}
                    column="price"
                    label="Price"
                  />
                  <SortableHeader
                    view={offeringsView}
                    column="seats"
                    label="Seats"
                  />
                  <SortableHeader
                    view={offeringsView}
                    column="status"
                    label="Status"
                  />
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {offeringsView.visible.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{c.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.category}
                        {c.approval_required ? " · Approval required" : ""}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {courseStart(c)}
                    </TableCell>
                    <TableCell>{money(c.price_cents)}</TableCell>
                    <TableCell>
                      {c.seats_available} / {c.capacity}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={c.published ? "Published" : "Draft"}
                        variant="outlined"
                        color={c.published ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell>
                      {!c.published && (
                        <Button
                          disabled={busy}
                          onClick={() => publish(c)}
                          aria-label={`Publish ${c.title}`}
                        >
                          Publish
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePager view={offeringsView} label="Offerings" />
        </>
      )}
      {loaded && tab === 1 && (
        <>
          <Stack
            direction="row"
            sx={{
              mb: 2,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="h6" component="h2">
              Approval requests
            </Typography>
            <Button onClick={() => refresh().catch((e) => setError(e.message))}>
              Refresh
            </Button>
          </Stack>
          {requests.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4 }}>
              <Typography>No requests awaiting approval.</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Try requesting Healthcare Communication from the catalog.
              </Typography>
            </Paper>
          ) : (
            <>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{ gap: 2, mb: 2 }}
              >
                <TextField
                  label="Search requests"
                  placeholder="Learner email or course"
                  value={approvalQuery}
                  onChange={(e) => setApprovalQuery(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <SortSelect
                  view={approvalsView}
                  options={{
                    "requested:asc": "Oldest first",
                    "requested:desc": "Newest first",
                    "learner:asc": "Learner A–Z",
                    "title:asc": "Course A–Z",
                  }}
                />
              </Stack>
              <Typography
                variant="body2"
                color="text.secondary"
                aria-live="polite"
                sx={{ mb: 1.5 }}
              >
                {approvalsView.count} of {approvalsView.total} requests
              </Typography>
              <Stack spacing={1.5} sx={phoneOnly}>
                {approvalsView.visible.map((r) => (
                  <Paper key={r.id} variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle1" component="h3">
                      {r.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ overflowWrap: "anywhere" }}
                    >
                      {r.learner_email || "Legacy demo learner"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Requested {new Date(r.created_at).toLocaleDateString()}
                    </Typography>
                    <Stack direction="row" sx={{ gap: 1, mt: 1.5 }}>
                      <Button
                        disabled={busy}
                        variant="outlined"
                        onClick={() => decide(r, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        disabled={busy}
                        color="error"
                        onClick={() => decide(r, "declined")}
                      >
                        Decline
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={wideOnly}
              >
                <Table aria-label="Approval requests">
                  <TableHead>
                    <TableRow>
                      <SortableHeader
                        view={approvalsView}
                        column="learner"
                        label="Learner"
                      />
                      <SortableHeader
                        view={approvalsView}
                        column="title"
                        label="Offering"
                      />
                      <SortableHeader
                        view={approvalsView}
                        column="requested"
                        label="Requested"
                      />
                      <TableCell>Decision</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {approvalsView.visible.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell sx={{ overflowWrap: "anywhere" }}>
                          {r.learner_email || "Legacy demo learner"}
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                            }}
                          >
                            Demo learner
                          </Typography>
                        </TableCell>
                        <TableCell>{r.title}</TableCell>
                        <TableCell>
                          {new Date(r.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            sx={{
                              gap: 1,
                            }}
                          >
                            <Button
                              disabled={busy}
                              variant="outlined"
                              onClick={() => decide(r, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              disabled={busy}
                              color="error"
                              onClick={() => decide(r, "declined")}
                            >
                              Decline
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePager view={approvalsView} label="Approval requests" />
            </>
          )}
        </>
      )}
      {loaded && tab === 2 && (
        <>
          <Stack
            direction="row"
            sx={{
              mb: 2,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="h6" component="h2">
              Workflow activity
            </Typography>
            <Button onClick={() => refresh().catch((e) => setError(e.message))}>
              Refresh
            </Button>
          </Stack>
          <Typography sx={{ mb: 2 }} color="text.secondary">
            {report?.simulated_orders || 0} simulated orders ·{" "}
            {report?.simulated_enrollments || 0} simulated enrollments ·{" "}
            {report?.pending_operations || 0} pending operations
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2, mb: 2 }}>
            <TextField
              label="Search activity"
              placeholder="Event, course or learner"
              value={activityQuery}
              onChange={(e) => setActivityQuery(e.target.value)}
              sx={{ flex: 1 }}
            />
            <SortSelect
              view={activityView}
              options={{
                "time:desc": "Newest first",
                "time:asc": "Oldest first",
                "event:asc": "Event A–Z",
                "by:asc": "Actor A–Z",
              }}
            />
          </Stack>
          <Typography
            variant="body2"
            color="text.secondary"
            aria-live="polite"
            sx={{ mb: 1.5 }}
          >
            {activityView.count} of {activityView.total} recent events
          </Typography>
          <Stack spacing={1.5} sx={phoneOnly}>
            {activityView.visible.map((entry, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" component="p">
                  {eventLabel(entry)}
                </Typography>
                {eventDetail(entry) && (
                  <Typography variant="body2">{eventDetail(entry)}</Typography>
                )}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {actorLabel(entry)} ·{" "}
                  {new Date(entry.created_at).toLocaleString()}
                </Typography>
              </Paper>
            ))}
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
            <Table aria-label="Audit activity">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    view={activityView}
                    column="time"
                    label="Time"
                  />
                  <SortableHeader
                    view={activityView}
                    column="event"
                    label="Event"
                  />
                  <TableCell>Details</TableCell>
                  <SortableHeader view={activityView} column="by" label="By" />
                </TableRow>
              </TableHead>
              <TableBody>
                {activityView.visible.map((entry, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{eventLabel(entry)}</TableCell>
                    <TableCell>{eventDetail(entry) || "—"}</TableCell>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {actorLabel(entry)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePager view={activityView} label="Activity" />
        </>
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setError("");
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create sample offering</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
            <TextField
              autoFocus
              required
              label="Course title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <TextField
              select
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {["Technology", "Leadership", "Healthcare", "Ministry"].map(
                (c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ),
              )}
            </TextField>
            <TextField
              required
              label="Short summary"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
            <TextField
              required
              label="Description"
              multiline
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
            <TextField
              select
              label="Course type"
              value={form.courseType}
              onChange={(e) => setForm({ ...form, courseType: e.target.value })}
              slotProps={{ select: { native: true } }}
            >
              <option value="cohort">Scheduled — set start date</option>
              <option value="self_paced">Self-paced — start anytime</option>
            </TextField>
            <TextField
              label="Format"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            />
            {form.courseType === "cohort" ? (
              <Stack
                direction="row"
                sx={{
                  gap: 2,
                }}
              >
                <TextField
                  required
                  fullWidth
                  type="date"
                  label="Start date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
                <TextField
                  required
                  fullWidth
                  type="date"
                  label="End date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                />
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Learners can start anytime. No cohort dates are required.
              </Typography>
            )}

            <Stack
              direction="row"
              sx={{
                gap: 2,
              }}
            >
              <TextField
                required
                fullWidth
                type="number"
                label="Price (USD)"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <TextField
                required
                fullWidth
                type="number"
                label="Seat capacity"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={form.approvalRequired}
                  onChange={(e) =>
                    setForm({ ...form, approvalRequired: e.target.checked })
                  }
                />
              }
              label="Approval required before payment"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setError("");
            }}
          >
            Cancel
          </Button>
          <Button variant="contained" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
