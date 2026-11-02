"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
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
import { api, type Offering } from "./api";
import type {
  ProgressCatalog,
  ProgressParticipant,
  ProgressReport,
  ProgressState,
  ProgressStep,
} from "../../domain/progress-types";
export const progressLabels: Record<ProgressState, string> = {
  awaiting_verification: "Awaiting verification",
  not_started: "Not started (verified)",
  in_progress: "In progress",
  completed: "Completed",
};
const time = (v: string | null) =>
  v ? new Date(v).toLocaleString() : "No verification yet";
function Meter({ participant: p }: { participant: ProgressParticipant }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2">
        {p.completed} of {p.required} required steps · {p.percent}%
      </Typography>
      <LinearProgress
        variant="determinate"
        value={p.percent}
        aria-label={`${p.name}: required steps verified complete`}
        aria-valuetext={`${p.completed} of ${p.required} required steps verified complete`}
      />
      <Typography variant="caption">{progressLabels[p.state]}</Typography>
    </Stack>
  );
}
function Steps({
  participant: p,
  onRecord,
}: {
  participant: ProgressParticipant;
  onRecord?: (s: ProgressStep) => void;
}) {
  return (
    <Stack spacing={2}>
      {p.steps.map((s) => (
        <Paper variant="outlined" key={s.id} sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography component="h3" variant="subtitle1">
              {s.title} {!s.required && "(Optional)"}
            </Typography>
            <Typography>{progressLabels[s.state]}</Typography>
            <Typography variant="caption">
              {s.source ? "Staff verification · " : ""}
              {time(s.recordedAt)}
            </Typography>
            {s.note && (
              <Typography sx={{ overflowWrap: "anywhere" }}>
                {s.note}
              </Typography>
            )}
            {s.reference && (
              <Typography sx={{ overflowWrap: "anywhere" }} variant="body2">
                Evidence reference: {s.reference}
              </Typography>
            )}
            {onRecord && (
              <Button
                variant="outlined"
                onClick={() => onRecord(s)}
                aria-label={`Record evidence for ${s.title}`}
              >
                Record evidence
              </Button>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
export function IndividualProgress() {
  const [rows, setRows] = useState<
      { plan: ProgressReport["plan"]; progress: ProgressParticipant }[]
    >([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api("me/progress"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Paper
      component="section"
      aria-labelledby="my-progress-heading"
      variant="outlined"
      sx={{ p: 3, my: 3 }}
    >
      <Stack spacing={2}>
        <Typography id="my-progress-heading" component="h2" variant="h5">
          Completion progress
        </Typography>
        <Typography color="text.secondary">
          Progress reflects documented staff verification, separate from
          registration and payment; Canvas completion is not synchronized
          automatically.
        </Typography>
        <Button onClick={() => void load()} disabled={loading}>
          Refresh completion progress
        </Button>
        {loading && (
          <CircularProgress
            size={24}
            aria-label="Loading completion progress"
          />
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && !rows.length && (
          <Typography>
            No completion requirements have been assigned to you yet.
          </Typography>
        )}
        {!loading &&
          !error &&
          rows.map((r) => (
            <Paper key={r.plan.id} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography component="h3" variant="h6">
                  {r.plan.title} · Requirements v{r.plan.revision}
                </Typography>
                <Meter participant={{ ...r.progress, name: r.plan.title }} />
                <Steps participant={r.progress} />
              </Stack>
            </Paper>
          ))}
      </Stack>
    </Paper>
  );
}
export function StaffProgress({
  offerings,
  canManage,
}: {
  offerings: Pick<Offering, "id" | "title">[];
  canManage: boolean;
}) {
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const participantHeading = useRef<HTMLHeadingElement>(null);
  const participantTrigger = useRef<HTMLButtonElement | null>(null);
  function restoreReportFocus() {
    if (participantTrigger.current?.isConnected)
      participantTrigger.current.focus();
    else reportHeading.current?.focus();
  }
  const [catalog, setCatalog] = useState<ProgressCatalog>({
      plans: [],
      cohorts: [],
      learners: [],
    }),
    [selection, setSelection] = useState(""),
    [report, setReport] = useState<ProgressReport>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [planOpen, setPlanOpen] = useState(false),
    [offeringId, setOfferingId] = useState(""),
    [stepLines, setStepLines] = useState("");
  const [cohortOpen, setCohortOpen] = useState(false),
    [cohortName, setCohortName] = useState(""),
    [cohortPlan, setCohortPlan] = useState("");
  const [learner, setLearner] = useState(""),
    [participant, setParticipant] = useState<ProgressParticipant>(),
    [evidence, setEvidence] = useState<ProgressStep>(),
    [state, setState] = useState<ProgressState>("in_progress"),
    [note, setNote] = useState(""),
    [reference, setReference] = useState("");
  const [history, setHistory] = useState<
      {
        id: string;
        title: string;
        state: ProgressState;
        note: string;
        reference: string;
        recorded_at: string;
        recorded_by: string;
      }[]
    >([]),
    [historyError, setHistoryError] = useState("");
  const command = useRef<{ body: string; key: string }>({ body: "", key: "" });
  const loadCatalog = useCallback(async () => {
    const next = await api<ProgressCatalog>("staff/progress", {
      role: "staff",
    });
    setCatalog(next);
    return next;
  }, []);
  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((next) => {
        if (alive)
          setSelection(
            (v) => v || (next.plans[0] ? `plan:${next.plans[0].id}` : ""),
          );
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadCatalog]);
  const loadReport = useCallback(async (value: string) => {
    if (!value) return;
    const [kind, id] = value.split(":");
    const next = await api<ProgressReport>(
      `staff/progress/${kind === "cohort" ? "cohorts" : "plans"}/${id}/report`,
      { role: "staff" },
    );
    setReport(next);
  }, []);
  useEffect(() => {
    let alive = true;
    setReport(undefined);
    if (!selection) return;
    setLoading(true);
    const [kind, id] = selection.split(":");
    api<ProgressReport>(
      `staff/progress/${kind === "cohort" ? "cohorts" : "plans"}/${id}/report`,
      { role: "staff" },
    )
      .then((r) => {
        if (alive) {
          setReport(r);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selection]);
  useEffect(() => {
    if (!participant) return;
    let alive = true;
    setHistory([]);
    setHistoryError("");
    api<typeof history>(
      `staff/progress/participants/${participant.id}/history`,
      { role: "staff" },
    )
      .then((v) => {
        if (alive) setHistory(v);
      })
      .catch((e) => {
        if (alive) setHistoryError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [participant]);
  async function write(path: string, body: unknown) {
    const payload = JSON.stringify({ path, body });
    if (command.current.body !== payload)
      command.current = { body: payload, key: crypto.randomUUID() };
    return api<any>(path, { role: "staff", body, key: command.current.key });
  }
  async function act(work: () => Promise<void | string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await work();
      await loadCatalog();
      if (next) setSelection(next);
      else await loadReport(selection);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function showParticipant(p: ProgressParticipant) {
    setParticipant(p);
  }
  function record(s: ProgressStep) {
    setEvidence(s);
    setState(s.state === "awaiting_verification" ? "in_progress" : s.state);
    setNote("");
    setReference(s.reference);
  }
  const latest = catalog.plans
    .filter((p) => p.offering_id === offeringId)
    .reduce((max, p) => Math.max(max, p.revision), 0);
  return (
    <Stack spacing={3}>
      <Alert severity="info" role="note">
        Completion is based on documented staff verification. Enrollment,
        payment and pathway follows do not count as academic completion;
        recording completion does not issue badges or change course access.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {canManage && (
          <>
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => {
                setOfferingId(
                  report?.plan.offeringId || offerings[0]?.id || "",
                );
                setStepLines("");
                setPlanOpen(true);
              }}
            >
              Define requirements
            </Button>
            <Button
              variant="outlined"
              disabled={busy || !catalog.plans.length}
              onClick={() => {
                setCohortPlan(report?.plan.id || catalog.plans[0]?.id || "");
                setCohortName("");
                setCohortOpen(true);
              }}
            >
              Create cohort
            </Button>
          </>
        )}
        <Button
          disabled={busy || loading}
          onClick={() =>
            void act(async () => {
              await loadCatalog();
            })
          }
        >
          Refresh progress reports
        </Button>
      </Stack>
      {!canManage && (
        <Typography>
          You can view reports; a course manager or staff administrator records
          evidence and manages cohorts.
        </Typography>
      )}
      <TextField
        select
        label="Progress report"
        value={selection}
        onChange={(e) => {
          setSelection(e.target.value);
          setLearner("");
        }}
        disabled={busy || !catalog.plans.length}
      >
        <MenuItem value="">Choose a report</MenuItem>
        {catalog.plans.map((p) => (
          <MenuItem key={p.id} value={`plan:${p.id}`}>
            {p.title} · Requirements v{p.revision} · All assigned learners
          </MenuItem>
        ))}
        {catalog.cohorts.map((c) => (
          <MenuItem key={c.id} value={`cohort:${c.id}`}>
            {c.name} · {c.title} v{c.revision}
          </MenuItem>
        ))}
      </TextField>
      {loading && <CircularProgress aria-label="Loading progress report" />}
      {!loading && !catalog.plans.length && !error && (
        <Typography>
          No completion requirements yet. Define the required steps for a course
          to begin tracking.
        </Typography>
      )}
      {report && (
        <>
          <Typography
            variant="h6"
            component="h2"
            tabIndex={-1}
            ref={reportHeading}
          >
            {report.cohort?.name || report.plan.title} · Requirements v
            {report.plan.revision}
          </Typography>
          <Typography>
            {report.summary.learners} learners · {report.summary.completed}{" "}
            completed · {report.summary.inProgress} in progress ·{" "}
            {report.summary.awaitingVerification} awaiting verification ·{" "}
            {report.summary.notStarted} verified not started
          </Typography>
          <Typography variant="body2">
            Each learner keeps their assigned requirements version; a new
            revision does not change previous assignments. Progress is completed
            required steps divided by required steps; optional steps do not
            affect the percentage.
          </Typography>
          {canManage && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Learner to assign"
                value={learner}
                onChange={(e) => setLearner(e.target.value)}
                sx={{ minWidth: { sm: 300 } }}
              >
                <MenuItem value="">Choose learner</MenuItem>
                {catalog.learners.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.display_name || l.email || l.id}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                disabled={!learner || busy}
                onClick={() =>
                  void act(async () => {
                    await write(
                      report.cohort
                        ? `staff/progress/cohorts/${report.cohort.id}/members`
                        : `staff/progress/plans/${report.plan.id}/participants`,
                      {
                        learnerId: learner,
                        ...(report.cohort ? { active: true } : {}),
                      },
                    );
                    setLearner("");
                    setNotice(
                      "Learner assigned; no completion has been inferred.",
                    );
                  })
                }
              >
                {report.cohort ? "Add to cohort" : "Assign requirements"}
              </Button>
            </Stack>
          )}
          {!report.participants.length && (
            <Typography>No learners assigned to this report yet.</Typography>
          )}
          {!!report.participants.length && (
            <TableContainer
              component={Paper}
              variant="outlined"
              tabIndex={0}
              role="region"
              aria-label="Scrollable completion matrix"
            >
              <Table aria-label="Individual completion and cohort matrix">
                <TableHead>
                  <TableRow>
                    <TableCell>Learner</TableCell>
                    <TableCell>Progress</TableCell>
                    {report.steps.map((s) => (
                      <TableCell key={s.id}>
                        {s.title}
                        {!s.required && " (Optional)"}
                      </TableCell>
                    ))}
                    {canManage && report.cohort && (
                      <TableCell>Membership</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell component="th" scope="row">
                        <Button
                          aria-label={`View progress for ${p.name}`}
                          onClick={(event) => {
                            participantTrigger.current = event.currentTarget;
                            showParticipant(p);
                          }}
                        >
                          {p.name}
                        </Button>
                        {!p.active && (
                          <Chip size="small" label="Inactive learner" />
                        )}
                      </TableCell>
                      <TableCell sx={{ minWidth: 180 }}>
                        <Meter participant={p} />
                      </TableCell>
                      {p.steps.map((s) => (
                        <TableCell key={s.id}>
                          <Typography variant="body2">
                            {progressLabels[s.state]}
                          </Typography>
                          <Typography variant="caption">
                            {time(s.recordedAt)}
                          </Typography>
                        </TableCell>
                      ))}
                      {canManage && report.cohort && (
                        <TableCell>
                          <Button
                            disabled={busy}
                            aria-label={`Remove ${p.name} from cohort`}
                            onClick={() =>
                              void act(async () => {
                                await write(
                                  `staff/progress/cohorts/${report.cohort!.id}/members`,
                                  { learnerId: p.learnerId, active: false },
                                );
                                setNotice(
                                  "Membership removed; individual evidence is retained.",
                                );
                              })
                            }
                          >
                            Remove
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
      <Dialog
        open={planOpen}
        onClose={() => {
          if (!busy) setPlanOpen(false);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="progress-plan-title"
      >
        <DialogTitle id="progress-plan-title">
          Define completion requirements
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography>
              Create a checklist of what a learner must do to complete this
              course. You can assign the checklist to individual learners or use
              it for everyone in a cohort.
            </Typography>
            <TextField
              select
              label="Course"
              value={offeringId}
              onChange={(e) => setOfferingId(e.target.value)}
              helperText="Choose the course whose completion you want to track."
            >
              {offerings.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.title}
                </MenuItem>
              ))}
            </TextField>
            <Typography component="h3" variant="subtitle1">
              What must the learner complete?
            </Typography>
            <Typography variant="body2">
              Enter one requirement per line. Describe an action you can verify,
              and include any passing score or approval standard. Every line is
              required for the learner to reach 100% completion.
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography component="h4" variant="subtitle2">
                Example checklist
              </Typography>
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-line", mt: 1 }}
              >
                {
                  "Complete all required course modules\nScore at least 80% on the final assessment\nReceive approval for the final project"
                }
              </Typography>
              <Typography variant="caption" component="p" sx={{ mt: 1 }}>
                Example only: enter your own course requirements below. Staff
                verify these steps; entering a score here does not set up an
                automatic Canvas check.
              </Typography>
            </Paper>
            <TextField
              label="Required steps (one per line)"
              multiline
              minRows={4}
              value={stepLines}
              onChange={(e) => setStepLines(e.target.value)}
              placeholder="For example: Submit the final project and receive instructor approval"
              helperText="Enter 1–50 different requirements, one per line; up to 160 characters per requirement."
            />
            <Typography component="h3" variant="subtitle1">
              What happens after I create the checklist?
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 3 }}>
              <Typography component="li" variant="body2">
                Assign it to a learner, or create a cohort and add its learners.
              </Typography>
              <Typography component="li" variant="body2">
                Open a learner&apos;s progress and record evidence for each
                step.
              </Typography>
              <Typography component="li" variant="body2">
                Individual and cohort reports show completion as staff verify
                the required steps.
              </Typography>
            </Box>
            {latest > 0 && (
              <Alert severity="info" role="note">
                This course already has checklist version {latest}. Saving
                creates version {latest + 1} for new assignments; learners
                already assigned a checklist keep their existing requirements.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setPlanOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !offeringId || !stepLines.trim()}
            onClick={() =>
              void act(async () => {
                const row = await write("staff/progress/plans", {
                  offeringId,
                  previousRevision: latest,
                  steps: stepLines
                    .split("\n")
                    .filter((t) => t.trim())
                    .map((title) => ({ title: title.trim(), required: true })),
                });
                setPlanOpen(false);
                setNotice(
                  "Checklist created. Assign learners or create a cohort to start tracking.",
                );
                return `plan:${row.id}`;
              })
            }
          >
            {latest > 0 ? "Create revised checklist" : "Create checklist"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={cohortOpen}
        onClose={() => {
          if (!busy) setCohortOpen(false);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="progress-cohort-title"
      >
        <DialogTitle id="progress-cohort-title">
          Create learner cohort
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Cohort name"
              value={cohortName}
              onChange={(e) => setCohortName(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              select
              label="Requirements version"
              value={cohortPlan}
              onChange={(e) => setCohortPlan(e.target.value)}
            >
              {catalog.plans.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.title} v{p.revision}
                </MenuItem>
              ))}
            </TextField>
            <Typography>
              Members share a requirements version; their individual evidence
              remains separate.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setCohortOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !cohortName.trim() || !cohortPlan}
            onClick={() =>
              void act(async () => {
                const row = await write("staff/progress/cohorts", {
                  name: cohortName.trim(),
                  planId: cohortPlan,
                });
                setCohortOpen(false);
                setNotice("Cohort created.");
                return `cohort:${row.id}`;
              })
            }
          >
            Create cohort
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        disableRestoreFocus
        slotProps={{
          transition: {
            onExited: () => {
              if (!participant && !evidence) restoreReportFocus();
            },
          },
        }}
        open={Boolean(participant) && !evidence}
        onClose={() => setParticipant(undefined)}
        fullWidth
        maxWidth="md"
        aria-labelledby="individual-progress-title"
      >
        <DialogTitle
          id="individual-progress-title"
          tabIndex={-1}
          ref={participantHeading}
        >
          {participant?.name}: completion progress
        </DialogTitle>
        <DialogContent>
          {participant && (
            <Stack spacing={2}>
              <Meter participant={participant} />
              <Steps
                participant={participant}
                onRecord={canManage && participant.active ? record : undefined}
              />
              <Typography component="h3" variant="h6">
                Evidence and correction history
              </Typography>
              {historyError && <Alert severity="error">{historyError}</Alert>}
              {history.map((h) => (
                <Box key={h.id}>
                  <Typography>
                    {h.title}: {progressLabels[h.state]}
                  </Typography>
                  <Typography variant="caption">
                    {time(h.recorded_at)} · Staff verification
                  </Typography>
                  <Typography sx={{ overflowWrap: "anywhere" }}>
                    {h.note}
                  </Typography>
                </Box>
              ))}
              {!history.length && !historyError && (
                <Typography>No recorded evidence.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setParticipant(undefined)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        slotProps={{
          transition: {
            onExited: () => {
              if (participant) participantHeading.current?.focus();
              else restoreReportFocus();
            },
          },
        }}
        disableRestoreFocus
        open={Boolean(evidence)}
        onClose={() => {
          if (!busy) setEvidence(undefined);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="progress-evidence-title"
      >
        <DialogTitle id="progress-evidence-title">
          Record evidence: {evidence?.title}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography>
              This records your verification and retains any previous evidence
              as history. Notes and references are visible to the learner.
            </Typography>
            <TextField
              select
              label="Verified status"
              value={state}
              onChange={(e) => setState(e.target.value as ProgressState)}
            >
              {(
                ["not_started", "in_progress", "completed"] as ProgressState[]
              ).map((s) => (
                <MenuItem key={s} value={s}>
                  {progressLabels[s]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Evidence or correction note"
              multiline
              minRows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              helperText="10–1,000 characters; describe what you verified"
            />
            <TextField
              label="Evidence reference (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEvidence(undefined)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || note.trim().length < 10}
            onClick={() =>
              void act(async () => {
                await write(
                  `staff/progress/participants/${participant!.id}/evidence`,
                  {
                    stepId: evidence!.id,
                    state,
                    note: note.trim(),
                    reference,
                    previousEventId: evidence!.eventId,
                  },
                );
                setEvidence(undefined);
                setParticipant(undefined);
                setNotice(
                  "Evidence recorded; individual and cohort reports updated.",
                );
              })
            }
          >
            Record verification
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
