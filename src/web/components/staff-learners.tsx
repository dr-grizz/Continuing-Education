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
  DialogTitle,
  Divider,
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
import { api, money } from "./api";
import { auditLabels } from "./audit-labels";
import {
  SortableHeader,
  SortSelect,
  TablePager,
  useTableView,
} from "./table-view";

type LearnerRow = {
  id: string;
  email: string | null;
  created_at: string;
  active: boolean;
  version: number;
  registrations: number;
  enrolled: number;
  in_progress: number;
  last_activity: string | null;
};
type LearnerDetail = {
  id: string;
  email: string | null;
  created_at: string;
  active: boolean;
  deactivated_at: string | null;
  version: number;
  legacy: boolean;
  registrations: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    quoted_price_cents: number | null;
    price_cents: number;
    paid_cents: number | null;
    operation_status: string | null;
  }[];
  activity: {
    actor: string;
    action: string;
    created_at: string;
    offering_title: string | null;
    details: { reason?: string };
  }[];
};
// Same wording learners see in My learning.
const statusLabels: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  approval_expired: "Approval expired",
  refunded: "Refunded, access ended",
  declined: "Declined",
  reserved: "Seat reserved",
  provisioning: "Preparing access",
  enrolled: "Enrolled",
  expired: "Reservation expired",
  exception: "Support review needed",
};
const wideOnly = { display: { xs: "none", md: "block" } };
const phoneOnly = { display: { xs: "block", md: "none" } };
const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "—";
const learnerName = (row: { email: string | null }) =>
  row.email ?? "Legacy sample learner";
const accessChip = (active: boolean) => (
  <Chip
    label={active ? "Active" : "Deactivated"}
    color={active ? "success" : "warning"}
    variant="outlined"
  />
);

