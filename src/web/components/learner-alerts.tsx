"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "./api";
import {
  AlertDashboard,
  AlertKind,
  AlertRule,
  LearnerAlert,
  alertKinds,
  alertLabels,
} from "../../domain/learner-alerts";
function request<T>(path: string, body?: unknown) {
  return api<T>(path, { role: "staff", body });
}
const explanations: Record<AlertKind, string> = {
  stalled_verification:
    "Alert when incomplete required steps have no staff verification update for the chosen number of days. This does not measure student activity.",
  completion:
    "Alert when all required steps are verified complete within the chosen lookback window. Corrections remain part of the evidence history.",
  credential_expiration:
    "Alert for a signed badge or certificate expiring within the chosen number of days. Only explicit active learner account links are used; dates remain independent.",
  canvas_inactivity:
    "Alert when Canvas records no course activity for the chosen number of days. Requires a mapped offering, enrolled learner identities, and fresh authorized Canvas data.",
  canvas_performance:
    "Alert when the current Canvas course score is below your threshold. Missing or inaccessible grades are unavailable data, never a zero score.",
};
const when = (v: string | null) =>
  v ? new Date(v).toLocaleString() : "Not checked yet";
const empty = () => ({
  name: "",
  kind: "stalled_verification" as AlertKind,
  offeringId: null as string | null,
  cohortId: null as string | null,
  learnerId: null as string | null,
  days: 14,
  threshold: 70,
  enabled: true,
  version: 0,
});
export function LearnerAlerts({
  canManage,
  canCredentials,
  canCanvas,
}: {
  canManage: boolean;
  canCredentials: boolean;
  canCanvas: boolean;
}) {
  const ruleNameInput = useRef<HTMLInputElement>(null);
  const actionNoteInput = useRef<HTMLTextAreaElement>(null);
  const [data, setData] = useState<AlertDashboard | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false),
    [editing, setEditing] = useState<AlertRule | null>(null),
    [form, setForm] = useState(empty());
  const [filter, setFilter] = useState("active"),
    [kind, setKind] = useState("all"),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LearnerAlert | null>(null),
    [action, setAction] = useState("acknowledge"),
    [note, setNote] = useState(""),
    [snooze, setSnooze] = useState(7),
    [history, setHistory] = useState<any[] | null>(null),
    [historyAlert, setHistoryAlert] = useState<LearnerAlert | null>(null);
  async function load() {
    setData(null);
    const next = await request<AlertDashboard>("staff/alerts");
    setData(next);
    return next;
  }
  useEffect(() => {
    let active = true;
    request<AlertDashboard>("staff/alerts")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function openRule(r: AlertRule | null = null) {
    setEditing(r);
    setForm(
      r
        ? {
            name: r.name,
            kind: r.kind,
            offeringId: r.offering_id,
            cohortId: r.cohort_id,
            learnerId: r.learner_id,
            days: r.days,
            threshold: r.threshold,
            enabled: r.enabled,
            version: r.version,
          }
        : empty(),
    );
    setError("");
    setRuleOpen(true);
  }
  const sourceKinds = alertKinds.filter(
    (k) =>
      (k !== "credential_expiration" || canCredentials) &&
      (!k.startsWith("canvas_") || canCanvas),
  );
  const shown =
    data?.alerts.filter(
      (a) =>
        (filter === "all" || filter === "active"
          ? filter === "all" || a.state !== "resolved"
          : a.state === filter) &&
        (kind === "all" || a.kind === kind) &&
        [a.learner_name, a.title, a.rule_name]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          gap: 1,
          justifyContent: "space-between",
          alignItems: { sm: "center" },
        }}
      >
        <Box>
          <Typography component="h2" variant="h5">
            Learner alerts
          </Typography>
          <Typography color="text.secondary">
            Review verification gaps, achievement milestones, and learner
            support signals.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await load();
                setMessage("Alerts refreshed.");
              })
            }
          >
            Refresh alerts
          </Button>
          {canManage && (
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => openRule()}
            >
              Create alert rule
            </Button>
          )}
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" role="status">
          {message}
        </Alert>
      )}
      {!data ? (
        <Typography role="status">
          {error
            ? "Alert data could not be loaded. Use Refresh alerts to retry."
            : "Loading alert rules and history…"}
        </Typography>
      ) : (
        <>
          {data.canvasSession && (
            <Paper
              component="section"
              aria-label="Canvas login and alert access"
              variant="outlined"
              sx={{ p: 2 }}
            >
              <Stack spacing={1}>
                <Typography component="h3" variant="h6">
                  Alerts for your login
                </Typography>
                <Typography variant="body2">
                  {data.canvasSession.staffName} ·{" "}
                  {data.canvasSession.mode === "canvas"
                    ? "University SSO through Canvas"
                    : "Local preview login"}
                </Typography>
                <Alert
                  severity={data.canvasSession.connected ? "success" : "info"}
                >
                  {data.canvasSession.message}
                </Alert>
                <Typography variant="body2">
                  Canvas rules, activity, grades, counts, and history are
                  restricted to the staff account that authorized them. Local
                  verification, completion, and credential alerts use your
                  portal role permissions.
                </Typography>
                {data.canvasSession.mode === "canvas" &&
                  data.canvasSession.status === "reconnect" &&
                  canCanvas && (
                    <Button
                      href="/api/auth/canvas/start"
                      variant="outlined"
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Sign in again through Canvas
                    </Button>
                  )}
                {canCanvas && (
                  <Button href="/staff/canvas" sx={{ alignSelf: "flex-start" }}>
                    Review my Canvas connection
                  </Button>
                )}
              </Stack>
            </Paper>
          )}
          {data.lastWorkerError && (
            <Alert severity="warning">{data.lastWorkerError}</Alert>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" },
              gap: 2,
            }}
          >
            {[
              ["Open", data.counts.open || 0],
              ["Acknowledged", data.counts.acknowledged || 0],
              ["Snoozed", data.counts.snoozed || 0],
              ["Resolved", data.counts.resolved || 0],
            ].map(([label, count]) => (
              <Paper variant="outlined" sx={{ p: 2 }} key={label}>
                <Typography variant="body2">{label}</Typography>
                <Typography variant="h4" component="p">
                  {count}
                </Typography>
              </Paper>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            Dashboard notifications only ·{" "}
            {data.workerEnabled === false
              ? "Scheduled checks paused; use Refresh alerts"
              : "Local checks every minute while the portal server runs · Canvas checks hourly when enabled"}{" "}
            · Refreshed {when(data.checkedAt)}
          </Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography component="h3" variant="h6">
                Alert rules
              </Typography>
              {!data.rules.length ? (
                <Typography>
                  No rules yet. Create a rule to select its learners, condition,
                  and threshold.
                </Typography>
              ) : (
                data.rules.map((r) => (
                  <Paper key={r.id} variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Stack
                        direction="row"
                        sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}
                      >
                        <Typography component="h4" variant="subtitle1">
                          {r.name}
                        </Typography>
                        <Chip
                          size="small"
                          label={r.enabled ? "Enabled" : "Paused"}
                        />
                        <Chip size="small" label={alertLabels[r.kind]} />
                      </Stack>
                      <Typography variant="body2">
                        {r.offering_id
                          ? data.options.offerings.find(
                              (o) => o.id === r.offering_id,
                            )?.title + " · "
                          : ""}
                        {r.cohort_id
                          ? "Cohort: " +
                            data.options.cohorts.find(
                              (c) => c.id === r.cohort_id,
                            )?.name +
                            " · "
                          : ""}
                        {r.learner_id
                          ? data.options.learners.find(
                              (l) => l.id === r.learner_id,
                            )?.name || "Inactive learner"
                          : "All eligible learners in scope"}{" "}
                        ·{" "}
                        {r.kind === "canvas_performance"
                          ? `Below ${r.threshold}%`
                          : `${r.days} days`}
                      </Typography>
                      <Typography variant="caption">
                        Last evaluation: {when(r.evaluated_at)}
                        {r.kind.startsWith("canvas_")
                          ? " · Last successful Canvas read: " +
                            when(r.sync_succeeded_at)
                          : ""}
                      </Typography>
                      {(r.evaluation_error ||
                        r.sync_error ||
                        r.source_warning) && (
                        <Alert severity="warning">
                          {r.evaluation_error ||
                            r.sync_error ||
                            r.source_warning}
                        </Alert>
                      )}
                      {r.kind.startsWith("canvas_") && !data.canvasEnabled && (
                        <Alert severity="info">
                          Canvas activity access is not enabled. This rule will
                          show data unavailable until an administrator
                          configures the required read permission.
                        </Alert>
                      )}
                      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                        {canManage && (
                          <Button
                            size="small"
                            disabled={busy}
                            onClick={() => openRule(r)}
                            aria-label={`Edit rule ${r.name}`}
                          >
                            Edit rule
                          </Button>
                        )}
                        {canManage &&
                          canCanvas &&
                          r.enabled &&
                          r.kind.startsWith("canvas_") && (
                            <Button
                              size="small"
                              disabled={busy || !data.canvasSession?.canSync}
                              onClick={() =>
                                run(async () => {
                                  await request(
                                    `staff/alerts/rules/${r.id}/sync`,
                                    { version: r.version },
                                  );
                                  await load();
                                  setMessage(
                                    "Canvas check finished. Review the rule’s source status.",
                                  );
                                })
                              }
                              aria-label={`Sync Canvas for ${r.name}`}
                            >
                              Sync Canvas now
                            </Button>
                          )}
                      </Stack>
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>
          </Paper>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
            <TextField
              label="Search alerts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label="Alert status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <MenuItem value="active">Active alerts</MenuItem>
              {["all", "open", "acknowledged", "snoozed", "resolved"].map(
                (x) => (
                  <MenuItem key={x} value={x}>
                    {x[0].toUpperCase() + x.slice(1)}
                  </MenuItem>
                ),
              )}
            </TextField>
            <TextField
              select
              label="Alert type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <MenuItem value="all">All types</MenuItem>
              {sourceKinds.map((k) => (
                <MenuItem value={k} key={k}>
                  {alertLabels[k]}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Typography role="status" variant="body2">
            {shown.length} matching alerts
            {data.limited
              ? " · Showing the latest 500 records; narrow the rules or review recent history."
              : ""}
          </Typography>
          {!shown.length ? (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography>No alerts match these filters.</Typography>
              <Typography variant="body2" color="text.secondary">
                A quiet dashboard is only meaningful when its rules are enabled
                and their source data is available.
              </Typography>
            </Paper>
          ) : (
            shown.map((a) => (
              <Paper key={a.id} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Stack
                    direction="row"
                    sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}
                  >
                    <Typography component="h3" variant="h6">
                      {a.title}
                    </Typography>
                    <Chip size="small" label={a.state} />
                    {a.source_unavailable && a.state !== "resolved" && (
                      <Chip
                        color="warning"
                        variant="outlined"
                        sx={{
                          color: "text.primary",
                          bgcolor: "background.paper",
                        }}
                        label="Data unavailable"
                        size="small"
                      />
                    )}
                  </Stack>
                  <Typography sx={{ fontWeight: 600 }}>
                    {a.learner_name}
                  </Typography>
                  <Typography>{a.message}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Rule: {a.rule_name} · Source:{" "}
                    {a.evidence.source === "staff_verification"
                      ? "Staff verification"
                      : a.evidence.source === "signed_credential"
                        ? "Signed credential"
                        : "Canvas course data"}{" "}
                    · Observed {when(a.observed_at)}
                    {a.snoozed_until
                      ? " · Snoozed until " + when(a.snoozed_until)
                      : ""}
                  </Typography>
                  <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                    {canManage && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          setSelected(a);
                          setAction(
                            a.state === "resolved" ? "reopen" : "acknowledge",
                          );
                          setNote("");
                        }}
                        aria-label={`Manage alert for ${a.learner_name}: ${a.title}`}
                      >
                        Manage alert
                      </Button>
                    )}
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const h = await request<any[]>(
                            `staff/alerts/${a.id}/history`,
                          );
                          setHistory(h);
                          setHistoryAlert(a);
                        })
                      }
                      aria-label={`History for ${a.learner_name}: ${a.title}`}
                    >
                      History
                    </Button>
                    {a.evidence.source === "staff_verification" && (
                      <Button href="/staff/progress">View progress</Button>
                    )}
                    {a.evidence.source === "signed_credential" &&
                      canCredentials && (
                        <Button href="/staff/badge-issuances">
                          View credential records
                        </Button>
                      )}
                  </Stack>
                </Stack>
              </Paper>
            ))
          )}
        </>
      )}
      <Dialog
        open={ruleOpen}
        slotProps={{
          transition: { onEntered: () => ruleNameInput.current?.focus() },
        }}
        onClose={() => {
          if (!busy) setRuleOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editing ? "Edit alert rule" : "Create alert rule"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              autoFocus
              required
              inputRef={ruleNameInput}
              label="Rule name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              select
              label="Condition"
              disabled={!!editing}
              value={form.kind}
              onChange={(e) => {
                const k = e.target.value as AlertKind;
                setForm({
                  ...form,
                  kind: k,
                  offeringId:
                    k === "credential_expiration" ? null : form.offeringId,
                  days:
                    k === "completion" || k === "credential_expiration"
                      ? 30
                      : 14,
                });
              }}
            >
              {sourceKinds.map((k) => (
                <MenuItem key={k} value={k}>
                  {alertLabels[k]}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="body2">{explanations[form.kind]}</Typography>
            <TextField
              select
              label="Offering"
              disabled={form.kind === "credential_expiration"}
              value={form.offeringId || ""}
              helperText={
                form.kind === "credential_expiration"
                  ? "Use a cohort or learner for credentials; an offering does not imply a badge association."
                  : "Optional for portal rules; required for Canvas unless selected by cohort."
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  offeringId: e.target.value || null,
                  cohortId: null,
                })
              }
            >
              <MenuItem value="">All offerings</MenuItem>
              {data?.options.offerings.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.title}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Cohort"
              value={form.cohortId || ""}
              onChange={(e) => {
                const c = data?.options.cohorts.find(
                  (x) => x.id === e.target.value,
                );
                setForm({
                  ...form,
                  cohortId: c?.id || null,
                  offeringId:
                    form.kind === "credential_expiration"
                      ? null
                      : c?.offering_id || form.offeringId,
                });
              }}
            >
              <MenuItem value="">All cohorts</MenuItem>
              {data?.options.cohorts
                .filter(
                  (c) => !form.offeringId || c.offering_id === form.offeringId,
                )
                .map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              select
              label="Learner"
              value={form.learnerId || ""}
              onChange={(e) =>
                setForm({ ...form, learnerId: e.target.value || null })
              }
            >
              <MenuItem value="">All learners in scope</MenuItem>
              {data?.options.learners.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
            {form.kind === "canvas_performance" ? (
              <TextField
                required
                type="number"
                label="Score below (%)"
                value={form.threshold}
                onChange={(e) =>
                  setForm({ ...form, threshold: Number(e.target.value) })
                }
                slotProps={{ htmlInput: { min: 0, max: 100 } }}
              />
            ) : (
              <TextField
                required
                type="number"
                label={
                  form.kind === "completion"
                    ? "Completed within past (days)"
                    : form.kind === "credential_expiration"
                      ? "Expires within (days)"
                      : "No update for (days)"
                }
                value={form.days}
                onChange={(e) =>
                  setForm({ ...form, days: Number(e.target.value) })
                }
                slotProps={{ htmlInput: { min: 1, max: 365 } }}
              />
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                />
              }
              label="Rule enabled"
            />
            {editing && (
              <Alert severity="info">
                Saving creates a new rule revision and resolves alerts from the
                previous revision; its history remains available.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setRuleOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !form.name.trim()}
            onClick={() =>
              run(async () => {
                await request(
                  editing
                    ? `staff/alerts/rules/${editing.id}`
                    : "staff/alerts/rules",
                  form,
                );
                await load();
                setRuleOpen(false);
                setMessage(
                  "Alert rule saved. Matching conditions have been checked.",
                );
              })
            }
          >
            Save alert rule
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!selected}
        slotProps={{
          transition: { onEntered: () => actionNoteInput.current?.focus() },
        }}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Manage alert</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography>
              {selected?.learner_name} · {selected?.title}
            </Typography>
            <TextField
              select
              label="Action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {["acknowledge", "snooze", "resolve", "reopen"].map((x) => (
                <MenuItem key={x} value={x}>
                  {x[0].toUpperCase() + x.slice(1)}
                </MenuItem>
              ))}
            </TextField>
            {action === "snooze" && (
              <TextField
                type="number"
                label="Snooze for (days)"
                value={snooze}
                slotProps={{ htmlInput: { min: 1, max: 30 } }}
                onChange={(e) => setSnooze(Number(e.target.value))}
              />
            )}
            <TextField
              autoFocus
              required
              multiline
              minRows={2}
              inputRef={actionNoteInput}
              label="Action note"
              helperText="Record the staff follow-up or reason; 3–500 characters."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const next = await load();
                const fresh = next.alerts.find((a) => a.id === selected!.id);
                if (!fresh)
                  throw new Error(
                    "This alert is outside the current queue. Close this dialog and review its history.",
                  );
                setSelected(fresh);
                setMessage("Alert refreshed; your note was kept.");
              })
            }
          >
            Refresh alert
          </Button>
          <Button disabled={busy} onClick={() => setSelected(null)}>
            Cancel
          </Button>
          <Button
            disabled={busy || note.trim().length < 3}
            onClick={() =>
              run(async () => {
                await request(`staff/alerts/${selected!.id}/action`, {
                  action,
                  days: snooze,
                  note,
                  version: selected!.version,
                });
                await load();
                setSelected(null);
                setMessage("Alert action recorded.");
              })
            }
          >
            Record action
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!historyAlert}
        onClose={() => setHistoryAlert(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Alert history</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              {historyAlert?.learner_name} · {historyAlert?.title}
            </Typography>
            {history?.map((e, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>{e.action}</Typography>
                <Typography>{e.note}</Typography>
                <Typography variant="caption">
                  {when(e.at)} · {e.actor}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryAlert(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
