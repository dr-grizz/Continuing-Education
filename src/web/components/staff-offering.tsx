"use client";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { api, courseFormatLabel, courseSchedule, money } from "./api";
import { arrive, focusOnArrival } from "./arrival-focus";
import { actorLabels, auditLabels } from "./audit-labels";
import { LoadingCards } from "./loading";
import { OfferingForm, StaffOffering, UnpublishDialog } from "./offering-form";
import { SalesPageEditor } from "./staff-sales-pages";
import { registrationStatusLabels } from "./staff-learners";
import { useUnsavedChanges } from "./unsaved-changes";

// One offering's staff page at /staff/offerings/{id}/{tab}. Catalog managers
// edit Details and Settings and publish; content editors edit the Sales page;
// everyone else can view. Each tab saves on its own.

export type PageStatus = StaffOffering["sales_page_status"];
export const salesPageStatusText: Record<PageStatus, string> = {
  none: "No sales page",
  draft: "Draft, not published",
  published: "Published",
  changes: "Published, with unpublished changes",
};
// Short forms for the Offerings table column.
export const salesPageShortText: Record<PageStatus, string> = {
  none: "None",
  draft: "Draft",
  published: "Published",
  changes: "Unpublished changes",
};
type Detail = {
  offering: StaffOffering;
  registrations: Record<string, number>;
  activity: {
    action: string;
    actor: string;
    actor_email: string | null;
    details: { reason?: string; revision?: number } | null;
    created_at: string;
  }[];
};
export const offeringTabs = [
  { slug: "", label: "Overview" },
  { slug: "details", label: "Details" },
  { slug: "settings", label: "Settings" },
  { slug: "sales-page", label: "Sales page" },
  { slug: "activity", label: "Activity" },
] as const;
const statusOf = (o: StaffOffering) =>
  o.published ? "Published" : o.unpublished_at ? "Unpublished" : "Draft";
const statusColor = (o: StaffOffering) =>
  o.published ? "success" : o.unpublished_at ? "warning" : "default";
const when = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const actorName = (entry: Detail["activity"][number]) =>
  entry.actor_email ??
  actorLabels[entry.actor.split(":")[0]] ??
  actorLabels[entry.actor] ??
  entry.actor;

