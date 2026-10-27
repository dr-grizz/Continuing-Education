"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useDemoAuth } from "../../components/demo-auth";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const auth = useDemoAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnTo, setReturnTo] = useState("/learning");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(params.get("returnTo") || "/learning");
    const errors: Record<string, string> = {
      configuration:
        "CU sign-in is not configured. Contact the portal administrator.",
      unavailable: "Unable to complete CU sign-in. Try again.",
      rate_limited:
        "Too many sign-ins for this Canvas account. Wait a minute, then select Sign in with Canvas again.",
      unauthorized:
        "This learner account is deactivated. Contact the program office.",
      invalid: "Sign-in expired or could not be verified. Try again.",
      denied: "CU sign-in was cancelled or denied. You can try again.",
    };
    const code = params.get("authError");
    if (code) setError(errors[code] || errors.invalid);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await auth.signIn(email);
      // The mock password is never sent to a server or saved.
      setPassword("");
      const requested = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      // Signed-in learners land on My learning unless a known page asked for
      // sign-in (a course or a collection/pathway); other values are ignored.
      const destination =
        requested === "/learning" ||
        /^\/courses\/[0-9a-f-]{36}$/.test(requested || "") ||
        /^\/collections\/[a-z0-9]+(-[a-z0-9]+)*$/.test(requested || "")
          ? requested!
          : "/learning";
      router.push(destination);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Sign-in failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (auth.mode !== "mock")
    return (
      <Box sx={{ maxWidth: 480, mx: "auto" }}>
        <Typography component="h1" variant="h4">
          Sign in
        </Typography>
        <Typography sx={{ mt: 1, mb: 3 }} color="text.secondary">
          Use your existing CU account to register for courses and view My
          learning.
        </Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={3}>
            {error && <Alert severity="error">{error}</Alert>}
            {auth.ready && !auth.configured && (
              <Alert severity="warning">
                CU sign-in is currently unavailable. Contact the portal
                administrator.
              </Alert>
            )}
            {auth.signedIn ? (
              <>
                <Typography>Signed in as {auth.displayName}.</Typography>
                <Button href="/learning" variant="contained">
                  Go to My learning
                </Button>
              </>
            ) : (
              <>
                <Typography>
                  Sign in through Canvas using your CU account. Staff can use
                  the same account as learners; administrator access is
                  separate.
                </Typography>
                <Button
                  href={`/api/auth/learner/canvas/start?returnTo=${encodeURIComponent(returnTo)}`}
                  variant="contained"
                  disabled={!auth.ready || !auth.configured}
                >
                  Sign in with CU account
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Guest registration without an existing CU account is planned
                  for a future release.
                </Typography>
              </>
            )}
            <Button href="/">Back to courses</Button>
          </Stack>
        </Paper>
      </Box>
    );
  return (
    <Box sx={{ maxWidth: 480, mx: "auto" }}>
      <Typography component="h1" variant="h4">
        Sign in
      </Typography>
      <Typography sx={{ mt: 1, mb: 3 }} color="text.secondary">
        Try the learner experience.
      </Typography>
      <Alert severity="info" role="note" sx={{ mb: 3 }}>
        Demo sign-in: use any email and any password. Each email has its own
        saved course registrations.
      </Alert>
      <Paper variant="outlined" sx={{ p: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack component="form" onSubmit={submit} spacing={3}>
          <TextField
            required
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
          />
          <TextField
            required
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            helperText="Any password works. It is not saved or sent to a server."
          />
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Button href="/">Back to courses</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
