"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  Tab,
  Tabs,
  Collapse,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "./api";
import { visuallyHidden } from "./visually-hidden";
import {
  canvasCourseDate,
  emptyCanvasCourseFilters,
  type CanvasCourseFilters,
} from "../../domain/canvas-course-filters";

type Course = {
  id: string;
  account_id: string;
  name: string;
  course_code: string;
  workflow_state: string;
  start_at: string | null;
  end_at: string | null;
  url: string;
  offering_id?: string | null;
  offering_title?: string | null;
  offering_missing_fields?: string[];
  sync_status?: "synced" | "changes" | "not_synced";
  synced_at?: string | null;
};
type Preview = {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  subaccount_id: string | null;
  include_subaccounts: boolean;
  last_success_at: string | null;
  saved_run_id: string | null;
  saved_revision: string;
  synced_total: number;
  preview: {
    run_id: string;
    expires_at: string;
    observed_at: string;
    total: number;
  } | null;
  preview_expired: boolean;
  source: "preview" | "saved";
  latest_run: {
    id: string;
    status: string;
    trigger: string;
    course_count: number;
    error: string | null;
  } | null;
  schedule: {
    enabled: boolean;
    interval_minutes: number;
    owner_name: string | null;
    owner_active: boolean;
    next_run_at: string | null;
    version: number;
  };
  courses: Course[];
  total: number;
  source_total: number;
  page: number;
  page_size: number;
};
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Not yet";

