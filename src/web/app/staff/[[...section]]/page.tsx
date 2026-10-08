"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  MenuItem,
  Snackbar,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import MenuIcon from "@mui/icons-material/Menu";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import ExploreIcon from "@mui/icons-material/Explore";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import SchoolIcon from "@mui/icons-material/School";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import BadgeIcon from "@mui/icons-material/Badge";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import HistoryIcon from "@mui/icons-material/History";
import { StaffNav, StaffNavItem } from "../../../components/staff-nav";
import {
  api,
  date,
  courseStart,
  money,
  Offering,
  Learning,
} from "../../../components/api";
import { LoadingCards } from "../../../components/loading";
import {
  RoleChips,
  StaffMember,
  StaffRole,
  StaffSignIn,
  useStaffSession,
} from "../../../components/staff-session";
import { StaffRoles, StaffUsers } from "../../../components/staff-admin";
import { StaffCollections } from "../../../components/staff-collections";
import { StaffExplore } from "../../../components/staff-explore";
import { StaffTransactions } from "../../../components/staff-transactions";
import { StaffLearners } from "../../../components/staff-learners";
import { StaffDashboard } from "../../../components/staff-dashboard";
import {
  OfferingForm,
  StaffOffering,
  UnpublishDialog,
} from "../../../components/offering-form";
import {
  SortableHeader,
  SortSelect,
  TablePager,
  useTableView,
} from "../../../components/table-view";
import { actorLabels, auditLabels } from "../../../components/audit-labels";
import {
  ExceptionRow,
  StaffExceptions,
} from "../../../components/staff-exceptions";
type AuditEntry = {
  actor: string;
  action: string;
  created_at: string;
  actor_email: string | null;
  offering_title: string | null;
  subject_email: string | null;
};
type ApprovalRequest = Learning & {
  created_at: string;
  learner_email: string | null;
  approval_valid_days: number;
};
const actorLabel = (entry: AuditEntry) =>
  entry.actor_email ?? actorLabels[entry.actor] ?? entry.actor;
const eventLabel = (entry: AuditEntry) =>
  auditLabels[entry.action] ?? entry.action;
