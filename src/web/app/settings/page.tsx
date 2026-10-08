"use client";
import { useEffect } from "react";
import { Button, Paper, Stack, Typography } from "@mui/material";
import { useDemoAuth } from "../../components/demo-auth";
import { ThemeChoice } from "../../components/theme-choice";

// Personal settings for anyone using the portal. Appearance needs no sign-in;
// the account section shows the demo session.
export default function Settings() {
  const auth = useDemoAuth();
  useEffect(() => {
    document.title = "Settings | Continuing Education";
  }, []);
  return (
    <>
      <Typography
        variant="h3"
        component="h1"
        sx={{ fontSize: { xs: 30, md: 40 } }}
      >
        Settings
      </Typography>
      <Stack spacing={3} sx={{ mt: 3, maxWidth: 640 }}>
        <Paper
          variant="outlined"
          component="section"
          aria-labelledby="settings-appearance"
          sx={{ p: 3 }}
        >
          <Typography variant="h5" component="h2" id="settings-appearance">
            Appearance
          </Typography>
          <Stack sx={{ mt: 2 }}>
            <ThemeChoice />
          </Stack>
        </Paper>
        <Paper
          variant="outlined"
          component="section"
          aria-labelledby="settings-account"
          sx={{ p: 3 }}
        >
          <Typography variant="h5" component="h2" id="settings-account">
            Account
          </Typography>
          {!auth.ready ? null : auth.email ? (
            <Typography sx={{ mt: 1.5, overflowWrap: "anywhere" }}>
              Signed in to the demo as <strong>{auth.email}</strong>. Demo
              sign-in has no password or profile to change.
            </Typography>
          ) : (
            <>
              <Typography sx={{ mt: 1.5 }}>
                You are not signed in. Appearance settings work without signing
                in.
              </Typography>
              <Button variant="outlined" href="/sign-in" sx={{ mt: 2 }}>
                Sign in
              </Button>
            </>
          )}
        </Paper>
      </Stack>
    </>
  );
}
