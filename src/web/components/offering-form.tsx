"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Link,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { api, date, money, Offering } from "./api";

export type StaffOffering = Offering & {
  active_registrations: number;
  seats_in_use: number;
};
type Values = {
  title: string;
  category: string;
  summary: string;
  description: string;
  format: string;
  courseType: "cohort" | "self_paced";
  startDate: string;
  endDate: string;
  price: string;
  capacity: string;
  approvalRequired: boolean;
  approvalValidDays: string;
  enrollmentCloseDays: string;
  canvasCourseUrl: string;
  reason: string;
};
type Field = Exclude<keyof Values, "approvalRequired">;
const labels: Record<Field, string> = {
  title: "Course title",
  category: "Topic",
  summary: "Short summary",
  description: "Description",
  format: "Format",
  courseType: "Course type",
  startDate: "Start date",
  endDate: "End date",
  price: "Price (USD)",
  capacity: "Seat capacity",
  approvalValidDays: "Approval valid for (days)",
  enrollmentCloseDays: "Enrollment closes (days after start)",
  canvasCourseUrl: "Canvas course URL",
  reason: "Reason for change",
};
const blank: Values = {
  title: "",
  category: "Technology",
  summary: "",
  description: "",
  format: "Online",
  courseType: "self_paced",
  startDate: "2026-11-02",
  endDate: "2026-12-11",
  price: "149",
  capacity: "20",
  approvalRequired: false,
  approvalValidDays: "7",
  enrollmentCloseDays: "7",
  canvasCourseUrl: "",
  reason: "",
};
const fromOffering = (o: StaffOffering): Values => ({
  title: o.title,
  category: o.category,
  summary: o.summary,
  description: o.description,
  format: o.format,
  courseType: o.course_type,
  startDate: o.start_date ?? blank.startDate,
  endDate: o.end_date ?? blank.endDate,
  price: String(o.price_cents / 100),
  capacity: String(o.capacity),
  approvalRequired: o.approval_required,
  approvalValidDays: String(o.approval_valid_days),
  enrollmentCloseDays: String(o.enrollment_close_days),
  canvasCourseUrl: o.canvas_course_url ?? "",
  reason: "",
});
const whole = (value: string, min: number, max: number) =>
  /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
const length = (value: string, min: number, max: number) =>
  value.trim().length >= min && value.trim().length <= max;