export function CanvasCourses({ can }: { can: (scope: string) => boolean }) {
  const [data, setData] = useState<Preview>();
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"preview" | "synced">("preview");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revision, refresh] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<CanvasCourseFilters>({
    ...emptyCanvasCourseFilters,
  });
  const [appliedFilters, setAppliedFilters] = useState<CanvasCourseFilters>({
    ...emptyCanvasCourseFilters,
  });
  const [loading, setLoading] = useState(false);
  const requestedPreview = useRef<string | null>(null);
  const automaticPreviewAttempted = useRef(false);
  const commandInFlight = useRef(false);
  const focusReadResult = useRef(false);
  const [interval, setInterval] = useState(60);
  const enableSchedule = useRef<HTMLButtonElement>(null);
  const returnScheduleFocus = useRef(false);
  const sourceHeading = useRef<HTMLHeadingElement>(null);
  const returnPreviewFocus = useRef(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          page: String(page + 1),
          view: viewMode,
          pageSize: String(pageSize),
          ...appliedFilters,
        });
        const result = await api<Preview>(`staff/canvas/courses?${query}`, {
          role: "staff",
        });
        if (!active) return;
        setData(result);
        setError("");
        if (
          requestedPreview.current === result.latest_run?.id &&
          ["succeeded", "failed"].includes(result.latest_run?.status || "")
        ) {
          requestedPreview.current = null;
          returnPreviewFocus.current = focusReadResult.current;
          focusReadResult.current = false;
        }
        if (["pending", "running"].includes(result.latest_run?.status || ""))
          timer = setTimeout(load, 2000);
        else if (result.schedule.enabled) timer = setTimeout(load, 30_000);
      } catch (e) {
        if (active) {
          requestedPreview.current = null;
          setError((e as Error).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, pageSize, appliedFilters, revision, viewMode]);
  useEffect(() => {
    setSelected(new Set());
  }, [data?.preview?.run_id, viewMode]);
  useEffect(() => {
    if (data) setInterval(data.schedule.interval_minutes);
  }, [data?.schedule.interval_minutes]);
  useEffect(() => {
    if (returnScheduleFocus.current && data && !data.schedule.enabled) {
      enableSchedule.current?.focus();
      returnScheduleFocus.current = false;
    }
    if (
      returnPreviewFocus.current &&
      data &&
      !["pending", "running"].includes(data.latest_run?.status || "")
    ) {
      sourceHeading.current?.focus();
      returnPreviewFocus.current = false;
    }
  }, [data]);
  async function command(
    path: string,
    body: object,
    success: string,
    automatic = false,
  ) {
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    if (path === "sync") automaticPreviewAttempted.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        id?: string;
        created_count?: number;
        existing_count?: number;
      }>(`staff/canvas/${path}`, {
        role: "staff",
        body,
      });
      if (path === "sync" && result.id) {
        requestedPreview.current = result.id;
        focusReadResult.current = !automatic;
        if (!automatic) {
          setViewMode("preview");
          setSelected(new Set());
          setPage(0);
          setFilters({ ...emptyCanvasCourseFilters });
          setAppliedFilters({ ...emptyCanvasCourseFilters });
        }
      }
      setMessage(
        result.created_count !== undefined
          ? `${result.created_count} draft offering${result.created_count === 1 ? "" : "s"} created; ${result.existing_count || 0} existing offering${result.existing_count === 1 ? "" : "s"} preserved. Open the offering links to complete missing required information.`
          : success,
      );
      refresh((value) => value + 1);
      return true;
    } catch (e) {
      returnScheduleFocus.current = false;
      returnPreviewFocus.current = false;
      requestedPreview.current = null;
      setError((e as Error).message);
      return false;
    } finally {
      commandInFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      automaticPreviewAttempted.current ||
      !data ||
      busy ||
      viewMode !== "preview" ||
      !data.enabled ||
      !data.configured ||
      !data.connected ||
      !can("canvas:sync")
    )
      return;
    automaticPreviewAttempted.current = true;
    // Reuse a valid preview or follow an existing job. Never retry automatically after failure.
    if (
      data.preview ||
      ["pending", "running"].includes(data.latest_run?.status || "")
    )
      return;
    void command(
      "sync",
      {},
      "Loading a fresh course preview from Canvas.",
      true,
    );
  }, [data, busy, viewMode, can]);
  const reading = ["pending", "running"].includes(
    data?.latest_run?.status || "",
  );
  const canSync = Boolean(
    data?.preview &&
    data.connected &&
    can("canvas:sync") &&
    viewMode === "preview" &&
    !busy &&
    !reading &&
    !loading,
  );
  async function syncCourses(ids: string[]) {
    if (!canSync || !data?.preview || !ids.length) return;
    returnPreviewFocus.current = true;
    if (
      await command(
        `sync-runs/${data.preview.run_id}/sync-courses`,
        { courseIds: ids, savedRevision: data.saved_revision },
        `${ids.length} course${ids.length === 1 ? "" : "s"} imported. Find them under Imported courses.`,
      )
    )
      setSelected(new Set());
  }
  const pageIds = data?.courses.map((course) => course.id) || [];
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  return (
    <Stack spacing={2} sx={{ mt: 2, minWidth: 0, maxWidth: "100%" }}>
      <Typography>
        Course previews load automatically. Import selected courses to create
        unpublished offering drafts, then open them from this list or Admin →
        Offerings to complete required details. Later imports preserve staff
        edits. Canvas courses are unchanged.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert severity="success" role="status">
          {message}
        </Alert>
      )}
      {!data && error && (
        <Button onClick={() => refresh((value) => value + 1)}>
          Retry loading courses
        </Button>
      )}
      {!data && !error && (
        <Typography role="status">Loading Canvas course connection…</Typography>
      )}
      {data && (
        <>
          {data.preview && (
            <Alert severity="info" role="note">
              Course preview: {data.preview.total} courses. Only selected
              courses are imported into the portal database. This preview
              expires at {time(data.preview.expires_at)}.
            </Alert>
          )}
          {data.preview_expired && (
            <Alert severity="info" role="note">
              Your unsaved preview expired or is unavailable. Preview the
              courses again before saving. Previously saved course details are
              unchanged.
            </Alert>
          )}
          {!data.configured && (
            <Alert severity="info" role="note">
              Canvas course reads are not configured yet. Set the subaccount ID
              and enable course reads on the server. Your existing staff OAuth
              key also needs the course-read scopes.
            </Alert>
          )}
          {data.configured && !data.connected && (
            <Alert severity="info" role="note">
              Sign in with Canvas again to authorize course reads for your staff
              account.
            </Alert>
          )}
          <Paper
            variant="outlined"
            sx={{ p: 1.5 }}
            component="section"
            aria-label="Canvas connection"
          >
            <Stack spacing={1}>
              <Stack
                direction="row"
                sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}
              >
                <Typography component="h2" variant="subtitle1">
                  Canvas connection
                </Typography>
                <Chip
                  size="small"
                  label={
                    !data.configured
                      ? "Setup needed"
                      : data.connected
                        ? "Authorized"
                        : "Authorization needed"
                  }
                  variant="outlined"
                />
                <Stack
                  direction="row"
                  sx={{
                    ml: "auto",
                    gap: 0.5,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button
                    size="small"
                    aria-expanded={connectionOpen}
                    aria-controls="canvas-connection-details"
                    onClick={() => setConnectionOpen(!connectionOpen)}
                  >
                    {connectionOpen
                      ? "Hide connection details"
                      : "Connection details"}
                  </Button>
                  <Button
                    size="small"
                    aria-expanded={scheduleOpen}
                    aria-controls="canvas-schedule-settings"
                    onClick={() => setScheduleOpen(!scheduleOpen)}
                  >
                    {scheduleOpen
                      ? "Hide schedule settings"
                      : "Schedule settings"}
                  </Button>
                </Stack>
              </Stack>
              <Typography
                role="status"
                aria-live="polite"
                sx={connectionOpen ? {} : visuallyHidden}
              >
                {data.latest_run
                  ? data.preview?.run_id === data.latest_run.id
                    ? `Preview ready · ${data.preview.total} courses · ${data.synced_total || 0} imported`
                    : `Latest read: ${data.latest_run.status}${data.latest_run.status === "succeeded" ? ` · ${data.latest_run.course_count} courses` : ""}`
                  : "No course reads have run yet."}
              </Typography>
              {data.latest_run?.error && (
                <Alert severity="error">{data.latest_run.error}</Alert>
              )}
              {data.enabled && !data.connected && (
                <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                  {data.enabled && !data.connected && (
                    <Button href="/api/auth/canvas/start" variant="outlined">
                      Authorize course reads
                    </Button>
                  )}
                </Stack>
              )}
              <Collapse
                in={connectionOpen}
                id="canvas-connection-details"
                unmountOnExit
              >
                <Stack spacing={1}>
                  <Typography>
                    Subaccount: {data.subaccount_id || "Not set"}
                    {data.subaccount_id
                      ? data.include_subaccounts
                        ? " · Includes nested subaccounts"
                        : " · Direct courses only"
                      : ""}
                  </Typography>
                  <Typography>
                    Last saved preview: {time(data.last_success_at)}
                  </Typography>
                  <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                    <Button
                      onClick={() => refresh((value) => value + 1)}
                      disabled={busy}
                    >
                      Refresh status
                    </Button>
                    {data.connected && can("canvas:sync") && (
                      <Button
                        onClick={() =>
                          command(
                            "disconnect",
                            {},
                            "Your Canvas API authorization was disconnected. Staff sign-in is unchanged.",
                          )
                        }
                        disabled={busy || reading}
                      >
                        Disconnect my authorization
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Collapse>
            </Stack>
          </Paper>
          <Collapse
            in={scheduleOpen}
            id="canvas-schedule-settings"
            unmountOnExit
          >
            <Paper
              variant="outlined"
              sx={{ p: 2 }}
              component="section"
              aria-label="Scheduled course reads"
            >
              <Stack spacing={1.5}>
                <Typography component="h2" variant="h6">
                  Scheduled course previews
                </Typography>
                <Typography>
                  {data.schedule.enabled
                    ? `Enabled · Authorized by ${data.schedule.owner_name || "a staff member"} · Next read: ${time(data.schedule.next_run_at)}`
                    : "Paused"}
                </Typography>
                <Typography variant="body2">
                  Scheduled runs create previews for review; course details are
                  saved only after you import selected courses. Scheduled reads
                  use the selected staff member’s Canvas authorization after
                  portal sign-out. Deactivation, loss of portal permissions or
                  revoked Canvas authorization stops those reads.
                </Typography>
                {can("canvas:manage") && (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    sx={{ gap: 1, alignItems: { sm: "center" } }}
                  >
                    <TextField
                      select
                      label="Read courses"
                      value={interval}
                      onChange={(event) =>
                        setInterval(Number(event.target.value))
                      }
                      sx={{ minWidth: 200 }}
                    >
                      {[15, 30, 60, 120, 1440].map((minutes) => (
                        <MenuItem key={minutes} value={minutes}>
                          {minutes === 1440
                            ? "Daily"
                            : `Every ${minutes} minutes`}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      ref={enableSchedule}
                      disabled={
                        busy ||
                        !data.configured ||
                        !data.connected ||
                        !data.last_success_at
                      }
                      onClick={() =>
                        command(
                          "schedule",
                          {
                            enabled: true,
                            intervalMinutes: interval,
                            version: data.schedule.version,
                          },
                          "Scheduled reads will use your Canvas authorization.",
                        )
                      }
                    >
                      Enable using my Canvas account
                    </Button>
                    {data.schedule.enabled && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          returnScheduleFocus.current = true;
                          void command(
                            "schedule",
                            {
                              enabled: false,
                              intervalMinutes: interval,
                              version: data.schedule.version,
                            },
                            "Scheduled course reads paused.",
                          );
                        }}
                      >
                        Pause schedule
                      </Button>
                    )}
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Collapse>
          <Tabs
            value={viewMode}
            onChange={(_, value) => {
              setViewMode(value);
              setPage(0);
              setSelected(new Set());
              setFilters({ ...emptyCanvasCourseFilters });
              setAppliedFilters({ ...emptyCanvasCourseFilters });
            }}
            aria-label="Canvas course lists"
          >
            <Tab
              value="preview"
              label="Course preview"
              id="canvas-tab-preview"
              aria-controls="canvas-course-list"
            />
            <Tab
              value="synced"
              label={`Imported courses (${data.synced_total || 0})`}
              id="canvas-tab-synced"
              aria-controls="canvas-course-list"
            />
          </Tabs>
          <Box
            role="tabpanel"
            id="canvas-course-list"
            aria-labelledby={`canvas-tab-${viewMode}`}
            sx={{ minWidth: 0, maxWidth: "100%" }}
          >
            <Typography
              component="h2"
              variant="h6"
              id="canvas-course-preview-title"
              ref={sourceHeading}
              tabIndex={-1}
            >
              {viewMode === "synced" ? "Imported courses" : "Course preview"} (
              {data.source_total ?? data.total})
            </Typography>

            <Typography sx={{ mb: 2 }}>
              {viewMode === "synced"
                ? "These courses are imported. Open each offering to complete required information before publishing."
                : data.preview
                  ? `Select courses to import. Existing offerings and staff edits are preserved. This preview expires at ${time(data.preview.expires_at)}.`
                  : "A course preview loads automatically when Canvas access is available. Use Refresh from Canvas to try again."}
            </Typography>
            <Box
              component="form"
              aria-label="Filter Canvas courses"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(0);
                setSelected(new Set());
                setAppliedFilters({ ...filters });
              }}
              sx={{ my: 2 }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{
                  gap: 1.5,
                  flexWrap: "wrap",
                  alignItems: { sm: "flex-start" },
                }}
              >
                <TextField
                  size="small"
                  label="Course title keywords"
                  value={filters.title}
                  onChange={(event) =>
                    setFilters({ ...filters, title: event.target.value })
                  }
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                  sx={{ flex: { sm: "1 1 220px" } }}
                />
                <TextField
                  size="small"
                  select
                  label="Publish status"
                  slotProps={{
                    select: { native: true },
                    inputLabel: { shrink: true },
                  }}
                  value={filters.status}
                  onChange={(event) =>
                    setFilters({ ...filters, status: event.target.value })
                  }
                  sx={{ minWidth: 170 }}
                >
                  <option value="all">All statuses</option>
                  <option value="published">Published</option>
                  <option value="concluded">Concluded</option>
                  <option value="unpublished">Unpublished</option>
                </TextField>
                {(
                  [
                    ["startFrom", "Start date from"],
                    ["startTo", "Start date to"],
                    ["endFrom", "End date from"],
                    ["endTo", "End date to"],
                  ] as const
                ).map(([key, label]) => (
                  <TextField
                    key={key}
                    size="small"
                    type="date"
                    label={label}
                    value={filters[key]}
                    onChange={(event) =>
                      setFilters({ ...filters, [key]: event.target.value })
                    }
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: {
                        ...(key === "startTo"
                          ? { min: filters.startFrom }
                          : key === "endTo"
                            ? { min: filters.endFrom }
                            : {}),
                      },
                    }}
                  />
                ))}

                <Button type="submit" variant="outlined" disabled={loading}>
                  Apply filters
                </Button>
                <Button
                  onClick={() => {
                    setSelected(new Set());
                    setFilters({ ...emptyCanvasCourseFilters });
                    setAppliedFilters({ ...emptyCanvasCourseFilters });
                    setPage(0);
                  }}
                >
                  Clear filters
                </Button>
                {can("canvas:sync") && (
                  <Button
                    variant="contained"
                    sx={{
                      ml: { sm: "auto" },
                      alignSelf: { xs: "flex-end", sm: "auto" },
                    }}
                    disabled={
                      !data.enabled || !data.configured || !data.connected
                    }
                    aria-disabled={reading || busy || loading}
                    onClick={() =>
                      !reading &&
                      !loading &&
                      command(
                        "sync",
                        {},
                        "Course preview requested. Review the list and select courses to import.",
                      )
                    }
                  >
                    {reading ? "Reading courses…" : "Refresh from Canvas"}
                  </Button>
                )}
              </Stack>
              <Typography variant="caption" component="p" sx={{ mt: 1 }}>
                Dates use Eastern Time; missing dates are excluded only when
                that date is filtered. Current discovery includes published
                courses and concluded courses. Filters affect this view only.
              </Typography>
            </Box>
            {viewMode === "preview" && can("canvas:sync") && (
              <Stack
                direction="row"
                sx={{ gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1 }}
              >
                <Button
                  variant="contained"
                  aria-describedby="canvas-import-help"
                  disabled={!canSync || selected.size === 0}
                  onClick={() => void syncCourses([...selected])}
                >
                  Import selected
                </Button>
                <Typography role="status">{selected.size} selected</Typography>
                {selected.size > 0 && (
                  <Button
                    disabled={busy}
                    onClick={() => setSelected(new Set())}
                  >
                    Clear selection
                  </Button>
                )}
                <Typography variant="caption">
                  Select all selects this page. Selections are kept across
                  pages.
                </Typography>
                <Typography
                  id="canvas-import-help"
                  variant="body2"
                  sx={{ width: "100%" }}
                >
                  Creates drafts for new courses and refreshes Canvas source
                  details for existing mappings. Staff edits are preserved.
                </Typography>
              </Stack>
            )}
            <Typography role="status" aria-live="polite">
              {loading
                ? "Loading courses…"
                : `${data.total} matching courses of ${data.source_total ?? data.total}`}
            </Typography>
            {!data.total ? (
              <Typography>
                {(data.source_total ?? data.total) > 0
                  ? "No courses match these filters. Clear filters to see the full list."
                  : viewMode === "synced"
                    ? "No courses have been imported yet. Select courses from Course preview to create offering drafts."
                    : "Use Refresh from Canvas to load courses for review before importing."}
              </Typography>
            ) : (
              <Box sx={{ minWidth: 0, maxWidth: "100%" }}>
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  tabIndex={0}
                  role="region"
                  aria-label="Canvas course preview table"
                  sx={{
                    "&:focus-visible": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Table aria-label="Published Canvas courses">
                    <TableHead>
                      <TableRow>
                        {viewMode === "preview" && can("canvas:sync") && (
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={
                                pageIds.length > 0 &&
                                selectedOnPage === pageIds.length
                              }
                              indeterminate={
                                selectedOnPage > 0 &&
                                selectedOnPage < pageIds.length
                              }
                              disabled={!canSync || !pageIds.length}
                              slotProps={{
                                input: {
                                  "aria-label":
                                    "Select all courses on this page",
                                },
                              }}
                              onChange={(_, checked) =>
                                setSelected((current) => {
                                  const next = new Set(current);
                                  pageIds.forEach((id) =>
                                    checked ? next.add(id) : next.delete(id),
                                  );
                                  return next;
                                })
                              }
                            />
                          </TableCell>
                        )}
                        <TableCell>Course</TableCell>
                        <TableCell>Canvas ID</TableCell>
                        <TableCell>Subaccount</TableCell>
                        <TableCell>Start date</TableCell>
                        <TableCell>End date</TableCell>
                        <TableCell>Publish status</TableCell>
                        <TableCell>Import status</TableCell>
                        <TableCell>Last imported</TableCell>
                        <TableCell>Offering</TableCell>
                        {can("canvas:sync") && <TableCell>Actions</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.courses.map((course) => (
                        <TableRow key={course.id}>
                          {viewMode === "preview" && can("canvas:sync") && (
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={selected.has(course.id)}
                                disabled={!canSync}
                                slotProps={{
                                  input: {
                                    "aria-label": `Select ${course.name} (Canvas ID ${course.id})`,
                                  },
                                }}
                                onChange={(_, checked) =>
                                  setSelected((current) => {
                                    const next = new Set(current);
                                    checked
                                      ? next.add(course.id)
                                      : next.delete(course.id);
                                    return next;
                                  })
                                }
                              />
                            </TableCell>
                          )}
                          <TableCell component="th" scope="row">
                            <Link
                              href={course.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {course.name}
                              <Box
                                component="span"
                                sx={{
                                  position: "absolute",
                                  width: "1px",
                                  height: "1px",
                                  overflow: "hidden",
                                  clipPath: "inset(50%)",
                                }}
                              >
                                {" "}
                                (opens Canvas in a new tab)
                              </Box>
                            </Link>
                            <Typography variant="body2" color="text.secondary">
                              {course.course_code}
                            </Typography>
                          </TableCell>
                          <TableCell>{course.id}</TableCell>
                          <TableCell>{course.account_id}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>
                            {canvasCourseDate(course.start_at)}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>
                            {canvasCourseDate(course.end_at)}
                          </TableCell>
                          <TableCell>
                            {course.workflow_state === "completed"
                              ? "Concluded · Review before mapping"
                              : course.workflow_state === "available"
                                ? "Published"
                                : [
                                      "unpublished",
                                      "created",
                                      "claimed",
                                    ].includes(course.workflow_state)
                                  ? "Unpublished"
                                  : "Unknown"}
                          </TableCell>
                          <TableCell>
                            {course.sync_status === "synced"
                              ? "Imported"
                              : course.sync_status === "changes"
                                ? "Changes available"
                                : "Not imported"}
                          </TableCell>
                          <TableCell>
                            {course.synced_at
                              ? time(course.synced_at)
                              : "Not yet"}
                          </TableCell>
                          <TableCell>
                            {course.offering_id ? (
                              <Stack spacing={0.5}>
                                <Link
                                  href={`/staff/offerings/${course.offering_id}`}
                                  aria-label={`Open offering ${course.offering_title || course.name}`}
                                >
                                  Open offering
                                </Link>
                                {Boolean(
                                  course.offering_missing_fields?.length,
                                ) && (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    Missing required information:{" "}
                                    {course.offering_missing_fields!.join(", ")}
                                  </Typography>
                                )}
                              </Stack>
                            ) : (
                              "Not created"
                            )}
                          </TableCell>
                          {can("canvas:sync") && (
                            <TableCell>
                              <Button
                                size="small"
                                disabled={!canSync}
                                aria-label={`${course.offering_id ? "Refresh source details for" : "Create offering draft for"} ${course.name} (Canvas ID ${course.id})`}
                                onClick={() => void syncCourses([course.id])}
                              >
                                {course.offering_id
                                  ? "Refresh source details"
                                  : "Create offering draft"}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={data.total}
                  page={page}
                  rowsPerPage={pageSize}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  onRowsPerPageChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(0);
                  }}
                  onPageChange={(_, next) => setPage(next)}
                />
              </Box>
            )}
          </Box>
        </>
      )}
    </Stack>
  );
}
