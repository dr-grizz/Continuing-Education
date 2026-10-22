"use client";
import { use, useEffect, useState } from "react";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
type PublicBadge = {
  title: string;
  description: string;
  criteria: string;
  issuer: string;
  issuedAt: string;
  status: string;
  signatureValid: boolean;
  artwork?: string;
  demo: boolean;
};
export default function Verify({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = use(params);
  const [badge, setBadge] = useState<PublicBadge | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/badges/public/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "This badge is private, unavailable, or its verification link has been disabled.",
          );
        return r.json();
      })
      .then(setBadge)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [source, id]);
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        Verify a badge
      </Typography>
      {error ? (
        <Alert severity="warning">{error}</Alert>
      ) : !badge ? (
        <Typography role="status">Checking the credential…</Typography>
      ) : (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography component="h2" variant="h5">
              {badge.title}
            </Typography>
            <Alert
              severity={
                badge.status === "revoked"
                  ? "error"
                  : badge.signatureValid
                    ? "success"
                    : "error"
              }
            >
              {badge.status === "revoked"
                ? "This award has been revoked."
                : badge.signatureValid
                  ? "Credential signature verified."
                  : "Credential verification failed."}
            </Alert>
            {badge.artwork && badge.signatureValid && (
              <Box
                component="img"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(badge.artwork)}`}
                alt={`${badge.title} badge artwork`}
                sx={{ width: 180, maxWidth: "100%" }}
              />
            )}
            <Typography>{badge.description}</Typography>
            <Typography>{badge.criteria}</Typography>
            <Typography>
              Issued by {badge.issuer} ·{" "}
              {new Date(badge.issuedAt).toLocaleDateString("en-US")}
            </Typography>
            <Typography variant="body2">
              {badge.demo ? "Fictional demonstration award. " : ""}CU pilot
              credential format; not a certified Open Badges credential.
            </Typography>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