const eventDetail = (entry: AuditEntry) =>
  [
    entry.offering_title,
    entry.subject_email && entry.subject_email !== entry.actor_email
      ? `for ${entry.subject_email}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
// Draft = never published; Unpublished = removed from the catalog after publishing.
type OfferingStatus = "draft" | "published" | "unpublished";
const offeringStatus = (c: Offering): OfferingStatus =>
  c.published ? "published" : c.unpublished_at ? "unpublished" : "draft";
const statusOrder: OfferingStatus[] = ["draft", "unpublished", "published"];
const statusLabels: Record<OfferingStatus, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Unpublished",
};
const statusColors = {
  draft: "default",
  published: "success",
  unpublished: "warning",
} as const;
// Tables on tablet/desktop; stacked cards on phones where columns would scroll.
const wideOnly = { display: { xs: "none", sm: "block" } };
const phoneOnly = { display: { xs: "block", sm: "none" } };
// Each staff section has its own address: /staff (Dashboard), /staff/offerings, ...
export default function Staff({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = use(params);
  const session = useStaffSession();
  if (!session.ready)
    return <LoadingCards label="Loading staff session" count={1} />;
  if (!session.member) return <StaffSignIn onSignIn={session.signIn} />;
  // Remount per staff member so switching people never keeps their data or tab.
  return (
    <StaffWorkspace
      key={session.member.id}
      session={session}
      slug={section?.[0] ?? ""}
    />
  );
}
type Session = ReturnType<typeof useStaffSession>;
type TabName =
  | "dashboard"
  | "offerings"
  | "collections"
  | "explore"
  | "transactions"
  | "approvals"
  | "exceptions"
  | "activity"
  | "learners"
  | "users"
  | "roles";

// Sidebar groups and section addresses. "users" is the Staff section, at /staff/staff.
const sections: {
  tab: TabName;
  slug: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  scope?: string;
}[] = [
  {
    tab: "dashboard",
    slug: "",
    label: "Dashboard",
    group: "Overview",
    icon: <SpaceDashboardIcon />,
  },
  {
    tab: "offerings",
    slug: "offerings",
    label: "Offerings",
    group: "Catalog",
    icon: <MenuBookIcon />,
  },
  {
    tab: "collections",
    slug: "collections",
    label: "Collections",
    group: "Catalog",
    icon: <CollectionsBookmarkIcon />,
  },
  {
    tab: "explore",
    slug: "explore",
    label: "Explore page",
    group: "Catalog",
    icon: <ExploreIcon />,
  },
  {
    tab: "approvals",
    slug: "approvals",
    label: "Approvals",
    group: "Learners",
    icon: <FactCheckIcon />,
  },
  {
    tab: "exceptions",
    slug: "exceptions",
    label: "Exceptions",
    group: "Learners",
    icon: <ReportProblemIcon />,
  },
  {
    tab: "learners",
    slug: "learners",
    label: "Learners",
    group: "Learners",
    icon: <SchoolIcon />,
  },
  {
    tab: "transactions",
    slug: "transactions",
    label: "Transactions",
    group: "Finance",
    icon: <ReceiptLongIcon />,
    scope: "payments:read",
  },
  {
    tab: "users",
    slug: "staff",
    label: "Staff",
    group: "Administration",
    icon: <BadgeIcon />,
    scope: "staff:manage",
  },
  {
    tab: "roles",
    slug: "roles",
    label: "Roles",
    group: "Administration",
    icon: <AdminPanelSettingsIcon />,
  },
  {
    tab: "activity",
    slug: "activity",
    label: "Activity",
    group: "Administration",
    icon: <HistoryIcon />,
  },
];
const sectionHref = (slug: string) => (slug ? `/staff/${slug}` : "/staff");
function StaffWorkspace({ session, slug }: { session: Session; slug: string }) {
  const member = session.member as StaffMember;
  const { can } = session;
  const router = useRouter();
  const allowed = sections.filter((s) => !s.scope || can(s.scope));
  // Unknown or not-permitted addresses show the Dashboard.
  const currentSection = allowed.find((s) => s.slug === slug) ?? allowed[0];
  const tab = currentSection.tab;
  const setTab = (next: TabName) =>
    router.push(sectionHref(sections.find((s) => s.tab === next)?.slug ?? ""));
  const [menuOpen, setMenuOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // The Staff section's role filter lives in the address (?role=finance), so
  // Roles → "Manage people" links survive navigation and can be shared.
  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get("role");
    setRoleFilterState(role ? (role as StaffRole) : "all");
  }, [slug]);
  const setRoleFilter = (role: StaffRole | "all") => {
    setRoleFilterState(role);
    window.history.replaceState(
      null,
      "",
      role === "all" ? window.location.pathname : `?role=${role}`,
    );
  };
  const firstRender = useRef(true);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ce-staff-nav") === "collapsed");
    } catch {
      /* Storage may be unavailable; the menu starts expanded. */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        localStorage.setItem("ce-staff-nav", value ? "expanded" : "collapsed");
      } catch {
        /* Keep the choice for this visit only. */
      }
      return !value;
    });
  }
  // Unknown or not-permitted addresses are replaced by the Dashboard's.
  useEffect(() => {
    if (slug && currentSection.slug !== slug) router.replace("/staff");
  }, [slug, currentSection.slug, router]);
  // Moving between sections moves focus to the new heading and updates the title.
  useEffect(() => {
    document.title = `${currentSection.label} · Staff | Continuing Education`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [currentSection.label]);
  const canCatalog = can("catalog:write");
  const canDecide = can("approvals:decide");
  const [roleFilter, setRoleFilterState] = useState<StaffRole | "all">("all"),
    [courses, setCourses] = useState<StaffOffering[]>([]),
    [requests, setRequests] = useState<ApprovalRequest[]>([]),
    [report, setReport] = useState<{
      simulated_orders: number;
      simulated_enrollments: number;
      pending_operations: number;
      open_exceptions: number;
      audit: AuditEntry[];
    }>(),
    [loaded, setLoaded] = useState(false),
    [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<StaffOffering>(),
    [unpublishing, setUnpublishing] = useState<StaffOffering>(),
    [exceptions, setExceptions] = useState<ExceptionRow[]>([]),
    [outcome, setOutcome] = useState("normal"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState<"all" | OfferingStatus>("all"),
    [approvalQuery, setApprovalQuery] = useState(""),
    [activityQuery, setActivityQuery] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const [c, r, p, x, sim] = await Promise.all([
      api<StaffOffering[]>("staff/offerings", { role: "staff" }),
      api<ApprovalRequest[]>("approval-requests", { role: "staff" }),
      api<typeof report>("reconciliation", { role: "staff" }),
      api<ExceptionRow[]>("exceptions", { role: "staff" }),
      api<{ provisioningOutcome: string }>("prototype/simulation", {
        role: "staff",
      }),
    ]);
    setCourses(c);
    setRequests(r);
    setReport(p);
    setExceptions(x);
    setOutcome(sim.provisioningOutcome);
    setLoaded(true);
  }
  const byText = (a: string, b: string) => a.localeCompare(b);
  const offeringsView = useTableView(courses, {
    compare: {
      title: (a, b) => byText(a.title, b.title),
      // Self-paced courses have no start date and sort first.
      start: (a, b) =>
        byText(a.start_date ?? "", b.start_date ?? "") ||
        byText(a.title, b.title),
      price: (a, b) => a.price_cents - b.price_cents,
      seats: (a, b) => a.seats_available - b.seats_available,
      status: (a, b) =>
        statusOrder.indexOf(offeringStatus(a)) -
        statusOrder.indexOf(offeringStatus(b)),
    },
    initial: { key: "start", direction: "asc" },
    matches: (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || offeringStatus(c) === status),
  });
  const approvalsView = useTableView(requests, {
    compare: {
      learner: (a, b) => byText(a.learner_email ?? "", b.learner_email ?? ""),
      title: (a, b) => byText(a.title, b.title),
      requested: (a, b) => byText(a.created_at, b.created_at),
    },
    initial: { key: "requested", direction: "asc" },
    matches: (r) =>
      `${r.learner_email ?? ""} ${r.title}`
        .toLowerCase()
        .includes(approvalQuery.toLowerCase()),
  });
  const activityView = useTableView(report?.audit ?? [], {
    compare: {
      time: (a, b) => byText(a.created_at, b.created_at),
      event: (a, b) => byText(eventLabel(a), eventLabel(b)),
      by: (a, b) => byText(actorLabel(a), actorLabel(b)),
    },
    initial: { key: "time", direction: "desc" },
    matches: (entry) =>
      `${eventLabel(entry)} ${eventDetail(entry)} ${actorLabel(entry)}`
        .toLowerCase()
        .includes(activityQuery.toLowerCase()),
  });
  const publish = (c: Offering) =>
    action(
      `offerings/${c.id}/publish`,
      { version: c.version },
      "Sample offering published. Real Canvas mapping checks are deferred.",
    );
  const decide = (r: ApprovalRequest, decision: "approved" | "declined") =>
    action(
      `approval-requests/${r.id}/decision`,
      { decision },
      decision === "approved"
        ? `Request approved. The learner has ${r.approval_valid_days} ${r.approval_valid_days === 1 ? "day" : "days"} to reserve a seat.`
        : "Request declined.",
    );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function action(path: string, body: unknown, text: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(path, { role: "staff", body });
      await refresh();
      setMessage(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rowActions = (c: StaffOffering) =>
    !canCatalog ? null : (
      <>
        <Button
          onClick={() => {
            setEditing(c);
            setFormOpen(true);
          }}
          aria-label={`Edit ${c.title}`}
        >
          Edit
        </Button>
        {c.published ? (
          <Button
            color="error"
            onClick={() => setUnpublishing(c)}
            aria-label={`Unpublish ${c.title}`}
          >
            Unpublish
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => publish(c)}
            aria-label={`Publish ${c.title}`}
          >
            Publish
          </Button>
        )}
      </>
    );
  const navItems: StaffNavItem[] = allowed.map((s) => ({
    slug: s.slug,
    href: sectionHref(s.slug),
    label: s.label,
    group: s.group,
    icon: s.icon,
    count:
      s.tab === "approvals"
        ? requests.length
        : s.tab === "exceptions"
          ? exceptions.length
          : undefined,
  }));
  return (
    <Box sx={{ display: "flex", alignItems: "stretch" }}>
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "block" },
          width: collapsed ? 72 : 248,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          maxHeight: "100vh",
          overflowY: "auto",
          transition: "width .2s",
        }}
      >
        <StaffNav
          items={navItems}
          current={currentSection.slug}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
        />
      </Box>
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        sx={{ display: { md: "none" } }}
        slotProps={{ paper: { sx: { width: 280 } } }}
      >
        <StaffNav
          items={navItems}
          current={currentSection.slug}
          onNavigate={() => setMenuOpen(false)}
        />
      </Drawer>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          px: { xs: 2, sm: 3, lg: 4 },
          py: { xs: 2, md: 3 },
        }}
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          sx={{
            justifyContent: "space-between",
            alignItems: { lg: "flex-start" },
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Button
              variant="outlined"
              startIcon={<MenuIcon />}
              onClick={() => setMenuOpen(true)}
              sx={{ display: { md: "none" }, mb: 1.5 }}
            >
              Staff sections
            </Button>
            <Typography
              variant="overline"
              color="text.secondary"
              component="p"
              sx={{ lineHeight: 1.5 }}
            >
              Staff workspace
            </Typography>
            <Typography
              variant="h4"
              component="h1"
              ref={heading}
              tabIndex={-1}
              sx={{ "&:focus": { outline: "none" } }}
            >
              {currentSection.label}
            </Typography>
          </Box>
          <Paper
            variant="outlined"
            component="section"
            aria-label="Staff session"
            sx={{ p: 1.5, maxWidth: { lg: 640 } }}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ gap: 1.5, alignItems: { sm: "center" } }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  Signed in as <strong>{member.display_name}</strong>{" "}
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                  >
                    ({member.email})
                  </Typography>
                </Typography>
                <Box sx={{ mt: 0.75 }}>
                  <RoleChips roles={member.roles} />
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.75 }}
                >
                  Mock sign-in: your roles decide what you can do. University
                  SSO replaces it later.
                </Typography>
              </Box>
              <Stack
                direction="row"
                sx={{ gap: 1, flexShrink: 0, flexWrap: "wrap" }}
              >
                <Button variant="outlined" onClick={session.signOut}>
                  Switch staff member
                </Button>
                <Button
                  href="http://localhost:3001/api/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  API docs
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Stack>
        {error && !formOpen && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Snackbar
          open={Boolean(message)}
          autoHideDuration={6000}
          onClose={() => setMessage("")}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity="success"
            variant="filled"
            onClose={() => setMessage("")}
          >
            {message}
          </Alert>
        </Snackbar>
        {!loaded && !error && <LoadingCards label="Loading staff workspace" />}
        {loaded && tab === "offerings" && (
          <>
            <Stack
              direction="row"
              sx={{
                mb: 2,
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h6" component="h2">
                Course offerings
              </Typography>
              {canCatalog && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setError("");
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  New offering
                </Button>
              )}
            </Stack>
            {!canCatalog && (
              <Alert severity="info" role="note" sx={{ mb: 2 }}>
                View only: creating, editing and publishing offerings requires
                the Catalog manager role.
              </Alert>
            )}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ gap: 2, mb: 2 }}
            >
              <TextField
                label="Search offerings"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="all">All statuses</MenuItem>
                <MenuItem value="published">Published</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="unpublished">Unpublished</MenuItem>
              </TextField>
              <SortSelect
                view={offeringsView}
                options={{
                  "start:asc": "Soonest start",
                  "title:asc": "Title A–Z",
                  "price:asc": "Price: low to high",
                  "price:desc": "Price: high to low",
                  "seats:asc": "Fewest seats left",
                  "status:asc": "Drafts first",
                  "status:desc": "Published first",
                }}
              />
            </Stack>
            <Typography
              variant="body2"
              color="text.secondary"
              aria-live="polite"
              sx={{ mb: 1.5 }}
            >
              {offeringsView.count} of {offeringsView.total} offerings
            </Typography>
            <Stack spacing={1.5} sx={phoneOnly}>
              {offeringsView.visible.map((c) => (
                <Paper key={c.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", gap: 1 }}
                  >
                    <Typography variant="subtitle1" component="h3">
                      {c.title}
                    </Typography>
                    <Chip
                      label={statusLabels[offeringStatus(c)]}
                      variant="outlined"
                      color={statusColors[offeringStatus(c)]}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {c.category}
                    {c.approval_required ? " · Approval required" : ""}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {courseStart(c)}
                    {c.enrollment_closes_on
                      ? ` · enrollment ${c.enrollment_open ? "closes" : "closed"} ${date(c.enrollment_closes_on)}`
                      : ""}{" "}
                    · {money(c.price_cents)} · {c.seats_available} /{" "}
                    {c.capacity} seats
                  </Typography>
                  <Stack direction="row" sx={{ gap: 1, mt: 1.5 }}>
                    {rowActions(c)}
                  </Stack>
                </Paper>
              ))}
            </Stack>
            <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
              <Table aria-label="Course offerings">
                <TableHead>
                  <TableRow>
                    <SortableHeader
                      view={offeringsView}
                      column="title"
                      label="Offering"
                    />
                    <SortableHeader
                      view={offeringsView}
                      column="start"
                      label="Schedule"
                    />
                    <SortableHeader
                      view={offeringsView}
                      column="price"
                      label="Price"
                    />
                    <SortableHeader
                      view={offeringsView}
                      column="seats"
                      label="Seats"
                    />
                    <SortableHeader
                      view={offeringsView}
                      column="status"
                      label="Status"
                    />
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {offeringsView.visible.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2">{c.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.category}
                          {c.approval_required ? " · Approval required" : ""}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {courseStart(c)}
                        {c.enrollment_closes_on && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            Enrollment {c.enrollment_open ? "closes" : "closed"}{" "}
                            {date(c.enrollment_closes_on)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{money(c.price_cents)}</TableCell>
                      <TableCell>
                        {c.seats_available} / {c.capacity}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={statusLabels[offeringStatus(c)]}
                          variant="outlined"
                          color={statusColors[offeringStatus(c)]}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" sx={{ gap: 0.5 }}>
                          {rowActions(c)}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePager view={offeringsView} label="Offerings" />
          </>
        )}
        {loaded && tab === "approvals" && (
          <>
            <Stack
              direction="row"
              sx={{
                mb: 2,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="h6" component="h2">
                Approval requests
              </Typography>
              <Button
                onClick={() => refresh().catch((e) => setError(e.message))}
              >
                Refresh
              </Button>
            </Stack>
            {requests.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 4 }}>
                <Typography>No requests awaiting approval.</Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  Try requesting Healthcare Communication from the catalog.
                </Typography>
              </Paper>
            ) : (
              <>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  sx={{ gap: 2, mb: 2 }}
                >
                  <TextField
                    label="Search requests"
                    placeholder="Learner email or course"
                    value={approvalQuery}
                    onChange={(e) => setApprovalQuery(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <SortSelect
                    view={approvalsView}
                    options={{
                      "requested:asc": "Oldest first",
                      "requested:desc": "Newest first",
                      "learner:asc": "Learner A–Z",
                      "title:asc": "Course A–Z",
                    }}
                  />
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  aria-live="polite"
                  sx={{ mb: 1.5 }}
                >
                  {approvalsView.count} of {approvalsView.total} requests
                </Typography>
                <Stack spacing={1.5} sx={phoneOnly}>
                  {approvalsView.visible.map((r) => (
                    <Paper key={r.id} variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle1" component="h3">
                        {r.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {r.learner_email || "Legacy demo learner"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Requested {new Date(r.created_at).toLocaleDateString()}
                      </Typography>
                      {canDecide ? (
                        <Stack direction="row" sx={{ gap: 1, mt: 1.5 }}>
                          <Button
                            disabled={busy}
                            variant="outlined"
                            onClick={() => decide(r, "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            disabled={busy}
                            color="error"
                            onClick={() => decide(r, "declined")}
                          >
                            Decline
                          </Button>
                        </Stack>
                      ) : (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 1.5 }}
                        >
                          Deciding requires the Approver role.
                        </Typography>
                      )}
                    </Paper>
                  ))}
                </Stack>
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={wideOnly}
                >
                  <Table aria-label="Approval requests">
                    <TableHead>
                      <TableRow>
                        <SortableHeader
                          view={approvalsView}
                          column="learner"
                          label="Learner"
                        />
                        <SortableHeader
                          view={approvalsView}
                          column="title"
                          label="Offering"
                        />
                        <SortableHeader
                          view={approvalsView}
                          column="requested"
                          label="Requested"
                        />
                        <TableCell>Decision</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {approvalsView.visible.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell sx={{ overflowWrap: "anywhere" }}>
                            {r.learner_email || "Legacy demo learner"}
                            <Typography
                              variant="caption"
                              sx={{
                                display: "block",
                              }}
                            >
                              Demo learner
                            </Typography>
                          </TableCell>
                          <TableCell>{r.title}</TableCell>
                          <TableCell>
                            {new Date(r.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {canDecide ? (
                              <Stack
                                direction="row"
                                sx={{
                                  gap: 1,
                                }}
                              >
                                <Button
                                  disabled={busy}
                                  variant="outlined"
                                  onClick={() => decide(r, "approved")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  disabled={busy}
                                  color="error"
                                  onClick={() => decide(r, "declined")}
                                >
                                  Decline
                                </Button>
                              </Stack>
                            ) : (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Approver role required
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePager view={approvalsView} label="Approval requests" />
              </>
            )}
          </>
        )}
        {loaded && tab === "exceptions" && (
          <StaffExceptions
            canResolve={can("exceptions:resolve")}
            canSimulate={can("prototype:simulate")}
            rows={exceptions}
            outcome={outcome}
            onChanged={async (text) => {
              await refresh().catch((e) => setError(e.message));
              setMessage(text);
            }}
          />
        )}
        {loaded && tab === "activity" && (
          <>
            <Stack
              direction="row"
              sx={{
                mb: 2,
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h6" component="h2">
                Workflow activity
              </Typography>
              <Button
                onClick={() => refresh().catch((e) => setError(e.message))}
              >
                Refresh
              </Button>
            </Stack>
            <Typography sx={{ mb: 2 }} color="text.secondary">
              {report?.simulated_orders || 0} simulated orders ·{" "}
              {report?.simulated_enrollments || 0} simulated enrollments ·{" "}
              {report?.pending_operations || 0} pending operations ·{" "}
              {report?.open_exceptions || 0} open exceptions
            </Typography>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ gap: 2, mb: 2 }}
            >
              <TextField
                label="Search activity"
                placeholder="Event, course or learner"
                value={activityQuery}
                onChange={(e) => setActivityQuery(e.target.value)}
                sx={{ flex: 1 }}
              />
              <SortSelect
                view={activityView}
                options={{
                  "time:desc": "Newest first",
                  "time:asc": "Oldest first",
                  "event:asc": "Event A–Z",
                  "by:asc": "Actor A–Z",
                }}
              />
            </Stack>
            <Typography
              variant="body2"
              color="text.secondary"
              aria-live="polite"
              sx={{ mb: 1.5 }}
            >
              {activityView.count} of {activityView.total} recent events
            </Typography>
            <Stack spacing={1.5} sx={phoneOnly}>
              {activityView.visible.map((entry, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" component="p">
                    {eventLabel(entry)}
                  </Typography>
                  {eventDetail(entry) && (
                    <Typography variant="body2">
                      {eventDetail(entry)}
                    </Typography>
                  )}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    {actorLabel(entry)} ·{" "}
                    {new Date(entry.created_at).toLocaleString()}
                  </Typography>
                </Paper>
              ))}
            </Stack>
            <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
              <Table aria-label="Audit activity">
                <TableHead>
                  <TableRow>
                    <SortableHeader
                      view={activityView}
                      column="time"
                      label="Time"
                    />
                    <SortableHeader
                      view={activityView}
                      column="event"
                      label="Event"
                    />
                    <TableCell>Details</TableCell>
                    <SortableHeader
                      view={activityView}
                      column="by"
                      label="By"
                    />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activityView.visible.map((entry, i) => (
                    <TableRow key={i} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{eventLabel(entry)}</TableCell>
                      <TableCell>{eventDetail(entry) || "—"}</TableCell>
                      <TableCell sx={{ overflowWrap: "anywhere" }}>
                        {actorLabel(entry)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePager view={activityView} label="Activity" />
          </>
        )}
        {loaded && tab === "dashboard" && (
          <StaffDashboard offerings={courses} canSales={can("reports:sales")} />
        )}
        {loaded && tab === "collections" && (
          <StaffCollections
            canManage={canCatalog}
            offerings={courses}
            onChanged={setMessage}
          />
        )}
        {loaded && tab === "explore" && (
          <StaffExplore
            canManage={canCatalog || can("content:write")}
            offerings={courses}
            onChanged={setMessage}
          />
        )}
        {tab === "transactions" && can("payments:read") && (
          <StaffTransactions
            canRequest={can("refunds:request")}
            onChanged={setMessage}
          />
        )}
        {tab === "learners" && (
          <StaffLearners
            canManage={can("learners:manage")}
            onChanged={setMessage}
          />
        )}
        {tab === "users" && (
          <StaffUsers
            canManage={can("staff:manage")}
            currentId={member.id}
            roleFilter={roleFilter}
            onRoleFilter={setRoleFilter}
            onChanged={async (text, selfChanged) => {
              setMessage(text);
              // Your own role or status changes apply immediately.
              if (selfChanged) await session.refresh();
            }}
          />
        )}
        {tab === "roles" && (
          <StaffRoles
            canManage={can("staff:manage")}
            onAssign={(role) => router.push(`/staff/staff?role=${role}`)}
          />
        )}
        <OfferingForm
          open={formOpen}
          offering={editing}
          onClose={() => setFormOpen(false)}
          onSaved={async (text) => {
            setFormOpen(false);
            await refresh().catch((e) => setError(e.message));
            setMessage(text);
          }}
        />
        <UnpublishDialog
          offering={unpublishing}
          onClose={() => setUnpublishing(undefined)}
          onDone={async (text) => {
            setUnpublishing(undefined);
            await refresh().catch((e) => setError(e.message));
            setMessage(text);
          }}
        />
      </Box>
    </Box>
  );
}
