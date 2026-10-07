"use client";

import { useState } from "react";
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
