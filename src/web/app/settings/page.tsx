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
          {!auth.ready ? null : auth.signedIn ? (
            <Typography sx={{ mt: 1.5, overflowWrap: "anywhere" }}>
              Signed in as <strong>{auth.displayName}</strong>.{" "}
              {auth.mode === "canvas"
                ? "Your CU account is linked through Canvas. Manage your password through your CU account."
                : "This is a mock learner session."}
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
