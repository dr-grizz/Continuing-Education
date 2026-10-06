"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { api } from "./api";
import { actorLabels, auditLabels, stageLabels } from "./audit-labels";
import {
  SortableHeader,
  SortSelect,
  TablePager,
  useTableView,
} from "./table-view";

export type ExceptionRow = {
  id: string;
  title: string;
  learner_email: string | null;
  stage: string;
  error: string | null;
  attempts: number;
  failed_at: string;
  history: {
    actor: string;
    action: string;
    details: { reason?: string; attempt?: number };
    created_at: string;
  }[];
};
export const outcomes: Record<string, string> = {
  normal: "Normal — succeeds",
  delayed: "Delayed — about 20 seconds longer",
  transient: "Temporary failure — recovers on automatic retry",
  identity_failure: "Identity failure — needs staff review",
  canvas_failure: "Canvas enrollment failure — needs staff review",
};
const wideOnly = { display: { xs: "none", sm: "block" } };
const phoneOnly = { display: { xs: "block", sm: "none" } };
const when = (value: string) => new Date(value).toLocaleString();
const learnerLabel = (row: ExceptionRow) =>
  row.learner_email || "Legacy demo learner";

export function StaffExceptions({
  rows,
  outcome,
  onChanged,
}: {
  rows: ExceptionRow[];
  outcome: string;
  onChanged: (message: string) => Promise<void>;
}) {
  const [reviewing, setReviewing] = useState<ExceptionRow>(),
    [reason, setReason] = useState(""),
    [reasonError, setReasonError] = useState(""),
    [dialogError, setDialogError] = useState(""),
    [busy, setBusy] = useState(false),
    [settingError, setSettingError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const queueHeading = useRef<HTMLHeadingElement | null>(null);
  const view = useTableView(rows, {
    compare: {
      failed: (a, b) => a.failed_at.localeCompare(b.failed_at),
      learner: (a, b) => learnerLabel(a).localeCompare(learnerLabel(b)),
      title: (a, b) => a.title.localeCompare(b.title),
    },
    initial: { key: "failed", direction: "asc" },
  });
  // Close the dialog if another staff action already recovered this registration.
  useEffect(() => {
    if (reviewing && !rows.some((row) => row.id === reviewing.id))
      setReviewing(undefined);
  }, [rows, reviewing]);

  async function changeOutcome(value: string) {
    setSettingError("");
    try {
      await api("prototype/simulation", {
        role: "staff",
        body: { provisioningOutcome: value },
      });
      await onChanged(
        `New payments will use: ${outcomes[value].split(" — ")[0]}.`,
      );
    } catch (e) {
      setSettingError((e as Error).message);
    }
  }
  function review(row: ExceptionRow, button: HTMLElement) {
    opener.current = button;
    setReason("");
    setReasonError("");
    setDialogError("");
    setReviewing(row);
  }
  async function recover(action: "retry" | "resolve") {
    if (!reviewing || busy) return;
    if (reason.trim().length < 10) {
      setReasonError("Enter a reason of at least 10 characters.");
      return;
    }
    setBusy(true);
    setDialogError("");
    try {
      await api(`exceptions/${reviewing.id}/${action}`, {
        role: "staff",
        body: { reason: reason.trim() },
      });
      setReviewing(undefined);
      await onChanged(
        action === "retry"
          ? `Provisioning queued again for ${learnerLabel(reviewing)}.`
          : `Manual enrollment recorded for ${learnerLabel(reviewing)}.`,
      );
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const reviewButton = (row: ExceptionRow) => (
    <Button
      variant="outlined"
      onClick={(event) => review(row, event.currentTarget)}
      aria-label={`Review exception for ${learnerLabel(row)}, ${row.title}`}
    >
      Review
    </Button>
  );

  return (
    <>
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" component="h3">
          Provisioning simulation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Prototype only. Chooses what happens to payments made after the
          change; registrations already in progress keep their outcome. Failed
          steps retry automatically up to three times before reaching this
          queue.
        </Typography>
        <TextField
          select
          label="Outcome for new payments"
          value={outcome}
          onChange={(e) => changeOutcome(e.target.value)}
          sx={{ mt: 2, minWidth: { sm: 380 } }}
          fullWidth
        >
          {Object.entries(outcomes).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        {settingError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {settingError}
          </Alert>
        )}
      </Paper>
      <Typography
        variant="h6"
        component="h2"
        sx={{ mb: 1, "&:focus": { outline: "none" } }}
        ref={queueHeading}
        tabIndex={-1}
      >
        Needs staff review
      </Typography>
      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography>No registrations need recovery.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            To try the workflow, choose a failure outcome above, then simulate a
            payment in My learning.
          </Typography>
        </Paper>
      ) : (
        <>
          <Stack direction="row" sx={{ mb: 2 }}>
            <SortSelect
              view={view}
              options={{
                "failed:asc": "Oldest first",
                "failed:desc": "Newest first",
                "learner:asc": "Learner A–Z",
                "title:asc": "Course A–Z",
              }}
            />
          </Stack>
          <Stack spacing={1.5} sx={phoneOnly}>
            {view.visible.map((row) => (
              <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" component="h3">
                  {row.title}
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {learnerLabel(row)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {stageLabels[row.stage] ?? row.stage} failed · {row.attempts}{" "}
                  attempts · {when(row.failed_at)}
                </Typography>
                <Box sx={{ mt: 1.5 }}>{reviewButton(row)}</Box>
              </Paper>
            ))}
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
            <Table aria-label="Registrations needing staff review">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    view={view}
                    column="learner"
                    label="Learner"
                  />
                  <SortableHeader view={view} column="title" label="Course" />
                  <TableCell>Failed step</TableCell>
                  <SortableHeader view={view} column="failed" label="Failed" />
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {view.visible.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {learnerLabel(row)}
                    </TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>
                      {stageLabels[row.stage] ?? row.stage}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                      >
                        {row.attempts} attempts
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {when(row.failed_at)}
                    </TableCell>
                    <TableCell>{reviewButton(row)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePager view={view} label="Exceptions" />
        </>
      )}
      <Dialog
        open={Boolean(reviewing)}
        onClose={() => !busy && setReviewing(undefined)}
        // Return focus to the Review button that opened the dialog.
        slotProps={{
          transition: {
            // A recovered row leaves the queue, so fall back to the heading.
            onExited: () =>
              opener.current?.isConnected
                ? opener.current.focus()
                : queueHeading.current?.focus(),
          },
        }}
        fullWidth
        maxWidth="sm"
      >
        {reviewing && (
          <>
            <DialogTitle>Review exception</DialogTitle>
            <DialogContent>
              <Stack spacing={1.5}>
                <Typography>
                  <strong>{reviewing.title}</strong> for{" "}
                  {learnerLabel(reviewing)}
                </Typography>
                <Alert severity="warning" role="note">
                  {stageLabels[reviewing.stage] ?? reviewing.stage} failed after{" "}
                  {reviewing.attempts} attempts. {reviewing.error}
                </Alert>
                <Typography variant="subtitle2" component="h3">
                  History
                </Typography>
                <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                  {reviewing.history.map((event, index) => (
                    <Typography
                      component="li"
                      variant="body2"
                      key={index}
                      sx={{ mb: 0.5 }}
                    >
                      {auditLabels[event.action] ?? event.action}
                      {event.details?.reason &&
                      !event.action.startsWith("prototype.")
                        ? ` — “${event.details.reason}”`
                        : ""}
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                      >
                        {" "}
                        · {actorLabels[event.actor] ?? "Learner"} ·{" "}
                        {when(event.created_at)}
                      </Typography>
                    </Typography>
                  ))}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Retry after the cause is fixed. Record a manual enrollment
                  only after Canvas Administration confirms access was granted
                  outside the portal.
                </Typography>
                <TextField
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
                {dialogError && <Alert severity="error">{dialogError}</Alert>}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
              <Button onClick={() => setReviewing(undefined)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="outlined"
                onClick={() => recover("resolve")}
                aria-disabled={busy}
              >
                Record manual enrollment
              </Button>
              <Button
                variant="contained"
                onClick={() => recover("retry")}
                aria-disabled={busy}
              >
                Retry provisioning
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}
