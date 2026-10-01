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
    [requests, setRequests] = useState<
      (Learning & {
        created_at: string;
        learner_email: string | null;
      })[]
    >([]),
    [report, setReport] = useState<{
      simulated_orders: number;
      simulated_enrollments: number;
      pending_operations: number;
      audit: {
        actor: string;
        action: string;
        created_at: string;
      }[];
    }>(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState(initial);
  async function refresh() {
    const [c, r, p] = await Promise.all([
      api<Offering[]>("staff/offerings", { role: "staff" }),
      api<
        (Learning & {
          created_at: string;
          learner_email: string | null;
        })[]
      >("approval-requests", { role: "staff" }),
      api<typeof report>("reconciliation", { role: "staff" }),
    ]);
    setCourses(c);
    setRequests(r);
    setReport(p);
  }
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
      {message && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="scrollable"
        sx={{ mt: 3, mb: 3, borderBottom: "1px solid #dde2e7" }}
        aria-label="Staff workspace"
      >
        <Tab label="Offerings" />
        <Tab label={`Approvals (${requests.length})`} />
        <Tab label="Activity" />
      </Tabs>
      {tab === 0 && (
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
          <TableContainer component={Paper} variant="outlined">
            <Table aria-label="Course offerings">
              <TableHead>
                <TableRow>
                  {[
                    "Offering",
                    "Schedule",
                    "Price",
                    "Seats",
                    "Status",
                    "Action",
                  ].map((label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
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
                          onClick={() =>
                            action(
                              `offerings/${c.id}/publish`,
                              { version: c.version },
                              "Sample offering published. Real Canvas mapping checks are deferred.",
                            )
                          }
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
        </>
      )}
      {tab === 1 && (
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
            <TableContainer component={Paper} variant="outlined">
              <Table aria-label="Approval requests">
                <TableHead>
                  <TableRow>
                    <TableCell>Learner</TableCell>
                    <TableCell>Offering</TableCell>
                    <TableCell>Requested</TableCell>
                    <TableCell>Decision</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.map((r) => (
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
                            onClick={() =>
                              action(
                                `approval-requests/${r.id}/decision`,
                                { decision: "approved" },
                                "Request approved. The learner can now reserve a seat.",
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            disabled={busy}
                            color="error"
                            onClick={() =>
                              action(
                                `approval-requests/${r.id}/decision`,
                                { decision: "declined" },
                                "Request declined.",
                              )
                            }
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
          )}
        </>
      )}
      {tab === 2 && (
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
          <TableContainer component={Paper} variant="outlined">
            <Table aria-label="Audit activity">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Event</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report?.audit.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{entry.actor}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
