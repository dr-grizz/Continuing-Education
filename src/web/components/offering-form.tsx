"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Checkbox,
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
import { missingOfferingInfo } from "../../domain/offering-readiness";
import { api, date, money, Offering } from "./api";

export type StaffOffering = Omit<
  Offering,
  "course_type" | "price_cents" | "capacity" | "seats_available"
> & {
  course_type: Offering["course_type"] | null;
  price_cents: number | null;
  capacity: number | null;
  seats_available: number | null;
  imported_from_canvas?: boolean;
  missing_required_info?: string[];
  active_registrations: number;
  seats_in_use: number;
  sales_page_status: "none" | "draft" | "published" | "changes";
};
type Values = {
  title: string;
  category: string;
  summary: string;
  description: string;
  format: string;
  courseType: "cohort" | "self_paced" | "";
  startDate: string;
  endDate: string;
  price: string;
  capacity: string;
  unlimitedSeats: boolean;
  approvalRequired: boolean;
  listed: boolean;
  approvalValidDays: string;
  enrollmentCloseDays: string;
  canvasCourseUrl: string;
  reason: string;
};
type Field = Exclude<
  keyof Values,
  "approvalRequired" | "unlimitedSeats" | "listed"
>;
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
  unlimitedSeats: false,
  approvalRequired: false,
  listed: true,
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
  courseType: o.course_type ?? "",
  startDate: o.start_date ?? (o.imported_from_canvas ? "" : blank.startDate),
  endDate: o.end_date ?? (o.imported_from_canvas ? "" : blank.endDate),
  price: o.price_cents === null ? "" : String(o.price_cents / 100),
  capacity: o.capacity === null ? "" : String(o.capacity),
  unlimitedSeats: o.unlimited_seats ?? false,
  approvalRequired: o.approval_required,
  listed: o.listed !== false,
  approvalValidDays: String(o.approval_valid_days),
  enrollmentCloseDays: String(o.enrollment_close_days),
  canvasCourseUrl: o.canvas_course_url ?? "",
  reason: "",
});
// Fields shown in each offering page tab; the dialog (creating) shows them all.
export type OfferingFormSection = "details" | "settings";
const sectionFields: Record<OfferingFormSection, Field[]> = {
  details: [
    "title",
    "category",
    "summary",
    "description",
    "format",
    "courseType",
    "startDate",
    "endDate",
    "price",
    "capacity",
    "reason",
  ],
  settings: [
    "approvalValidDays",
    "enrollmentCloseDays",
    "canvasCourseUrl",
    "reason",
  ],
};
const whole = (value: string, min: number, max: number) =>
  /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
const length = (value: string, min: number, max: number) =>
  value.trim().length >= min && value.trim().length <= max;

