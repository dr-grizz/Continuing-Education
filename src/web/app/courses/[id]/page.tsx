"use client";
import { useDemoAuth } from "../../../components/demo-auth";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Divider,
  Link,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  api,
  date,
  courseSchedule,
  courseFormatLabel,
  money,
  Offering,
  Learning,
} from "../../../components/api";
import { LoadingCards } from "../../../components/loading";
// Registration returns the learner's existing record unchanged when one exists.
function registrationResult(status: string): {
  severity: "success" | "info" | "warning";
  message: string;
} {
  switch (status) {
    case "awaiting_approval":
      return {
        severity: "success",
        message:
          "Your approval request is saved. Staff can review it in the demo queue.",
      };
    case "reserved":
      return {
        severity: "success",
        message:
          "Your seat is reserved. Complete the simulated payment in My learning.",
      };
    case "declined":
      return {
        severity: "warning",
        message:
          "Your approval request for this course was declined. A new review process is outside this prototype.",
      };
    case "provisioning":
    case "enrolled":
      return {
        severity: "info",
        message:
          "You are already registered for this course. Check My learning for its status.",
      };
    default:
      return {
        severity: "success",
        message:
          "Your registration is saved. Check My learning for the next step.",
      };
  }
}
export default function Course({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = use(params);
  const auth = useDemoAuth();
  const router = useRouter();
  const [course, setCourse] = useState<Offering>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [registered, setRegistered] = useState<Learning>();
  const nextStep = useRef<HTMLAnchorElement>(null);
  // Keep keyboard focus after the registration button is replaced.
  useEffect(() => {
    if (registered) nextStep.current?.focus();
  }, [registered]);
  useEffect(() => {
    api<Offering>(`offerings/${id}`)
      .then(setCourse)
      .catch((e) => setError(e.message));
  }, [id]);
  async function register() {
    if (!auth.email) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(`/courses/${id}`)}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setRegistered(
        await api<Learning>("registrations", { body: { offeringId: id } }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!course)
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <LoadingCards label="Loading course" count={1} />
    );
  return (
    <>
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link href="/">Courses</Link>
        <Typography>{course.category}</Typography>
      </Breadcrumbs>
      <Typography variant="overline" color="secondary" sx={{ fontWeight: 700 }}>
        {course.category}
      </Typography>
      <Typography
        variant="h3"
        component="h1"
        sx={{ fontSize: { xs: 30, md: 40 }, mt: 1 }}
      >
        {course.title}
      </Typography>
      <Typography sx={{ mt: 2, fontSize: 18 }} color="text.secondary">
        {course.summary}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 340px" },
          gap: { xs: 4, md: 5 },
          mt: 4,
        }}
      >
        {/* First in reading order so phones reach registration without scrolling past the description. */}
        <Paper
          variant="outlined"
          component="section"
          aria-label="Registration"
          sx={{
            p: 3,
            alignSelf: "start",
            gridColumn: { md: 2 },
            gridRow: { md: 1 },
            position: { md: "sticky" },
            top: { md: 24 },
          }}
        >
          <Typography variant="h4" component="p">
            {money(course.price_cents)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            One-time course fee · sample price
          </Typography>
          <Divider sx={{ my: 2.5 }} />
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2">Format</Typography>
              <Typography variant="body2">
                {courseFormatLabel(course)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2">Schedule</Typography>
              <Typography variant="body2">{courseSchedule(course)}</Typography>
            </Box>
            {course.enrollment_closes_on && (
              <Box>
                <Typography variant="subtitle2">Enrollment</Typography>
                <Typography variant="body2">
                  {course.enrollment_open ? "Closes" : "Closed"}{" "}
                  {date(course.enrollment_closes_on)}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="subtitle2">Availability</Typography>
              <Typography variant="body2">
                {course.seats_available} of {course.capacity} seats available
              </Typography>
            </Box>
            {course.approval_required && (
              <Box>
                <Chip label="Program approval required" variant="outlined" />
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  Once approved, reserve a seat within{" "}
                  {course.approval_valid_days}{" "}
                  {course.approval_valid_days === 1 ? "day" : "days"}.
                </Typography>
              </Box>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {registered ? (
              <>
                <Alert
                  severity={registrationResult(registered.status).severity}
                >
                  {registrationResult(registered.status).message}
                </Alert>
                <Button variant="contained" href="/learning" ref={nextStep}>
                  Go to My learning
                </Button>
              </>
            ) : (
              <Button
                variant="contained"
                disabled={
                  busy || course.seats_available <= 0 || !course.enrollment_open
                }
                onClick={register}
              >
                {!course.enrollment_open
                  ? "Enrollment closed"
                  : busy
                    ? "Saving…"
                    : course.approval_required
                      ? auth.email
                        ? "Request approval"
                        : "Sign in to request approval"
                      : auth.email
                        ? "Start registration"
                        : "Sign in to register"}
              </Button>
            )}
            <Typography variant="caption" color="text.secondary">
              No card details are requested. No payment is collected.
            </Typography>
          </Stack>
        </Paper>
        <Box sx={{ gridColumn: { md: 1 }, gridRow: { md: 1 } }}>
          <Typography variant="h5" component="h2">
            About this course
          </Typography>
          <Typography sx={{ mt: 2, lineHeight: 1.85 }}>
            {course.description}
          </Typography>
          <Typography variant="h5" component="h2" sx={{ mt: 4 }}>
            What you’ll learn
          </Typography>
          <List sx={{ listStyleType: "disc", pl: 3 }}>
            {course.outcomes.map((outcome) => (
              <ListItem key={outcome} sx={{ display: "list-item", pl: 0 }}>
                <ListItemText primary={outcome} />
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" component="h2">
            Before you register
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.8 }}>
            This is a sample non-credit offering. Registrations are saved for
            your demo email. Payment, identity provisioning and course access
            are simulated locally.
          </Typography>
        </Box>
      </Box>
    </>
  );
}