// Create and edit form for staff offerings. Published offerings keep protected
// terms and need an audited reason for any change.
export function OfferingForm({
  open,
  offering,
  onClose,
  onSaved,
}: {
  open: boolean;
  offering?: StaffOffering;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const editing = Boolean(offering);
  // Offerings that are or were published keep protected terms.
  const published = Boolean(offering?.published || offering?.unpublished_at);
  const datesLocked = (offering?.active_registrations ?? 0) > 0;
  const [values, setValues] = useState<Values>(blank);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<
    { price_cents: number; effective_at: string; reason: string | null }[]
  >([]);
  const summary = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(offering ? fromOffering(offering) : blank);
    setErrors({});
    setFailure("");
    setPrices([]);
    if (offering)
      api<typeof prices>(`offerings/${offering.id}/prices`, { role: "staff" })
        .then(setPrices)
        .catch(() => setPrices([]));
  }, [open, offering]);

  function validate() {
    const found: Partial<Record<Field, string>> = {};
    if (!length(values.title, 3, 120))
      found.title = "Enter 3 to 120 characters.";
    if (!length(values.summary, 10, 240))
      found.summary = "Enter 10 to 240 characters.";
    if (!length(values.description, 20, 4000))
      found.description = "Enter at least 20 characters.";
    if (!length(values.format, 3, 100))
      found.format = "Enter 3 to 100 characters, for example “Online”.";
    if (values.courseType === "cohort") {
      if (!values.startDate) found.startDate = "Choose a start date.";
      if (!values.endDate) found.endDate = "Choose an end date.";
      else if (values.startDate && values.endDate < values.startDate)
        found.endDate = "The end date must be on or after the start date.";
      if (!whole(values.enrollmentCloseDays, 0, 365))
        found.enrollmentCloseDays = "Enter a whole number from 0 to 365.";
    }
    if (!/^\d+(\.\d{1,2})?$/.test(values.price) || Number(values.price) > 10000)
      found.price = "Enter an amount from 0 to 10,000, with up to 2 decimals.";
    if (!whole(values.capacity, 1, 10000))
      found.capacity = "Enter a whole number from 1 to 10,000.";
    else if (offering && Number(values.capacity) < offering.seats_in_use)
      found.capacity = `At least ${offering.seats_in_use} seats are in use.`;
    if (values.approvalRequired && !whole(values.approvalValidDays, 1, 365))
      found.approvalValidDays = "Enter a whole number from 1 to 365.";
    const url = values.canvasCourseUrl.trim();
    if (url && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(url))
      found.canvasCourseUrl =
        "Enter a full https:// address, or leave it empty.";
    if (published && !length(values.reason, 10, 500))
      found.reason = "Explain the change in 10 to 500 characters.";
    return found;
  }
  async function save() {
    if (busy) return;
    const found = validate();
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length) {
      // Focus the summary so all problems are announced together.
      setTimeout(() => summary.current?.focus());
      return;
    }
    const cohort = values.courseType === "cohort";
    const body = {
      title: values.title.trim(),
      category: values.category,
      summary: values.summary.trim(),
      description: values.description.trim(),
      format: values.format.trim(),
      courseType: values.courseType,
      ...(cohort
        ? { startDate: values.startDate, endDate: values.endDate }
        : {}),
      priceCents: Math.round(Number(values.price) * 100),
      capacity: Number(values.capacity),
      approvalRequired: values.approvalRequired,
      approvalValidDays: Number(values.approvalValidDays),
      enrollmentCloseDays: Number(values.enrollmentCloseDays),
      ...(values.canvasCourseUrl.trim()
        ? { canvasCourseUrl: values.canvasCourseUrl.trim() }
        : {}),
    };
    setBusy(true);
    try {
      if (offering)
        await api(`offerings/${offering.id}/edit`, {
          role: "staff",
          body: {
            ...body,
            version: offering.version,
            ...(values.reason.trim() ? { reason: values.reason.trim() } : {}),
          },
        });
      else await api("offerings", { role: "staff", body });
      await onSaved(
        offering ? `Changes saved for ${body.title}.` : "Draft offering saved.",
      );
    } catch (e) {
      setFailure((e as Error).message);
      setTimeout(() => summary.current?.focus());
    } finally {
      setBusy(false);
    }
  }
  const field = (name: Field, helper?: string) => ({
    id: `offering-${name}`,
    label: labels[name],
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues({ ...values, [name]: event.target.value });
      if (errors[name]) setErrors({ ...errors, [name]: undefined });
    },
    error: Boolean(errors[name]),
    helperText: errors[name] ?? helper,
    fullWidth: true,
  });
  const errorList = Object.entries(errors).filter(([, text]) => text) as [
    Field,
    string,
  ][];

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        {editing ? "Edit offering" : "Create sample offering"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {published && (
            <Alert severity="info" role="note">
              This offering {offering?.published ? "is" : "was"} published.
              Changes need a reason and are recorded in the audit log. Course
              type and the approval requirement are locked
              {datesLocked
                ? `, and dates are locked while ${offering?.active_registrations} learners are registered`
                : ""}
              .
            </Alert>
          )}
          {(errorList.length > 0 || failure) && (
            <Alert
              severity="error"
              ref={summary}
              tabIndex={-1}
              aria-labelledby="offering-error-heading"
            >
              <Typography
                id="offering-error-heading"
                variant="subtitle2"
                component="h3"
              >
                {failure ? "The offering was not saved" : "Fix these fields"}
              </Typography>
              {failure ? (
                failure
              ) : (
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {errorList.map(([name, text]) => (
                    <li key={name}>
                      <Link
                        href={`#offering-${name}`}
                        color="inherit"
                        onClick={(event) => {
                          event.preventDefault();
                          document.getElementById(`offering-${name}`)?.focus();
                        }}
                      >
                        {labels[name]}: {text}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <TextField {...field("title")} required />
          <TextField {...field("category")} select required>
            {["Technology", "Leadership", "Healthcare", "Ministry"].map(
              (topic) => (
                <MenuItem key={topic} value={topic}>
                  {topic}
                </MenuItem>
              ),
            )}
          </TextField>
          <TextField {...field("summary")} required />
          <TextField {...field("description")} required multiline minRows={3} />
          <TextField
            {...field(
              "courseType",
              published ? "Locked after publishing." : undefined,
            )}
            select
            required
            disabled={published}
          >
            <MenuItem value="self_paced">Self-paced — start anytime</MenuItem>
            <MenuItem value="cohort">Scheduled — fixed dates</MenuItem>
          </TextField>
          <TextField {...field("format")} required />
          {values.courseType === "cohort" ? (
            <>
              <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
                <TextField
                  {...field(
                    "startDate",
                    datesLocked
                      ? "Locked while learners are registered."
                      : undefined,
                  )}
                  type="date"
                  required
                  disabled={datesLocked}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  {...field("endDate")}
                  type="date"
                  required
                  disabled={datesLocked}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
              <TextField
                {...field(
                  "enrollmentCloseDays",
                  "Learners cannot register after this many days past the start date. Default 7.",
                )}
                required
                inputMode="numeric"
              />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Learners can start anytime. No cohort dates are required, and
              enrollment never closes.
            </Typography>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
            <TextField
              {...field(
                "price",
                published
                  ? "Applies to new reservations; earlier reservations keep their quoted price."
                  : undefined,
              )}
              required
              inputMode="decimal"
            />
            <TextField
              {...field(
                "capacity",
                offering?.seats_in_use
                  ? `${offering.seats_in_use} seats in use.`
                  : undefined,
              )}
              required
              inputMode="numeric"
            />
          </Stack>
          {prices.length > 0 && (
            <div>
              <Typography variant="subtitle2" component="h3">
                Price history
              </Typography>
              <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {prices.map((price, index) => (
                  <Typography component="li" variant="body2" key={index}>
                    {money(price.price_cents)} from{" "}
                    {date(price.effective_at.slice(0, 10))}
                    {price.reason ? ` — ${price.reason}` : ""}
                  </Typography>
                ))}
              </ol>
            </div>
          )}
          <FormControlLabel
            control={
              <Switch
                checked={values.approvalRequired}
                disabled={published}
                onChange={(e) =>
                  setValues({ ...values, approvalRequired: e.target.checked })
                }
              />
            }
            label={`Approval required before payment${published ? " (locked after publishing)" : ""}`}
          />
          {values.approvalRequired && (
            <TextField
              {...field(
                "approvalValidDays",
                "The learner must reserve a seat within this period after approval. Default 7.",
              )}
              required
              inputMode="numeric"
            />
          )}
          <TextField
            {...field(
              "canvasCourseUrl",
              "Optional. Learners see an “Open course in Canvas” link once enrollment completes.",
            )}
            type="url"
            placeholder="https://canvas.example.edu/courses/123"
          />
          {published && (
            <TextField
              {...field("reason", "Recorded in the audit log.")}
              required
              multiline
              minRows={2}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} aria-disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Save draft"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function UnpublishDialog({
  offering,
  onClose,
  onDone,
}: {
  offering?: StaffOffering;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReason("");
    setError("");
  }, [offering]);
  async function confirm() {
    if (!offering || busy) return;
    if (!length(reason, 10, 500)) {
      setError("Explain why in 10 to 500 characters.");
      document.getElementById("unpublish-reason")?.focus();
      return;
    }
    setBusy(true);
    try {
      await api(`offerings/${offering.id}/unpublish`, {
        role: "staff",
        body: { version: offering.version, reason: reason.trim() },
      });
      await onDone(`${offering.title} is no longer published.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={Boolean(offering)}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Unpublish offering</DialogTitle>
      {offering && (
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              <strong>{offering.title}</strong> will leave the catalog. No new
              registrations, approval requests or payments will be accepted.
            </Typography>
            {offering.active_registrations > 0 ? (
              <Alert severity="warning" role="note">
                {offering.active_registrations}{" "}
                {offering.active_registrations === 1
                  ? "learner has"
                  : "learners have"}{" "}
                an active registration. Paid enrollments continue; learners who
                have not paid will be unable to finish.
              </Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No learners have active registrations.
              </Typography>
            )}
            <TextField
              id="unpublish-reason"
              label="Reason"
              required
              multiline
              minRows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              error={Boolean(error)}
              helperText={error || "Recorded in the audit log."}
            />
          </Stack>
        </DialogContent>
      )}
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={confirm}
          aria-disabled={busy}
        >
          {busy ? "Unpublishing…" : "Unpublish"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