export function StaffOfferingPage({
  id,
  tab,
  can,
  onChanged,
}: {
  id: string;
  /** Third address segment; unknown values show the Overview. */
  tab?: string;
  can: (scope: string) => boolean;
  onChanged: (message: string) => void;
}) {
  const router = useRouter();
  const current =
    offeringTabs.find((t) => t.slug === (tab ?? "")) ?? offeringTabs[0];
  const base = `/staff/offerings/${id}`;
  const hrefOf = (slug: string) => (slug ? `${base}/${slug}` : base);
  const [detail, setDetail] = useState<Detail>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [unpublishing, setUnpublishing] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLHeadingElement>(null);
  const canCatalog = can("catalog:write");
  const load = useCallback(
    () =>
      api<Detail>(`staff/offerings/${id}`, { role: "staff" })
        .then((data) => {
          setDetail(data);
          setError("");
        })
        .catch((e) => setError((e as Error).message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);
  // Unknown tab addresses are replaced by the Overview's.
  useEffect(() => {
    if (tab !== undefined && current.slug !== tab) router.replace(base);
  }, [tab, current.slug, base, router]);
  useEffect(() => {
    if (!detail) return;
    focusOnArrival(title.current, "offering");
    focusOnArrival(panel.current, "offering-tab");
  }, [detail]);
  // Links ask first when a tab has unsaved changes (UnsavedChangesProvider).
  const { setDirty: reportDirty, guard } = useUnsavedChanges();
  const go =
    (href: string, target: string) => (event: React.MouseEvent<HTMLElement>) =>
      guard(href, event, () => arrive(target));
  async function saved(message: string) {
    await load();
    onChanged(message);
  }
  async function publish() {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`offerings/${id}/publish`, {
        role: "staff",
        body: { version: detail.offering.version },
      });
      await saved(
        "Sample offering published. Real Canvas mapping checks are deferred.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!detail)
    return error ? (
      <>
        <AllOfferingsLink />
        <Alert severity="error">{error}</Alert>
      </>
    ) : (
      <LoadingCards label="Loading offering" count={1} />
    );
  const o = detail.offering;
  return (
    <>
      <AllOfferingsLink onClick={go("/staff/offerings", "offerings")} />
      <Typography
        variant="h5"
        component="h2"
        ref={title}
        tabIndex={-1}
        sx={{ outline: "none", overflowWrap: "anywhere" }}
      >
        {o.title}
      </Typography>
      <Stack
        direction="row"
        sx={{ mt: 1, gap: 1, flexWrap: "wrap", alignItems: "center" }}
      >
        <Chip label={statusOf(o)} variant="outlined" color={statusColor(o)} />
        <Typography variant="body2" color="text.secondary">
          {o.category} · Sales page:{" "}
          {salesPageStatusText[o.sales_page_status].toLowerCase()}
        </Typography>
      </Stack>
      <Box
        component="nav"
        aria-label="Offering sections"
        sx={{ mt: 2, mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        <Box
          component="ul"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: { xs: 0, sm: 1 },
            listStyle: "none",
            p: 0,
            m: 0,
          }}
        >
          {offeringTabs.map((t) => {
            const selected = t.slug === current.slug;
            return (
              <li key={t.slug}>
                <Link
                  component={NextLink}
                  href={hrefOf(t.slug)}
                  aria-current={selected ? "page" : undefined}
                  onClick={go(hrefOf(t.slug), "offering-tab")}
                  underline="none"
                  sx={{
                    display: "block",
                    px: 1.5,
                    py: 1.25,
                    fontWeight: selected ? 700 : 500,
                    color: selected ? "primary.main" : "text.secondary",
                    borderBottom: 3,
                    borderColor: selected ? "primary.main" : "transparent",
                    "&:hover": { color: "text.primary" },
                  }}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </Box>
      </Box>
      <Box component="section" aria-labelledby="offering-panel-heading">
        <Typography
          id="offering-panel-heading"
          variant="h6"
          component="h3"
          ref={panel}
          tabIndex={-1}
          sx={{ outline: "none", mb: 2 }}
        >
          {current.label}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {current.slug === "" && (
          <Overview
            detail={detail}
            canCatalog={canCatalog}
            busy={busy}
            onPublish={publish}
            onUnpublish={() => setUnpublishing(true)}
            salesPageHref={hrefOf("sales-page")}
            onSalesPage={go(hrefOf("sales-page"), "offering-tab")}
          />
        )}
        {(current.slug === "details" || current.slug === "settings") &&
          (canCatalog ? (
            <OfferingForm
              open
              offering={o}
              section={current.slug}
              onClose={() => undefined}
              onSaved={saved}
              onDirtyChange={reportDirty}
            />
          ) : (
            <>
              <Alert severity="info" role="note" sx={{ mb: 2 }}>
                View only: catalog managers change offerings.
              </Alert>
              <Facts
                rows={
                  current.slug === "details"
                    ? [
                        ["Summary", o.summary],
                        ["Description", o.description],
                        ["Format", courseFormatLabel(o)],
                        ["Schedule", courseSchedule(o)],
                        ["Price", money(o.price_cents)],
                        ["Seat capacity", String(o.capacity)],
                      ]
                    : [
                        [
                          "Approval",
                          o.approval_required
                            ? `Required; valid for ${o.approval_valid_days} days`
                            : "Not required",
                        ],
                        [
                          "Enrollment",
                          o.course_type === "cohort"
                            ? `Closes ${o.enrollment_close_days} days after the start date`
                            : "Never closes (self-paced)",
                        ],
                        ["Canvas course", o.canvas_course_url ?? "Not set"],
                      ]
                }
              />
            </>
          ))}
        {current.slug === "sales-page" && (
          <SalesPageEditor
            owner="offering"
            id={id}
            canEdit={can("content:write")}
            onChanged={(message) => {
              load();
              onChanged(message);
            }}
            onDirtyChange={reportDirty}
          />
        )}
        {current.slug === "activity" && <Activity entries={detail.activity} />}
      </Box>
      <UnpublishDialog
        offering={unpublishing ? o : undefined}
        onClose={() => setUnpublishing(false)}
        onDone={async (message) => {
          setUnpublishing(false);
          await saved(message);
        }}
      />
    </>
  );
}

function AllOfferingsLink({
  onClick,
}: {
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <Link
      component={NextLink}
      href="/staff/offerings"
      onClick={onClick ?? (() => arrive("offerings"))}
      underline="always"
      sx={{ display: "inline-block", mb: 2 }}
    >
      All offerings
    </Link>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <Box
      component="dl"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "minmax(140px, max-content) 1fr",
        },
        columnGap: 3,
        rowGap: { xs: 0.5, sm: 1.5 },
        m: 0,
      }}
    >
      {rows.map(([term, value]) => (
        <Box key={term} sx={{ display: "contents" }}>
          <Typography
            component="dt"
            variant="subtitle2"
            sx={{ mt: { xs: 1, sm: 0 } }}
          >
            {term}
          </Typography>
          <Typography
            component="dd"
            variant="body2"
            sx={{ m: 0, overflowWrap: "anywhere", whiteSpace: "pre-line" }}
          >
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function Overview({
  detail,
  canCatalog,
  busy,
  onPublish,
  onUnpublish,
  salesPageHref,
  onSalesPage,
}: {
  detail: Detail;
  canCatalog: boolean;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  salesPageHref: string;
  onSalesPage: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const o = detail.offering;
  const counts = Object.entries(detail.registrations).filter(([, n]) => n > 0);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  return (
    <Stack spacing={3}>
      {canCatalog && (
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          {o.published ? (
            <Button variant="outlined" color="error" onClick={onUnpublish}>
              Unpublish
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={onPublish}
              aria-disabled={busy || undefined}
            >
              {busy ? "Publishing…" : "Publish"}
            </Button>
          )}
        </Stack>
      )}
      <Facts
        rows={[
          ["Price", money(o.price_cents)],
          ["Schedule", courseSchedule(o)],
          ["Format", courseFormatLabel(o)],
          ["Seats", `${o.seats_in_use} of ${o.capacity} in use`],
          [
            "Approval",
            o.approval_required ? "Required before payment" : "Not required",
          ],
        ]}
      />
      <Box>
        <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>
          Registrations
        </Typography>
        {counts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No registrations yet.
          </Typography>
        ) : (
          <Paper variant="outlined" sx={{ mt: 1, maxWidth: 420 }}>
            <Table size="small" aria-label="Registrations by status">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Learners</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {counts.map(([status, n]) => (
                  <TableRow key={status}>
                    <TableCell>
                      {registrationStatusLabels[status] ?? status}
                    </TableCell>
                    <TableCell align="right">{n}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell
                    component="th"
                    scope="row"
                    sx={{ fontWeight: 600 }}
                  >
                    Total
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {total}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
      <Box>
        <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>
          Links
        </Typography>
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, lineHeight: 2 }}>
          <li>
            {o.published ? (
              <Link href={`/courses/${o.id}`} underline="always">
                View the course page
              </Link>
            ) : (
              "Course page: available once published"
            )}
          </li>
          <li>
            {o.canvas_course_url ? (
              <Link
                href={o.canvas_course_url}
                target="_blank"
                rel="noopener noreferrer"
                underline="always"
              >
                Canvas course (opens in a new tab)
              </Link>
            ) : (
              "Canvas course: not set"
            )}
          </li>
          <li>
            <Link
              component={NextLink}
              href={salesPageHref}
              onClick={onSalesPage}
              underline="always"
            >
              Sales page
            </Link>
            : {salesPageStatusText[o.sales_page_status].toLowerCase()}
          </li>
        </Box>
      </Box>
    </Stack>
  );
}

function Activity({ entries }: { entries: Detail["activity"] }) {
  if (!entries.length)
    return (
      <Typography variant="body2" color="text.secondary">
        No activity recorded for this offering.
      </Typography>
    );
  return (
    <Box
      component="ol"
      sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1.5 }}
    >
      {entries.map((entry, index) => (
        <li key={index}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {auditLabels[entry.action] ?? entry.action}
            {entry.details?.revision
              ? ` (revision ${entry.details.revision})`
              : ""}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {when(entry.created_at)} · {actorName(entry)}
          </Typography>
          {entry.details?.reason && (
            <Typography variant="body2">
              Reason: {entry.details.reason}
            </Typography>
          )}
        </li>
      ))}
    </Box>
  );
}
