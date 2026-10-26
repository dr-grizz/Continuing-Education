"use client";
import { missingOfferingInfo } from "../../../../domain/offering-readiness";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
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
  Link,
} from "@mui/material";
import NextLink from "next/link";
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
import { CanvasCourses } from "../../../components/canvas-courses";
import {
  salesPageShortText,
  salesPageStatusText,
  StaffOfferingPage,
  type PageStatus,
} from "../../../components/staff-offering";
import { arrive, focusOnArrival } from "../../../components/arrival-focus";
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
} from "../../../components/unsaved-changes";
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
  learner_name?: string | null;
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
const offeringStatus = (
  c: Pick<Offering, "published" | "unpublished_at">,
): OfferingStatus =>
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
  if (!session.member)
    return (
      <StaffSignIn
        onSignIn={session.signIn}
        auth={session.auth}
        sessionError={session.sessionError}
      />
    );
  // Remount per staff member so switching people never keeps their data or tab.
  return (
    <UnsavedChangesProvider>
      <StaffWorkspace
        key={session.member.id}
        session={session}
        slug={section?.[0] ?? ""}
        item={section?.[1]}
        view={section?.[2]}
      />
    </UnsavedChangesProvider>
  );
}
type Session = ReturnType<typeof useStaffSession>;
type TabName =
  | "canvas"
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
    group: "Courses",
    icon: <MenuBookIcon />,
  },
  {
    tab: "collections",
    slug: "collections",
    label: "Collections",
    group: "Courses",
    icon: <CollectionsBookmarkIcon />,
  },
  {
    tab: "explore",
    slug: "explore",
    label: "Explore page",
    group: "Courses",
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
    tab: "canvas",
    slug: "canvas",
    label: "Canvas courses",
    group: "Courses",
    icon: <SchoolIcon />,
    scope: "canvas:read",
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
// Opens an offering's page; its title takes focus when it loads.
function OfferingLink({ offering }: { offering: StaffOffering }) {
  return (
    <Link
      component={NextLink}
      href={`/staff/offerings/${offering.id}`}
      onClick={() => arrive("offering")}
      underline="always"
      color="inherit"
      sx={{ overflowWrap: "break-word" }}
    >
      {offering.title}
      {missingOfferingInfo(offering).length > 0 && (
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          Missing required information:{" "}
          {missingOfferingInfo(offering).join(", ")}
        </Typography>
      )}
    </Link>
  );
}
function StaffWorkspace({
  session,
  slug,
  item,
  view,
}: {
  session: Session;
  slug: string;
  /** Offering pages: /staff/offerings/{item}/{view}. */
  item?: string;
  view?: string;
}) {
  const member = session.member as StaffMember;
  const { can } = session;
  const router = useRouter();
  const allowed = sections.filter((s) => !s.scope || can(s.scope));
  // Unknown or not-permitted addresses show the Dashboard.
  const currentSection = allowed.find((s) => s.slug === slug) ?? allowed[0];
  const tab = currentSection.tab;
  const setTab = (next: TabName) =>
    router.push(sectionHref(sections.find((s) => s.tab === next)?.slug ?? ""));
  const [sessionExpanded, setSessionExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const offeringsHeading = useRef<HTMLHeadingElement>(null);
  const { guard } = useUnsavedChanges();
  // Returning from an offering's page focuses the list heading.
  useEffect(() => {
    if (tab === "offerings" && !item)
      focusOnArrival(offeringsHeading.current, "offerings");
  });
  // The Staff section's role filter lives in the address (?role=approver), so
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
  // Unknown or not-permitted addresses are replaced by the Dashboard's. The
  // former Sales pages section now lives in each offering's Sales page tab.
  useEffect(() => {
    if (slug === "sales-pages")
      router.replace(
        item ? `/staff/offerings/${item}/sales-page` : "/staff/offerings",
      );
    else if (slug && currentSection.slug !== slug) router.replace("/staff");
  }, [slug, item, currentSection.slug, router]);
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
    [unpublishing, setUnpublishing] = useState<StaffOffering>(),
    [exceptions, setExceptions] = useState<ExceptionRow[]>([]),
    [outcome, setOutcome] = useState("normal"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState<"all" | OfferingStatus>("all"),
    [pageFilter, setPageFilter] = useState<"all" | PageStatus>("all"),
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
      price: (a, b) =>
        (a.price_cents ?? Number.MAX_SAFE_INTEGER) -
        (b.price_cents ?? Number.MAX_SAFE_INTEGER),
      seats: (a, b) =>
        (a.unlimited_seats
          ? Number.MAX_SAFE_INTEGER
          : (a.seats_available ?? -1)) -
        (b.unlimited_seats
          ? Number.MAX_SAFE_INTEGER
          : (b.seats_available ?? -1)),
      status: (a, b) =>
        statusOrder.indexOf(offeringStatus(a)) -
        statusOrder.indexOf(offeringStatus(b)),
    },
    initial: { key: "start", direction: "asc" },
    matches: (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || offeringStatus(c) === status) &&
      (pageFilter === "all" || c.sales_page_status === pageFilter),
  });
  const approvalsView = useTableView(requests, {
    compare: {
      learner: (a, b) =>
        byText(
          a.learner_email ?? a.learner_name ?? "",
          b.learner_email ?? b.learner_name ?? "",
        ),
      title: (a, b) => byText(a.title, b.title),
      requested: (a, b) => byText(a.created_at, b.created_at),
    },
    initial: { key: "requested", direction: "asc" },
    matches: (r) =>
      `${r.learner_email ?? r.learner_name ?? ""} ${r.title}`
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
  const publish = (c: StaffOffering) =>
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
    if (tab === "canvas") {
      setLoaded(true);
      return;
    }
    refresh().catch((e) => setError(e.message));
  }, [tab === "canvas"]);
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
            disabled={busy || missingOfferingInfo(c).length > 0}
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
          onLinkClick={(event, href) => guard(href, event)}
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
          onLinkClick={(event, href) => guard(href, event)}
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
            sx={{ px: 1.5, py: 0.75, maxWidth: { lg: 560 } }}
          >
            <Stack
              direction="row"
              sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}
            >
              <Typography
                variant="body2"
                sx={{ overflowWrap: "anywhere", flex: 1 }}
              >
                Signed in as <strong>{member.display_name}</strong>
              </Typography>
              <Button
                size="small"
                aria-expanded={sessionExpanded}
                aria-controls="staff-session-details"
                onClick={() => setSessionExpanded(!sessionExpanded)}
              >
                {sessionExpanded ? "Hide staff details" : "Staff details"}
              </Button>
              <Button size="small" onClick={session.signOut}>
                {session.auth?.mode === "canvas"
                  ? "Sign out"
                  : "Switch staff member"}
              </Button>
            </Stack>
            <Collapse
              in={sessionExpanded}
              id="staff-session-details"
              unmountOnExit
            >
              <Stack spacing={1} sx={{ pt: 1, pb: 0.5 }}>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {member.email}
                </Typography>
                <RoleChips roles={member.roles} />
                <Typography
                  variant="caption"
                  component="p"
                  color="text.secondary"
                >
                  {session.auth?.mode === "canvas"
                    ? "Signed in through Canvas. Your portal roles decide what you can do."
                    : "Mock sign-in: your roles decide what you can do."}
                </Typography>
                <Button
                  size="small"
                  href="/api/docs"
                  target="_blank"
                  rel="noreferrer"
                  sx={{ alignSelf: "flex-start" }}
                >
                  API docs
                </Button>
              </Stack>
            </Collapse>
          </Paper>
          {session.sessionError && (
            <Alert severity="error">{session.sessionError}</Alert>
          )}
        </Stack>
        {error && !formOpen && tab !== "canvas" && (
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
            variant="outlined"
            sx={{ bgcolor: "background.paper" }}
            onClose={() => setMessage("")}
          >
            {message}
          </Alert>
        </Snackbar>
        {!loaded && !error && <LoadingCards label="Loading staff workspace" />}
        {tab === "canvas" && <CanvasCourses can={can} />}
        {tab === "offerings" && item && (
          <StaffOfferingPage
            key={item}
            id={item}
            tab={view}
            can={can}
            onChanged={setMessage}
          />
        )}
        {loaded && tab === "offerings" && !item && (
          <>
            <Stack
              direction="row"
              sx={{
                mb: 2,
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography
                variant="h6"
                component="h2"
                ref={offeringsHeading}
                tabIndex={-1}
                sx={{ outline: "none" }}
              >
                Course offerings
              </Typography>
              {canCatalog && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setError("");
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
                the Course manager role. Open an offering to see its details and
                sales page.
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
              <TextField
                select
                label="Sales page"
                value={pageFilter}
                onChange={(e) =>
                  setPageFilter(e.target.value as typeof pageFilter)
                }
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="all">All sales pages</MenuItem>
                {(Object.keys(salesPageStatusText) as PageStatus[]).map(
                  (key) => (
                    <MenuItem key={key} value={key}>
                      {salesPageStatusText[key]}
                    </MenuItem>
                  ),
                )}
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
                      <OfferingLink offering={c} />
                    </Typography>
                    <Chip
                      label={`${statusLabels[offeringStatus(c)]}${c.listed === false ? " · Unlisted" : ""}`}
                      variant="outlined"
                      color={statusColors[offeringStatus(c)]}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {c.category}
                    {c.approval_required ? " · Approval required" : ""} · Sales
                    page:{" "}
                    {salesPageStatusText[c.sales_page_status].toLowerCase()}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {courseStart(c)}
                    {c.enrollment_closes_on
                      ? ` · enrollment ${c.enrollment_open ? "closes" : "closed"} ${date(c.enrollment_closes_on)}`
                      : ""}{" "}
                    · {money(c.price_cents)} ·{" "}
                    {c.unlimited_seats
                      ? "Unlimited seats"
                      : `${c.seats_available ?? "Not set"} / ${c.capacity ?? "Not set"} seats`}
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
                    <TableCell>Sales page</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {offeringsView.visible.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ minWidth: 180 }}>
                        <Typography variant="subtitle2">
                          <OfferingLink offering={c} />
                        </Typography>
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
                        {c.unlimited_seats
                          ? "Unlimited"
                          : `${c.seats_available ?? "Not set"} / ${c.capacity ?? "Not set"}`}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`${statusLabels[offeringStatus(c)]}${c.listed === false ? " · Unlisted" : ""}`}
                          variant="outlined"
                          color={statusColors[offeringStatus(c)]}
                        />
                      </TableCell>
                      <TableCell>
                        {salesPageShortText[c.sales_page_status]}
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
                  Try requesting Healthcare Communication from the course list.
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
                        {r.learner_email ||
                          r.learner_name ||
                          "Legacy demo learner"}
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
                            {r.learner_email ||
                              r.learner_name ||
                              "Legacy demo learner"}
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
            canReconcile={can("payments:reconcile")}
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
          onClose={() => setFormOpen(false)}
          onSaved={async (text, saved) => {
            setFormOpen(false);
            setMessage(`${text} Its page is open below.`);
            // Open the new draft's page; its title takes focus.
            arrive("offering");
            if (saved) router.push(`/staff/offerings/${saved.id}`);
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