// Create and edit form for staff offerings. Creating uses a dialog with every
// field; an offering page's Details and Settings tabs show the form inline with
// their own fields, and saving sends the rest unchanged. Published offerings
// keep protected terms and need an audited reason for any change.
export function OfferingForm({
  open,
  offering,
  section,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  open: boolean;
  offering?: StaffOffering;
  /** Shows the form inline with only this tab's fields. */
  section?: OfferingFormSection;
  onClose: () => void;
  onSaved: (message: string, saved?: { id: string }) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const editing = Boolean(offering);
  const inline = Boolean(section);
  const show = (name: Field) =>
    !section || sectionFields[section].includes(name);
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

  const missing = offering ? missingOfferingInfo(offering) : [];
  const dirty =
    inline &&
    !!offering &&
    JSON.stringify(values) !== JSON.stringify(fromOffering(offering));
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // Move focus to the summary once a server failure has rendered it.
  useEffect(() => {
    if (failure) summary.current?.focus();
  }, [failure]);
  function validate() {
    const found: Partial<Record<Field, string>> = {};
    if (!values.courseType) found.courseType = "Choose a course type.";
    if (!values.category) found.category = "Choose a topic.";
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
    if (!values.unlimitedSeats && !whole(values.capacity, 1, 10000))
      found.capacity = "Enter a whole number from 1 to 10,000.";
    else if (
      !values.unlimitedSeats &&
      offering &&
      Number(values.capacity) < offering.seats_in_use
    )
      found.capacity = `At least ${offering.seats_in_use} seats are in use.`;
    if (values.approvalRequired && !whole(values.approvalValidDays, 1, 365))
      found.approvalValidDays = "Enter a whole number from 1 to 365.";
    const url = values.canvasCourseUrl.trim();
    if (url && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(url))
      found.canvasCourseUrl =
        "Enter a full https:// address, or leave it empty.";
    if (published && !length(values.reason, 10, 500))
      found.reason = "Explain the change in 10 to 500 characters.";
    // Fields outside this tab come unchanged from the saved offering.
    return Object.fromEntries(
      Object.entries(found).filter(([name]) => show(name as Field)),
    ) as typeof found;
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
      capacity: values.unlimitedSeats ? null : Number(values.capacity),
      unlimitedSeats: values.unlimitedSeats,
      approvalRequired: values.approvalRequired,
      listed: values.listed,
      approvalValidDays: Number(values.approvalValidDays),
      enrollmentCloseDays: Number(values.enrollmentCloseDays),
      ...(values.canvasCourseUrl.trim()
        ? { canvasCourseUrl: values.canvasCourseUrl.trim() }
        : {}),
    };
    setBusy(true);
    try {
      let saved: { id: string } | undefined;
      // Incomplete imported drafts can save settings without validating Details.
      // Complete offerings keep the existing audited edit/reason workflow.
      if (offering && section === "settings" && missing.length > 0)
        saved = await api<{ id: string }>(`offerings/${offering.id}/settings`, {
          role: "staff",
          body: {
            version: offering.version,
            approvalValidDays: body.approvalValidDays,
            enrollmentCloseDays: body.enrollmentCloseDays,
            listed: body.listed,
            ...(body.canvasCourseUrl
              ? { canvasCourseUrl: body.canvasCourseUrl }
              : {}),
          },
        });
      else if (offering)
        saved = await api<{ id: string }>(`offerings/${offering.id}/edit`, {
          role: "staff",
          body: {
            ...body,
            version: offering.version,
            ...(values.reason.trim() ? { reason: values.reason.trim() } : {}),
          },
        });
      else
        saved = await api<{ id: string }>("offerings", { role: "staff", body });
      await onSaved(
        offering ? `Changes saved for ${body.title}.` : "Draft offering saved.",
        saved,
      );
    } catch (e) {
      setFailure((e as Error).message);
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

  const fields = (
    <Stack spacing={2.5} sx={{ pt: inline ? 0 : 1 }}>
      {published && (
        <Alert severity="info" role="note">
          This offering {offering?.published ? "is" : "was"} published. Changes
          need a reason and are recorded in the audit log.{" "}
          {section === "settings"
            ? "The approval requirement is locked."
            : `Course type${section ? "" : " and the approval requirement"} ${section ? "is" : "are"} locked${
                datesLocked
                  ? `, and dates are locked while ${offering?.active_registrations} learners are registered`
                  : ""
              }.`}
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
            component={inline ? "h4" : "h3"}
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
                    sx={{ display: "inline-block", minHeight: 24, py: 0.5 }}
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
      {!inline && missing.length > 0 && (
        <Alert severity="warning" role="note">
          This draft is missing required information: {missing.join(", ")}.
          Complete the required fields before publishing or opening
          registration.
        </Alert>
      )}
      {show("title") && (
        <>
          <TextField {...field("title")} required />
          <TextField
            {...field("category")}
            select
            required
            slotProps={
              offering?.imported_from_canvas
                ? {
                    select: { displayEmpty: true },
                    inputLabel: { shrink: true },
                  }
                : undefined
            }
          >
            {offering?.imported_from_canvas && (
              <MenuItem value="" disabled>
                Not set — choose a topic
              </MenuItem>
            )}
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
            slotProps={
              offering?.imported_from_canvas
                ? {
                    select: { displayEmpty: true },
                    inputLabel: { shrink: true },
                  }
                : undefined
            }
          >
            {offering?.imported_from_canvas && (
              <MenuItem value="" disabled>
                Not set — choose a course type
              </MenuItem>
            )}
            <MenuItem value="self_paced">Self-paced — start anytime</MenuItem>
            <MenuItem value="cohort">Scheduled — fixed dates</MenuItem>
          </TextField>
          <TextField {...field("format")} required />
        </>
      )}
      {values.courseType === "cohort" ? (
        <>
          {show("startDate") && (
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
          )}
          {show("enrollmentCloseDays") && (
            <TextField
              {...field(
                "enrollmentCloseDays",
                "Learners cannot register after this many days past the start date. Default 7.",
              )}
              required
              inputMode="numeric"
            />
          )}
        </>
      ) : values.courseType === "" ? (
        <Typography variant="body2">
          Choose a course type to set the schedule.
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {section === "settings"
            ? "Self-paced: learners can start anytime, and enrollment never closes."
            : "Learners can start anytime. No cohort dates are required, and enrollment never closes."}
        </Typography>
      )}
      {show("price") && (
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
          <Stack spacing={0.5} sx={{ width: "100%", minWidth: 0 }}>
            <TextField
              {...field(
                "capacity",
                values.unlimitedSeats
                  ? "No seat limit for this offering."
                  : offering?.seats_in_use
                    ? `${offering.seats_in_use} seats in use.`
                    : undefined,
              )}
              value={values.unlimitedSeats ? "" : values.capacity}
              required={!values.unlimitedSeats}
              disabled={values.unlimitedSeats}
              inputMode="numeric"
            />
            <FormControlLabel
              label="Unlimited seats"
              control={
                <Checkbox
                  checked={values.unlimitedSeats}
                  onChange={(_, checked) => {
                    setValues({ ...values, unlimitedSeats: checked });
                    setErrors({ ...errors, capacity: undefined });
                  }}
                />
              }
            />
          </Stack>
        </Stack>
      )}
      {show("price") && prices.length > 0 && (
        <div>
          <Typography variant="subtitle2" component={inline ? "h4" : "h3"}>
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
      {show("approvalValidDays") && (
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={values.listed}
                onChange={(_, checked) =>
                  setValues({ ...values, listed: checked })
                }
                slotProps={{
                  input: { "aria-describedby": "offering-listed-help" },
                }}
              />
            }
            label="Listed in course discovery"
          />
          <Typography
            id="offering-listed-help"
            variant="body2"
            color="text.secondary"
          >
            {values.listed
              ? "Listed: published courses appear in browsing, search, Explore, collections and pathways."
              : "Unlisted: published courses can be opened and registered through their direct link, but do not appear in public discovery."}{" "}
            Listing does not publish a draft. Direct links are shareable;
            unlisted does not mean private.
          </Typography>
        </Box>
      )}
      {show("approvalValidDays") && (
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
      )}
      {show("approvalValidDays") && values.approvalRequired && (
        <TextField
          {...field(
            "approvalValidDays",
            "The learner must reserve a seat within this period after approval. Default 7.",
          )}
          required
          inputMode="numeric"
        />
      )}
      {show("canvasCourseUrl") && (
        <TextField
          {...field(
            "canvasCourseUrl",
            offering?.imported_from_canvas
              ? "Linked by Canvas sync. This course mapping is protected."
              : "Optional. Learners see an “Open course in Canvas” link once enrollment completes.",
          )}
          type="url"
          placeholder="https://canvas.example.edu/courses/123"
          slotProps={{
            input: { readOnly: Boolean(offering?.imported_from_canvas) },
          }}
        />
      )}
      {published && (
        <TextField
          {...field("reason", "Recorded in the audit log.")}
          required
          multiline
          minRows={2}
        />
      )}
    </Stack>
  );
  if (inline)
    return (
      <Box>
        {fields}
        <Stack
          direction="row"
          sx={{ mt: 3, gap: 2, alignItems: "center", flexWrap: "wrap" }}
        >
          <Button variant="contained" onClick={save} aria-disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <Button
            onClick={() => {
              if (!offering) return;
              setValues(fromOffering(offering));
              setErrors({});
              setFailure("");
            }}
            disabled={busy || !dirty}
          >
            Discard changes
          </Button>
          <Typography variant="body2" color="text.secondary" aria-live="polite">
            {dirty ? "You have unsaved changes." : ""}
          </Typography>
        </Stack>
      </Box>
    );
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
      <DialogContent>{fields}</DialogContent>
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
              <strong>{offering.title}</strong> will leave the course list. No
              new registrations, approval requests or payments will be accepted.
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
