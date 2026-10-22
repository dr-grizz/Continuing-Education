"use client";
import { Suspense } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useDemoAuth } from "../../components/demo-auth";
import { CredentialTools } from "../../components/credential-tools";
import { LoadingCards } from "../../components/loading";
export default function MyBadges() {
  const auth = useDemoAuth();
  if (!auth.ready) return <LoadingCards label="Loading credentials" />;
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        My badges and certificates
      </Typography>
      {!auth.signedIn ? (
        <Alert
          severity="info"
          action={<Button href="/sign-in">Sign in</Button>}
        >
          Sign in to view your earned badges and download certificates.
        </Alert>
      ) : (
        <Suspense fallback={<LoadingCards label="Loading credentials" />}>
          <CredentialTools tool="my-badges" />
        </Suspense>
      )}
    </Stack>
  );
}
