"use client";
import { useDemoAuth } from "../../components/demo-auth";
import { CanvasLinkButton } from "../../components/canvas-link";
import { LoadingCards } from "../../components/loading";
import { useCallback, useEffect, useRef, useState } from "react";
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
  FollowedPathway,
  Learning,
  money,
  Offering,
} from "../../components/api";
import { visuallyHidden } from "../../components/visually-hidden";
const labels: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  approved: "Approved — reserve a seat",
  approval_expired: "Approval expired",
  refunded: "Refunded, access ended",
  declined: "Request declined",
  reserved: "Seat reserved",
  provisioning: "Preparing access",
  enrolled: "Enrolled",
  expired: "Reservation expired",
  exception: "Support review needed",
};
const renewable = [
  "approved",
  "expired",
  "approval_expired",
  "declined",
  "refunded",
];
// Unpublished offerings accept no further steps before payment.
const withdrawn = (row: Learning) =>
  row.published === false &&
  ["awaiting_approval", "reserved", ...renewable].includes(row.status);
const deadline = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
// Approval is reused while still valid; declined or lapsed approvals need a new request.
function nextStep(row: Learning) {
  const approvalValid =
    ["approved", "expired"].includes(row.status) &&
    Boolean(row.approval_expires_at) &&
    new Date(row.approval_expires_at as string).getTime() > Date.now();
  const request = Boolean(row.approval_required) && !approvalValid;
  const message =
    row.status === "approved"
      ? `Your request is approved. Reserve a seat by ${deadline(row.approval_expires_at)}, when the approval expires.`
      : row.status === "refunded"
        ? request
          ? "This course was refunded and your access has ended. To take it again, request approval; you will pay again once approved."
          : "This course was refunded and your access has ended. To take it again, reserve a seat and pay again."
        : row.status === "declined"
          ? "Your request was declined. You can request approval again."
          : row.status === "approval_expired"
            ? "Your approval expired before a seat was reserved. Request approval again to continue."
            : request
              ? "Your seat reservation and approval have both expired. Request approval again to continue."
              : "Your seat reservation expired. Check availability and try again.";
  return { request, message };
}
export default function LearningPage() {
  const auth = useDemoAuth();
  const [rows, setRows] = useState<Learning[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [actionError, setActionError] = useState<{ id: string; message: string }>(),
    [notice, setNotice] = useState(""),
    [announcement, setAnnouncement] = useState(""),
    [focusAfter, setFocusAfter] = useState(""),
    [saved, setSaved] = useState<Offering[]>([]),
    [pathways, setPathways] = useState<FollowedPathway[]>([]),
    [removing, setRemoving] = useState(""),
    // Keeps the section (the focus target) after the last course is removed.
    [removedSaved, setRemovedSaved] = useState(false);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const [provider, setProvider] = useState<"stripe" | "simulated">(),
    [checkoutResult, setCheckoutResult] = useState<"success" | "cancelled">();
  const checkoutMessage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<{ provider: "stripe" | "simulated" }>("payments/config")
      .then((config) => setProvider(config.provider))
      .catch(() => setProvider("simulated"));
    // Stripe returns learners here; the message is informational only.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("checkout");
    if (result === "success" || result === "cancelled") {
      setCheckoutResult(result);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (checkoutResult) checkoutMessage.current?.focus();
  }, [checkoutResult]);
  const statuses = useRef<Map<string, string>>(new Map());
  const quietId = useRef("");
  const cards = useRef<Map<string, HTMLElement>>(new Map());
  const refresh = useCallback(async () => {
    try {
      const next = await api<Learning[]>("me/learning");
      // Announce background status changes (for example the worker finishing
      // enrollment). The learner's own action is announced by the snackbar.
      const changes = next
        .filter((row) => {
          const previous = statuses.current.get(row.id);
          return (
            previous && previous !== row.status && row.id !== quietId.current
          );
        })
        .map((row) => `${row.title}: ${labels[row.status] || row.status}.`);
      if (changes.length) setAnnouncement(changes.join(" "));
      // A card moves between "Enrolled courses" and "Registrations" when it is
      // enrolled; if focus was inside it, follow the card to its new place.
      const focused = [...cards.current.entries()].find(([, element]) =>
        element.contains(document.activeElement),
      )?.[0];
      const moved = next.find(
        (row) =>
          row.id === focused &&
          (row.status === "enrolled") !==
            (statuses.current.get(row.id) === "enrolled"),
      );
      if (moved) setFocusAfter(moved.id);
      statuses.current = new Map(next.map((row) => [row.id, row.status]));
      setRows(next);
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
  // The acted-on button is often replaced by the next step, so move focus to
  // that step's action, or to the course heading when no action remains.
  useEffect(() => {
    if (!focusAfter) return;
    const card = cards.current.get(focusAfter);
    const target =
      card?.querySelector<HTMLElement>("[data-next-action]") ??
      card?.querySelector<HTMLElement>("h3");
    target?.focus();
    setFocusAfter("");
  }, [rows, focusAfter]);
  // Saved courses and followed pathways are private lists; neither registers.
  useEffect(() => {
    api<Offering[]>("me/saved-courses")
      .then(setSaved)
      .catch(() => setSaved([]));
    api<FollowedPathway[]>("me/pathways")
      .then(setPathways)
      .catch(() => setPathways([]));
  }, []);
  async function removeSaved(course: Offering) {
    if (removing) return;
    setRemoving(course.id);
    try {
      await api(`me/saved-courses/${course.id}`, { body: { saved: false } });
      setSaved((list) => list.filter((o) => o.id !== course.id));
      setRemovedSaved(true);
      setAnnouncement(`${course.title} removed from saved courses.`);
      savedHeading.current?.focus();
    } catch (e) {
      setAnnouncement((e as Error).message);
    } finally {
      setRemoving("");
    }
  }
  async function act(row: Learning) {
    if (busy) return;
    setBusy(row.id);
    setActionError(undefined);
    quietId.current = row.id;
    try {
      if (row.status === "reserved" && provider === "stripe") {
        // Stripe-hosted Checkout: the webhook, not this page, confirms payment.
        const { url } = await api<{ url: string }>(
          `registrations/${row.id}/checkout`,
          { body: {} },
        );
        window.location.assign(url);
        return;
      } else if (row.status === "reserved") {
        await api(`prototype/registrations/${row.id}/simulate-payment`, {
          body: {},
        });
        setNotice(`Payment simulated for ${row.title}. Preparing access.`);
      } else {
        const result = await api<Learning>("registrations", {
          body: { offeringId: row.offering_id },
        });
        setNotice(
          result.status === "awaiting_approval"
            ? `Approval requested for ${row.title}.`
            : `Seat reserved for ${row.title}.`,
        );
      }
      await refresh();
      setFocusAfter(row.id);
    } catch (e) {
      // Show the failure beside its course; polling clears the page-level error.
      setActionError({ id: row.id, message: (e as Error).message });
    } finally {
      quietId.current = "";
      setBusy("");
    }
  }
  // The "Enrolled courses" section comes first: courses with a Canvas link
  // first, then ready now (self-paced or already started), then upcoming by
  // start date. Everything else is a registration in progress, closed last.
  const today = new Date().toISOString().slice(0, 10);
  const readyNow = (row: Learning) =>
    !row.start_date || row.start_date <= today;
  const available = rows
    .filter((row) => row.status === "enrolled")
    .sort(
      (a, b) =>
        Number(Boolean(b.canvas_course_url)) -
          Number(Boolean(a.canvas_course_url)) ||
        Number(readyNow(b)) - Number(readyNow(a)) ||
        (a.start_date ?? "").localeCompare(b.start_date ?? "") ||
        a.title.localeCompare(b.title),
    );
  const closed = new Set([
    "declined",
    "expired",
    "approval_expired",
    "refunded",
  ]);
  const registrations = rows
    .filter((row) => row.status !== "enrolled")
    .sort(
      (a, b) => Number(closed.has(a.status)) - Number(closed.has(b.status)),
    );
  // The next pathway course: the first not registered, or whose registration
  // expired, lapsed or was declined. Registration status only; no completion.
  const reopen = new Set(["expired", "approval_expired", "declined"]);
  const nextPathwayStep = (pathway: FollowedPathway) =>
    pathway.steps.find(
      (step) =>
        step.registration_status === null ||
        reopen.has(step.registration_status),
    );
  const renderCard = (row: Learning) => (
    <Paper
      key={row.id}
      variant="outlined"
      ref={(element: HTMLElement | null) => {
        if (element) cards.current.set(row.id, element);
        else cards.current.delete(row.id);
      }}
      sx={{ p: { xs: 2.5, md: 3 } }}
    >
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
          <Typography
            variant="h6"
            component="h3"
            tabIndex={-1}
            sx={{ "&:focus": { outline: "none" } }}
          >
            {row.published === false ? (
              row.title
            ) : (
              <Link href={`/courses/${row.offering_id}`} color="inherit">
                {row.title}
              </Link>
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {courseSchedule(row)}
          </Typography>
        </Box>
        <Chip
          label={
            withdrawn(row)
              ? "No longer offered"
              : labels[row.status] || row.status
          }
          color={
            row.status === "enrolled"
              ? "success"
              : row.status === "exception"
                ? "warning"
                : "default"
          }
          variant="outlined"
        />
      </Stack>
      <Divider sx={{ my: 2.5 }} />
      {actionError?.id === row.id && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError.message}
        </Alert>
      )}
      {withdrawn(row) && (
        <Alert severity="info" role="note">
          This course is no longer open for registration
          {row.status === "reserved"
            ? ", so payment isn’t available and your reserved seat will be released"
            : ""}
          . Contact the program office if you have questions.
        </Alert>
      )}
      {row.status === "awaiting_approval" && !withdrawn(row) && (
        <Alert severity="info" role="note">
          Your request is awaiting program approval. In this prototype, use
          Staff → Approvals to review it.
        </Alert>
      )}
      {renewable.includes(row.status) && !withdrawn(row) && (
        <Stack sx={{ gap: 2, alignItems: "flex-start" }}>
          {row.enrollment_open === false ? (
            <Alert severity="info" role="note">
              Enrollment for this course closed on{" "}
              {date(row.enrollment_closes_on ?? null)}, so this registration can
              no longer continue. Contact the program office if you need help.
            </Alert>
          ) : (
            <Typography>{nextStep(row).message}</Typography>
          )}
          {row.enrollment_open === false ? null : (
            <Button
              variant="contained"
              onClick={() => act(row)}
              aria-disabled={busy === row.id}
              data-next-action
            >
              {nextStep(row).request
                ? busy === row.id
                  ? "Requesting…"
                  : "Request approval again"
                : busy === row.id
                  ? "Reserving…"
                  : "Reserve a seat"}
            </Button>
          )}
        </Stack>
      )}
      {row.status === "reserved" && !withdrawn(row) && (
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
          {provider === "stripe" ? (
            <Typography variant="body2" color="text.secondary">
              Pay {money(row.quoted_price_cents ?? row.price_cents)} on
              Stripe&apos;s secure checkout page. This is the Stripe sandbox:
              use a test card such as 4242 4242 4242 4242; no real charge is
              made.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Try the payment-to-enrollment workflow with a simulated{" "}
              {money(row.quoted_price_cents ?? row.price_cents)} payment. No
              charge is made.
            </Typography>
          )}
          <Button
            variant="contained"
            aria-disabled={busy === row.id}
            onClick={() => act(row)}
            data-next-action
          >
            {busy === row.id
              ? provider === "stripe"
                ? "Opening checkout…"
                : "Submitting…"
              : provider === "stripe"
                ? "Pay with Stripe"
                : "Simulate payment"}
          </Button>
        </Stack>
      )}
      {["provisioning", "enrolled", "exception"].includes(row.status) && (
        <>
          {/* Enrolled courses need no progress steps; the course link is enough. */}
          {row.status !== "enrolled" && (
            <Stepper
              activeStep={row.stage === "canvas" ? 2 : 1}
              alternativeLabel
              sx={{ mb: 3 }}
            >
              {[
                "Payment recorded",
                "Identity prepared",
                "Enrollment verified",
              ].map((label, index) => {
                // Mark the step that failed when provisioning needs staff review.
                const failed =
                  row.status === "exception" &&
                  index === (row.stage === "canvas" ? 2 : 1);
                return (
                  <Step key={label}>
                    <StepLabel
                      error={failed}
                      optional={
                        failed ? (
                          <Typography variant="caption" color="error">
                            Needs staff review
                          </Typography>
                        ) : undefined
                      }
                    >
                      {label}
                    </StepLabel>
                  </Step>
                );
              })}
            </Stepper>
          )}
          {row.status === "exception" ? (
            <Alert severity="warning" role="note">
              We couldn’t finish setting up your course access. Your simulated
              payment is recorded and staff have been asked to review it. You
              don’t need to pay again.
            </Alert>
          ) : row.status === "provisioning" && (row.attempts ?? 0) > 0 ? (
            <Alert severity="info" role="note">
              Setting up access is taking longer than usual. The system is
              retrying automatically; no action is needed.
            </Alert>
          ) : row.status === "enrolled" && row.canvas_course_url ? (
            <Stack sx={{ gap: 1.5, alignItems: "flex-start" }}>
              <Typography>
                Your Canvas account and course enrollment are ready.
              </Typography>
              <CanvasLinkButton
                id={row.offering_id}
                url={row.canvas_course_url}
                title={row.title}
              />
            </Stack>
          ) : row.status === "enrolled" ? (
            <Alert severity="success" role="note">
              Your enrollment is complete. The course link will appear here when
              staff connect the Canvas course.
            </Alert>
          ) : (
            <Alert severity="info" role="note">
              The local background worker is preparing your demo access. This
              page updates automatically.
            </Alert>
          )}
        </>
      )}
    </Paper>
  );
  return (
    <>
      <Typography variant="h4" component="h1">
        My learning
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        Demo session for {auth.displayName}. Your course registrations are saved
        for this email.
      </Typography>
      {checkoutResult && (
        <Alert
          ref={checkoutMessage}
          tabIndex={-1}
          severity={checkoutResult === "success" ? "success" : "info"}
          role="note"
          onClose={() => setCheckoutResult(undefined)}
          sx={{ mt: 3 }}
        >
          {checkoutResult === "success"
            ? "Thank you. Stripe received your payment. Your course status below updates once Stripe confirms it, usually within a few seconds."
            : "Checkout was cancelled and no payment was taken. Your seat stays reserved until the time shown on the course."}
        </Alert>
      )}
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
      {available.length > 0 && (
        <Box
          component="section"
          aria-labelledby="enrolled-heading"
          sx={{ mt: 4 }}
        >
          <Typography id="enrolled-heading" variant="h5" component="h2">
            Enrolled courses
          </Typography>
          <Stack spacing={3} sx={{ mt: 2 }}>
            {available.map(renderCard)}
          </Stack>
        </Box>
      )}
      {registrations.length > 0 && (
        <Box
          component="section"
          aria-labelledby="registrations-heading"
          sx={{ mt: 5 }}
        >
          <Typography id="registrations-heading" variant="h5" component="h2">
            Registrations
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Requests, reservations and enrollments in progress. Closed requests
            are listed last.
          </Typography>
          <Stack spacing={3} sx={{ mt: 2 }}>
            {registrations.map(renderCard)}
          </Stack>
        </Box>
      )}
      {pathways.length > 0 && (
        <Box
          component="section"
          aria-labelledby="pathways-heading"
          sx={{ mt: 5 }}
        >
          <Typography id="pathways-heading" variant="h5" component="h2">
            Pathways you follow
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Recommended course order. Register for each course separately;
            progress tracking arrives with the Canvas connection.
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            {pathways.map((pathway) => (
              <Paper
                key={pathway.id}
                variant="outlined"
                sx={{ p: { xs: 2.5, md: 3 } }}
              >
                <Typography variant="h6" component="h3">
                  <Link href={`/collections/${pathway.slug}`}>
                    {pathway.title}
                  </Link>
                </Typography>
                <Box
                  component="ol"
                  sx={{ m: 0, mt: 1.5, pl: 3, display: "grid", gap: 1 }}
                >
                  {pathway.steps.map((step) => (
                    <li key={step.id}>
                      <Link href={`/courses/${step.id}`}>{step.title}</Link>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                      >
                        {" · "}
                        {step.registration_status
                          ? labels[step.registration_status] ||
                            step.registration_status
                          : "Not registered"}
                      </Typography>
                      {step.id === nextPathwayStep(pathway)?.id && (
                        <Chip
                          label="Next"
                          color="primary"
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </li>
                  ))}
                </Box>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
      {(saved.length > 0 || removedSaved) && (
        <Box component="section" aria-labelledby="saved-heading" sx={{ mt: 5 }}>
          <Typography
            id="saved-heading"
            ref={savedHeading}
            tabIndex={-1}
            variant="h5"
            component="h2"
            sx={{ "&:focus": { outline: "none" } }}
          >
            Saved courses
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Only you can see this list. Saving a course does not register you.
          </Typography>
          {saved.length === 0 && (
            <Typography sx={{ mt: 2 }}>
              No saved courses.{" "}
              <Link href="/" underline="always">
                Browse courses
              </Link>
            </Typography>
          )}
          <Stack spacing={2} sx={{ mt: 2 }}>
            {saved.map((course) => (
              <Paper
                key={course.id}
                variant="outlined"
                sx={{
                  p: { xs: 2, md: 2.5 },
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  justifyContent: "space-between",
                  alignItems: { sm: "center" },
                  gap: 1.5,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="subtitle1"
                    component="h3"
                    sx={{ fontWeight: 600 }}
                  >
                    <Link href={`/courses/${course.id}`}>{course.title}</Link>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {courseSchedule(course)} · {money(course.price_cents)}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  onClick={() => removeSaved(course)}
                  aria-disabled={removing === course.id || undefined}
                  aria-label={`Remove ${course.title} from saved courses`}
                  sx={{
                    alignSelf: { xs: "flex-start", sm: "center" },
                    flexShrink: 0,
                  }}
                >
                  {removing === course.id ? "Removing…" : "Remove"}
                </Button>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
      {/* Polite announcements for status changes that happen in the background. */}
      <Box role="status" sx={visuallyHidden}>
        {announcement}
      </Box>
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
