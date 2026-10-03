"use client";
import { useDemoAuth } from "../../components/demo-auth";
import { LoadingCards } from "../../components/loading";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Link,
  Paper,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import {
  api,
  date,
  courseSchedule,
  Learning,
  money,
} from "../../components/api";
const labels: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  approved: "Approved — ready to register",
  declined: "Request declined",
  reserved: "Seat reserved",
  provisioning: "Preparing access",
  enrolled: "Demo enrollment ready",
  expired: "Reservation expired",
  exception: "Support review needed",
};
export default function LearningPage() {
  const auth = useDemoAuth();
  const [rows, setRows] = useState<Learning[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [actionError, setActionError] = useState<{ id: string; message: string }>(),
    [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      setRows(await api<Learning[]>("me/learning"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  async function act(row: Learning) {
    setBusy(row.id);
    setActionError(undefined);
    try {
      if (row.status === "reserved") {
        await api(`prototype/registrations/${row.id}/simulate-payment`, {
          body: {},
        });
        setNotice(`Payment simulated for ${row.title}. Preparing access.`);
      } else {
        await api("registrations", { body: { offeringId: row.offering_id } });
        setNotice(`Seat reserved for ${row.title}.`);
      }
      await refresh();
    } catch (e) {
      // Show the failure beside its course; polling clears the page-level error.
      setActionError({ id: row.id, message: (e as Error).message });
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Typography variant="h4" component="h1">
        My learning
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        Demo session for {auth.email}. Your course registrations are saved for
        this email.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}
      {loading && (
        <Box sx={{ mt: 4 }}>
          <LoadingCards label="Loading registrations" count={2} />
        </Box>
      )}
      {!loading && !rows.length && (
        <Paper variant="outlined" sx={{ p: 4, mt: 4 }}>
          <Typography variant="h6">Your learning starts here</Typography>
          <Typography sx={{ mt: 1, mb: 2 }} color="text.secondary">
            Choose a sample course to try registration and follow its progress.
          </Typography>
          <Button href="/" variant="contained">
            Browse courses
          </Button>
        </Paper>
      )}
      <Stack spacing={3} sx={{ mt: 4 }}>
        {rows.map((row) => (
          <Paper key={row.id} variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="overline" color="secondary">
                  {row.category}
                </Typography>
                <Typography variant="h6" component="h2">
                  <Link href={`/courses/${row.offering_id}`} color="inherit">
                    {row.title}
                  </Link>
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  {courseSchedule(row)}
                </Typography>
              </Box>
              <Chip
                label={labels[row.status] || row.status}
                color={row.status === "enrolled" ? "success" : "default"}
                variant="outlined"
              />
            </Stack>
            <Divider sx={{ my: 2.5 }} />
            {actionError?.id === row.id && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {actionError.message}
              </Alert>
            )}
            {row.status === "awaiting_approval" && (
              <Alert severity="info">
                Your request is awaiting program approval. In this prototype,
                use Staff → Approvals to review it.
              </Alert>
            )}
            {["approved", "expired"].includes(row.status) && (
              <Stack
                sx={{
                  gap: 2,
                  alignItems: "flex-start",
                }}
              >
                <Typography>
                  {row.status === "approved"
                    ? "Your request is approved. Reserve a seat to continue."
                    : "Your seat reservation expired. Check availability and try again."}
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => act(row)}
                  disabled={busy === row.id}
                >
                  {busy === row.id ? "Reserving…" : "Reserve a seat"}
                </Button>
              </Stack>
            )}
            {row.status === "declined" && (
              <Alert severity="warning">
                Your request was declined. A new review process is outside this
                prototype.
              </Alert>
            )}
            {row.status === "reserved" && (
              <Stack
                sx={{
                  gap: 2,
                  alignItems: "flex-start",
                }}
              >
                <Typography>
                  Your seat is reserved until{" "}
                  {row.reserved_until
                    ? new Date(row.reserved_until).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "the checkout deadline"}
                  .
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Try the payment-to-enrollment workflow with a simulated{" "}
                  {money(row.price_cents)} payment. No charge is made.
                </Typography>
                <Button
                  variant="contained"
                  disabled={busy === row.id}
                  onClick={() => act(row)}
                >
                  {busy === row.id ? "Submitting…" : "Simulate payment"}
                </Button>
              </Stack>
            )}
            {["provisioning", "enrolled"].includes(row.status) && (
              <>
                <Stepper
                  activeStep={
                    row.status === "enrolled"
                      ? 3
                      : row.stage === "canvas"
                        ? 2
                        : 1
                  }
                  alternativeLabel
                  sx={{ mb: 3 }}
                >
                  {[
                    "Payment recorded",
                    "Identity prepared",
                    "Enrollment verified",
                  ].map((label) => (
                    <Step key={label}>
                      <StepLabel>{label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
                {row.status === "enrolled" ? (
                  <Alert severity="success">
                    The simulated enrollment is complete. A live course link
                    will appear here after Canvas is connected.
                  </Alert>
                ) : (
                  <Alert severity="info">
                    The local background worker is preparing your demo access.
                    This page updates automatically.
                  </Alert>
                )}
              </>
            )}
          </Paper>
        ))}
      </Stack>
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setNotice("")}
        >
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
