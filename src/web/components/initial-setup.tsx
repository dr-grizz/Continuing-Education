"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

type SetupStatus = {
  origin?: string;
  authenticated: boolean;
  owner?: string;
  email?: string;
  expiresAt?: string;
  settings?: Record<string, { value?: string; configured?: boolean }>;
  canvasBaseUrl?: string;
  canvasRedirectUri?: string;
  handoff?: {
    linked: boolean;
    verified: boolean;
    name?: string;
    email?: string;
    canvasUserId?: string;
  };
  database?: {
    connected: boolean;
    appliedMigrations: number;
    failedMigrations: number;
  };
};
async function setupResponse(response: Response) {
  try {
    const data = JSON.parse(await response.text());
    if (!data || typeof data !== "object") throw new Error();
    return data;
  } catch {
    throw new Error(
      `Setup returned an empty or invalid response (HTTP ${response.status}). Check application startup, then try again.`,
    );
  }
}
export default function InitialSetup() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState("");
  const [diagnosticsAvailable, setDiagnosticsAvailable] = useState(false);
  const [notice, setNotice] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [canvasUserId, setCanvasUserId] = useState("");
  const [staffHours, setStaffHours] = useState("8");
  const [learnerHours, setLearnerHours] = useState("8");
  const [forceLogin, setForceLogin] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      const data = await setupResponse(response);
      if (typeof data.diagnosticsAuthorized === "boolean")
        setDiagnosticsAvailable(data.diagnosticsAuthorized);
      if (response.status === 401) {
        setSecret("");
        setSetupKey("");
        setStatus({ authenticated: false });
        setUnavailable(false);
        setNotice("Your setup session expired. Enter the setup key again.");
        return;
      }
      if (!response.ok) {
        setSecret("");
        setSetupKey("");
        setStatus(response.status === 503 ? { authenticated: false } : null);
        setUnavailable(response.status !== 503);
        throw new Error(data.message || "Setup is unavailable.");
      }
      setUnavailable(false);
      setStatus(data);
      if (data.authenticated) {
        setClientId(data.settings.CANVAS_STAFF_CLIENT_ID.value || "");
        setStaffHours(data.settings.STAFF_SESSION_HOURS.value || "8");
        setLearnerHours(data.settings.LEARNER_SESSION_HOURS.value || "8");
        setForceLogin(data.settings.CANVAS_STAFF_FORCE_LOGIN.value === "true");
      } else setSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    if (new URLSearchParams(window.location.search).has("error"))
      setNotice(
        "Canvas sign-in could not be verified. Check your Canvas account and callback URL, then try again.",
      );
  }, []);
  async function action(action: string, settings?: Record<string, string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "start" ? { key: setupKey } : {}),
          ...(action === "link-canvas" ? { contactEmail } : {}),
          ...(action === "add-admin"
            ? {
                administrator: {
                  name: adminName,
                  email: adminEmail,
                  canvasUserId,
                },
              }
            : {}),
          ...(settings ? { settings } : {}),
        }),
      });
      const data = await setupResponse(response);
      if (typeof data.diagnosticsAuthorized === "boolean")
        setDiagnosticsAvailable(data.diagnosticsAuthorized);
      if (!response.ok)
        throw new Error(data.message || "The setup operation failed.");
      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }
      if (action === "start") {
        await refresh();
        setNotice("Setup key verified. Temporary setup access is active.");
      } else if (action === "complete") {
        setClosed(true);
        setDiagnosticsAvailable(false);
        setStatus(null);
        setSecret("");
        setNotice(
          "Setup is closed. Temporary sessions and privileges have been removed.",
        );
      } else if (action === "logout") {
        setDiagnosticsAvailable(false);
        setStatus({ authenticated: false });
        setSecret("");
      } else {
        setSecret("");
        await refresh();
        setNotice(
          action === "add-admin"
            ? "Administrator added. They must sign in through Canvas before you can finish setup."
            : "Application settings saved privately. Allow a few seconds for the API to refresh them.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The setup operation failed.");
    } finally {
      setSetupKey("");
      setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void action("save", {
      CANVAS_STAFF_CLIENT_ID: clientId,
      CANVAS_STAFF_CLIENT_SECRET: secret,
      STAFF_SESSION_HOURS: staffHours,
      LEARNER_SESSION_HOURS: learnerHours,
      CANVAS_STAFF_FORCE_LOGIN: String(forceLogin),
    });
  }
  return (
    <Stack
      spacing={3}
      sx={{ maxWidth: 800, mx: "auto", py: 3, px: { xs: 1, sm: 2 } }}
    >
      <Typography variant="overline" component="p">
        Beta environment
      </Typography>
      <Typography variant="h3" component="h1">
        Initial setup
      </Typography>
      <Typography>
        Use the private setup key configured by your Azure administrator.
        Microsoft and Canvas sign-in are not required to initialize settings.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {diagnosticsAvailable && (
        <Alert severity="info">
          Your setup key is verified. For read-only diagnostics, type{" "}
          <code>/system-info</code> in the address bar. This access lasts up to
          ten minutes and does not authorize setup changes.
        </Alert>
      )}
      {notice && (
        <Alert severity={closed ? "success" : "info"} role="status">
          {notice}
        </Alert>
      )}
      {!status && !error && !closed && (
        <Typography role="status">Preparing setup sign-in…</Typography>
      )}
      {unavailable && (
        <Typography>
          Setup is disabled, completed, expired, or not configured. Ask the
          Azure administrator to review setup activation.
        </Typography>
      )}
      {!closed && !unavailable && status && (
        <Paper
          component="section"
          aria-labelledby="setup-key-heading"
          sx={{ p: 3 }}
        >
          <Box
            component="form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void action("start");
            }}
          >
            <Stack spacing={2}>
              <Typography variant="h5" component="h2" id="setup-key-heading">
                {status.authenticated
                  ? "Verify setup key again"
                  : "Unlock initial setup"}
              </Typography>
              <TextField
                label="Setup key"
                type="password"
                value={setupKey}
                onChange={(event) => setSetupKey(event.target.value)}
                required
                autoComplete="off"
                slotProps={{ htmlInput: { maxLength: 64, spellCheck: false } }}
                helperText="Enter the 64-character hexadecimal BOOTSTRAP_KEY configured privately in Azure."
              />
              <Button
                type="submit"
                variant="contained"
                disabled={busy || !setupKey}
              >
                {status.authenticated
                  ? "Verify setup key again"
                  : "Unlock setup"}
              </Button>
            </Stack>
          </Box>
        </Paper>
      )}
      {status?.authenticated && (
        <>
          <Paper
            component="section"
            aria-labelledby="setup-access"
            sx={{ p: 3 }}
          >
            <Stack spacing={2}>
              <Typography variant="h5" component="h2" id="setup-access">
                Temporary administrator
              </Typography>
              <Typography>{status.owner}</Typography>
              <Typography>App: {status.origin}</Typography>
              <Typography>
                Access expires{" "}
                <time dateTime={status.expiresAt}>
                  {new Date(status.expiresAt!).toLocaleString()}
                </time>
                .
              </Typography>
              <Typography>
                Database connected · {status.database?.appliedMigrations}{" "}
                completed migrations · {status.database?.failedMigrations}{" "}
                unresolved failures.
              </Typography>
              <Button onClick={() => void action("logout")} disabled={busy}>
                Sign out of setup
              </Button>
            </Stack>
          </Paper>
          <Paper
            component="section"
            aria-labelledby="canvas-settings"
            sx={{ p: 3 }}
          >
            <Box component="form" onSubmit={save}>
              <Stack spacing={2}>
                <Typography variant="h5" component="h2" id="canvas-settings">
                  Canvas application settings
                </Typography>
                <Typography>
                  Canvas installation: {status.canvasBaseUrl}
                </Typography>
                <TextField
                  label="Canvas client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  autoComplete="off"
                />
                <TextField
                  label="Canvas client secret"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  autoComplete="new-password"
                  helperText={
                    status.settings?.CANVAS_STAFF_CLIENT_SECRET.configured
                      ? "A secret is configured. Leave blank to keep it."
                      : "Enter the private client secret."
                  }
                />
                <TextField
                  label="Staff session hours"
                  type="number"
                  value={staffHours}
                  onChange={(e) => setStaffHours(e.target.value)}
                  slotProps={{ htmlInput: { min: 1, max: 24 } }}
                  required
                />
                <TextField
                  label="Learner session hours"
                  type="number"
                  value={learnerHours}
                  onChange={(e) => setLearnerHours(e.target.value)}
                  slotProps={{ htmlInput: { min: 1, max: 24 } }}
                  required
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={forceLogin}
                      onChange={(e) => setForceLogin(e.target.checked)}
                    />
                  }
                  label="Ask staff to sign in again at Canvas"
                />
                <Button type="submit" variant="contained" disabled={busy}>
                  Save application settings
                </Button>
                <Typography variant="body2">
                  Secrets are encrypted on the server and are never returned by
                  this page. These settings do not change Azure or GitHub
                  credentials.
                </Typography>
              </Stack>
            </Box>
          </Paper>
          <Paper
            component="section"
            aria-labelledby="setup-handoff"
            sx={{ p: 3 }}
          >
            <Stack spacing={2}>
              <Typography variant="h5" component="h2" id="setup-handoff">
                Add an administrator
              </Typography>
              <Typography>
                Add a permanent staff administrator using their Canvas user ID.
                This can be done before Canvas sign-in is configured. Contact
                email is not an authentication credential; access requires
                signing in through Canvas as the account with that ID.
              </Typography>
              <Box
                component="form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void action("add-admin");
                }}
              >
                <Stack spacing={2}>
                  <TextField
                    label="Administrator name"
                    value={adminName}
                    onChange={(event) => setAdminName(event.target.value)}
                    autoComplete="name"
                    required
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                  />
                  <TextField
                    label="New administrator email"
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                  <TextField
                    label="Canvas user ID"
                    value={canvasUserId}
                    onChange={(event) => setCanvasUserId(event.target.value)}
                    required
                    slotProps={{
                      htmlInput: {
                        inputMode: "numeric",
                        pattern: "[1-9][0-9]{0,18}",
                        maxLength: 19,
                      },
                    }}
                    helperText="Use the numeric user ID from the correct Canvas installation, not an email or login name. Verify the ID before granting access."
                  />
                  <Typography variant="body2">
                    Canvas installation: {status.canvasBaseUrl}
                  </Typography>
                  <Button type="submit" variant="contained" disabled={busy}>
                    Add administrator
                  </Button>
                </Stack>
              </Box>
              <Typography variant="h6" component="h3">
                Or add yourself through Canvas sign-in
              </Typography>
              <Typography>
                The Canvas developer key must allow the callback URL below. An
                authorized Canvas administrator can add it while retaining
                existing callbacks.
              </Typography>
              <TextField
                label="Normal staff callback URL"
                value={status.canvasRedirectUri}
                slotProps={{ input: { readOnly: true } }}
                fullWidth
              />
              <Typography>
                Enter a contact email, then continue with Canvas to verify the
                identity that will receive permanent administrator access. The
                email is contact information and does not authenticate a user.
              </Typography>
              <TextField
                label="Administrator contact email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                autoComplete="email"
                required
              />
              <Button
                variant="outlined"
                onClick={() => void action("link-canvas")}
                disabled={busy || !contactEmail}
              >
                Verify and link my Canvas administrator
              </Button>
              {status.handoff?.linked && (
                <Alert severity={status.handoff.verified ? "success" : "info"}>
                  {status.handoff.email} is linked to Canvas user{" "}
                  {status.handoff.canvasUserId}.{" "}
                  {status.handoff.verified
                    ? "Normal administrator sign-in has been verified."
                    : "Open normal staff sign-in in another tab, complete sign-in, and refresh the checks here."}
                </Alert>
              )}
              <Button
                component="a"
                href="/staff"
                target="_blank"
                rel="noopener"
              >
                Open normal staff sign-in
              </Button>
              <Button onClick={() => void refresh()} disabled={busy}>
                Refresh setup checks
              </Button>
            </Stack>
          </Paper>
          <Paper
            component="section"
            aria-labelledby="setup-completion"
            sx={{ p: 3 }}
          >
            <Stack spacing={2}>
              <Typography variant="h5" component="h2" id="setup-completion">
                Finish and close setup
              </Typography>
              <Typography>
                Completion permanently closes this setup window and revokes
                every temporary setup session. Application settings and the
                audit record are retained. Reopening requires an out-of-band
                administrator operation.
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                }
                label="I verified normal administrator access and am ready to remove temporary setup access"
              />
              <Button
                variant="contained"
                onClick={() => void action("complete")}
                disabled={busy || !confirmed || !status.handoff?.verified}
              >
                Finish setup and remove temporary access
              </Button>
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}