export function StaffLearners({
  canManage,
  onChanged,
}: {
  canManage: boolean;
  onChanged: (message: string) => void;
}) {
  const [rows, setRows] = useState<LearnerRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string>();
  const load = () =>
    api<LearnerRow[]>("staff/learners", { role: "staff" })
      .then((data) => {
        setRows(data);
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  useEffect(() => {
    load();
  }, []);
  const view = useTableView(rows, {
    compare: {
      email: (a, b) => learnerName(a).localeCompare(learnerName(b)),
      joined: (a, b) => a.created_at.localeCompare(b.created_at),
      registrations: (a, b) => a.registrations - b.registrations,
      activity: (a, b) =>
        (a.last_activity ?? "").localeCompare(b.last_activity ?? ""),
    },
    initial: { key: "joined", direction: "desc" },
    matches: (row) =>
      learnerName(row).toLowerCase().includes(query.trim().toLowerCase()),
  });
  const viewButton = (row: LearnerRow) => (
    <Button
      onClick={() => setOpenId(row.id)}
      aria-label={`View learner ${learnerName(row)}`}
    >
      View
    </Button>
  );
  const counts = (row: LearnerRow) =>
    `${row.registrations} registrations · ${row.enrolled} enrolled · ${row.in_progress} in progress`;
  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Learners
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2, mb: 2 }}>
        <TextField
          label="Search learners"
          placeholder="Email address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flex: 1 }}
        />
        <SortSelect
          view={view}
          options={{
            "joined:desc": "Newest first",
            "email:asc": "Email A–Z",
            "registrations:desc": "Most registrations",
            "activity:desc": "Recently active",
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
        {view.count} of {view.total} learners
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {loaded && !rows.length && !error && (
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography>No learners yet.</Typography>
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
                {learnerName(row)}
              </Typography>
              {accessChip(row.active)}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {counts(row)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Joined {day(row.created_at)} · Last activity{" "}
              {day(row.last_activity)}
            </Typography>
            <Box sx={{ mt: 1 }}>{viewButton(row)}</Box>
          </Paper>
        ))}
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
        <Table aria-label="Learners">
          <TableHead>
            <TableRow>
              <SortableHeader view={view} column="email" label="Learner" />
              <SortableHeader
                view={view}
                column="registrations"
                label="Registrations"
              />
              <TableCell>Status</TableCell>
              <SortableHeader view={view} column="joined" label="Joined" />
              <SortableHeader
                view={view}
                column="activity"
                label="Last activity"
              />
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {view.visible.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ overflowWrap: "anywhere" }}>
                  {learnerName(row)}
                </TableCell>
                <TableCell>
                  {row.registrations}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block" }}
                  >
                    {row.enrolled} enrolled · {row.in_progress} in progress
                  </Typography>
                </TableCell>
                <TableCell>{accessChip(row.active)}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {day(row.created_at)}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {day(row.last_activity)}
                </TableCell>
                <TableCell>{viewButton(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePager view={view} label="Learners" />
      <LearnerDialog
        id={openId}
        canManage={canManage}
        onClose={() => setOpenId(undefined)}
        onChanged={async (text) => {
          await load();
          onChanged(text);
        }}
      />
    </>
  );
}

function LearnerDialog({
  id,
  canManage,
  onClose,
  onChanged,
}: {
  id?: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [learner, setLearner] = useState<LearnerDetail>();
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);
  const failure = useRef<HTMLDivElement | null>(null);
  const load = (learnerId: string) =>
    api<LearnerDetail>(`staff/learners/${learnerId}`, { role: "staff" })
      .then(setLearner)
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    setLearner(undefined);
    setError("");
    setReason("");
    setReasonError("");
    if (id) load(id);
  }, [id]);
  useEffect(() => {
    if (error && learner) failure.current?.focus();
  }, [error, learner]);
  async function changeAccess() {
    if (!learner || busy) return;
    if (reason.trim().length < 10) {
      setReasonError("Explain why in 10 to 500 characters.");
      document.getElementById("learner-access-reason")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const active = !learner.active;
      await api(`staff/learners/${learner.id}/access`, {
        role: "staff",
        body: { version: learner.version, active, reason: reason.trim() },
      });
      setReason("");
      await load(learner.id);
      await onChanged(
        `${learnerName(learner)} ${active ? "reactivated" : "deactivated"}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={Boolean(id)}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Learner details</DialogTitle>
      <DialogContent>
        {!learner && !error && <Typography>Loading learner…</Typography>}
        {!learner && error && <Alert severity="error">{error}</Alert>}
        {learner && (
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ justifyContent: "space-between", gap: 1 }}
            >
              <Box>
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {learnerName(learner)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Joined {day(learner.created_at)}
                  {learner.deactivated_at
                    ? ` · Deactivated ${day(learner.deactivated_at)}`
                    : ""}
                </Typography>
              </Box>
              <Box>{accessChip(learner.active)}</Box>
            </Stack>
            <Box component="section" aria-labelledby="learner-registrations">
              <Typography
                id="learner-registrations"
                variant="subtitle1"
                component="h4"
              >
                Registrations ({learner.registrations.length})
              </Typography>
              {learner.registrations.length ? (
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {learner.registrations.map((r) => (
                    <Typography component="li" variant="body2" key={r.id}>
                      <strong>{r.title}</strong>:{" "}
                      {statusLabels[r.status] ?? r.status}
                      {r.paid_cents != null
                        ? ` · paid ${money(r.paid_cents)}`
                        : r.quoted_price_cents != null
                          ? ` · quoted ${money(r.quoted_price_cents)}`
                          : ""}{" "}
                      · since {day(r.created_at)}
                    </Typography>
                  ))}
                </ul>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No registrations.
                </Typography>
              )}
            </Box>
            <Box component="section" aria-labelledby="learner-activity">
              <Typography
                id="learner-activity"
                variant="subtitle1"
                component="h4"
              >
                Recent activity
              </Typography>
              {learner.activity.length ? (
                <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {learner.activity.map((event, index) => (
                    <Typography component="li" variant="body2" key={index}>
                      {auditLabels[event.action] ?? event.action}
                      {event.offering_title ? ` · ${event.offering_title}` : ""}
                      {event.details?.reason
                        ? ` — “${event.details.reason}”`
                        : ""}{" "}
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                      >
                        · {new Date(event.created_at).toLocaleString()}
                      </Typography>
                    </Typography>
                  ))}
                </ol>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No activity recorded.
                </Typography>
              )}
            </Box>
            <Divider />
            <Box component="section" aria-labelledby="learner-access">
              <Typography
                id="learner-access"
                variant="subtitle1"
                component="h4"
              >
                Account access
              </Typography>
              {learner.legacy ? (
                <Typography variant="body2" color="text.secondary">
                  The legacy sample learner stays active because direct API
                  demos rely on it.
                </Typography>
              ) : !canManage ? (
                <Typography variant="body2" color="text.secondary">
                  Changing account access requires the Support role.
                </Typography>
              ) : (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    {learner.active
                      ? "Deactivating stops this learner from signing in or acting. Existing paid enrollments continue."
                      : "Reactivating lets this learner sign in again."}
                  </Typography>
                  <TextField
                    id="learner-access-reason"
                    label="Reason"
                    required
                    multiline
                    minRows={2}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (reasonError) setReasonError("");
                    }}
                    error={Boolean(reasonError)}
                    helperText={
                      reasonError ||
                      "At least 10 characters. Recorded in the audit log."
                    }
                  />
                  {error && (
                    <Alert severity="error" ref={failure} tabIndex={-1}>
                      {error}
                    </Alert>
                  )}
                  <Box>
                    <Button
                      variant="contained"
                      color={learner.active ? "error" : "primary"}
                      onClick={changeAccess}
                      aria-disabled={busy}
                    >
                      {busy
                        ? "Saving…"
                        : learner.active
                          ? "Deactivate learner"
                          : "Reactivate learner"}
                    </Button>
                  </Box>
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
