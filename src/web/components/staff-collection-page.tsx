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
  Stack,
  Typography,
} from "@mui/material";
import { api } from "./api";
import { arrive, focusOnArrival } from "./arrival-focus";
import { LoadingCards } from "./loading";
import type { StaffOffering } from "./offering-form";
import { PageTabs } from "./page-tabs";
import {
  CollectionForm,
  CollectionUnpublishDialog,
  kindLabel,
  type StaffCollection,
} from "./staff-collections";
import {
  Activity,
  Facts,
  salesPageStatusText,
  type ActivityEntry,
} from "./staff-offering";
import { SalesPageEditor } from "./staff-sales-pages";
import { useUnsavedChanges } from "./unsaved-changes";

// One collection's or pathway's staff page at /staff/collections/{id}/{tab},
// like an offering's page. Catalog managers edit Details and publish; content
// editors edit the Sales page; everyone else can view.

export const collectionTabs = [
  { slug: "", label: "Overview" },
  { slug: "details", label: "Details" },
  { slug: "sales-page", label: "Sales page" },
  { slug: "activity", label: "Activity" },
] as const;
type Detail = { collection: StaffCollection; activity: ActivityEntry[] };

export function StaffCollectionPage({
  id,
  tab,
  can,
  offerings,
  onChanged,
}: {
  id: string;
  /** Third address segment; unknown values show the Overview. */
  tab?: string;
  can: (scope: string) => boolean;
  offerings: StaffOffering[];
  onChanged: (message: string) => void;
}) {
  const router = useRouter();
  const current =
    collectionTabs.find((t) => t.slug === (tab ?? "")) ?? collectionTabs[0];
  const base = `/staff/collections/${id}`;
  const hrefOf = (slug: string) => (slug ? `${base}/${slug}` : base);
  const [detail, setDetail] = useState<Detail>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [unpublishing, setUnpublishing] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLHeadingElement>(null);
  const canCatalog = can("catalog:write");
  const { setDirty, guard } = useUnsavedChanges();
  const load = useCallback(
    () =>
      api<Detail>(`staff/collections/${id}`, { role: "staff" })
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
    focusOnArrival(title.current, "collection");
    focusOnArrival(panel.current, "collection-tab");
  }, [detail]);
  const go =
    (href: string, target: string) => (event: React.MouseEvent<HTMLElement>) =>
      guard(href, event, () => arrive(target));
  async function saved(message: string) {
    await load();
    onChanged(message);
  }
  async function setPublished(published: boolean) {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`collections/${id}/${published ? "publish" : "unpublish"}`, {
        role: "staff",
        body: { version: detail.collection.version },
      });
      setUnpublishing(false);
      await saved(
        `${detail.collection.title} ${published ? "published" : "unpublished"}.`,
      );
    } catch (e) {
      setUnpublishing(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link
      component={NextLink}
      href="/staff/collections"
      onClick={go("/staff/collections", "collections")}
      underline="always"
      sx={{ display: "inline-block", mb: 2 }}
    >
      All collections and pathways
    </Link>
  );
  if (!detail)
    return error ? (
      <>
        {back}
        <Alert severity="error">{error}</Alert>
      </>
    ) : (
      <LoadingCards label="Loading collection" count={1} />
    );
  const c = detail.collection;
  const noun = c.kind === "pathway" ? "pathway" : "collection";
  return (
    <>
      {back}
      <Typography
        variant="h5"
        component="h2"
        ref={title}
        tabIndex={-1}
        sx={{ outline: "none", overflowWrap: "anywhere" }}
      >
        {c.title}
      </Typography>
      <Stack
        direction="row"
        sx={{ mt: 1, gap: 1, flexWrap: "wrap", alignItems: "center" }}
      >
        <Chip
          label={c.published ? "Published" : "Draft"}
          color={c.published ? "success" : "default"}
          variant="outlined"
        />
        <Typography variant="body2" color="text.secondary">
          {kindLabel(c.kind)} · Sales page:{" "}
          {salesPageStatusText[c.sales_page_status].toLowerCase()}
        </Typography>
      </Stack>
      <PageTabs
        label={`${kindLabel(c.kind)} sections`}
        tabs={collectionTabs}
        current={current.slug}
        hrefOf={hrefOf}
        onFollow={(href) => go(href, "collection-tab")}
      />
      <Box component="section" aria-labelledby="collection-panel-heading">
        <Typography
          id="collection-panel-heading"
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
          <Stack spacing={3}>
            {canCatalog && (
              <Box>
                {c.published ? (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setUnpublishing(true)}
                  >
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    onClick={() => setPublished(true)}
                    aria-disabled={busy || undefined}
                  >
                    {busy ? "Publishing…" : "Publish"}
                  </Button>
                )}
              </Box>
            )}
            <Facts
              rows={[
                ["Type", kindLabel(c.kind)],
                ["Summary", c.summary],
                [
                  "Courses",
                  `${c.courses.length} (${c.courses.filter((x) => x.published).length} published)`,
                ],
                ...(c.kind === "pathway"
                  ? [["Followers", String(c.followers)] as [string, string]]
                  : []),
                ["Web address", `/collections/${c.slug}`],
              ]}
            />
            <Box>
              <Typography
                variant="subtitle1"
                component="h4"
                sx={{ fontWeight: 600 }}
              >
                Links
              </Typography>
              <Box
                component="ul"
                sx={{ m: 0, mt: 0.5, pl: 2.5, lineHeight: 2 }}
              >
                <li>
                  {c.published ? (
                    <Link href={`/collections/${c.slug}`} underline="always">
                      View the {noun} page
                    </Link>
                  ) : (
                    `${kindLabel(c.kind)} page: available once published`
                  )}
                </li>
                <li>
                  <Link
                    component={NextLink}
                    href={hrefOf("sales-page")}
                    onClick={go(hrefOf("sales-page"), "collection-tab")}
                    underline="always"
                  >
                    Sales page
                  </Link>
                  : {salesPageStatusText[c.sales_page_status].toLowerCase()}
                </li>
              </Box>
            </Box>
          </Stack>
        )}
        {current.slug === "details" &&
          (canCatalog ? (
            <CollectionForm
              open
              inline
              collection={c}
              offerings={offerings}
              onClose={() => undefined}
              onSaved={saved}
              onDirtyChange={setDirty}
            />
          ) : (
            <>
              <Alert severity="info" role="note" sx={{ mb: 2 }}>
                View only: catalog managers change collections and pathways.
              </Alert>
              <Facts
                rows={[
                  ["Title", c.title],
                  ["Summary", c.summary],
                  [
                    c.kind === "pathway" ? "Courses in order" : "Courses",
                    c.courses
                      .map((x, i) => `${i + 1}. ${x.title}`)
                      .join("\n") || "None yet",
                  ],
                ]}
              />
            </>
          ))}
        {current.slug === "sales-page" && (
          <SalesPageEditor
            owner="collection"
            id={id}
            canEdit={can("content:write")}
            onChanged={(message) => {
              load();
              onChanged(message);
            }}
            onDirtyChange={setDirty}
          />
        )}
        {current.slug === "activity" && (
          <Activity entries={detail.activity} noun={noun} />
        )}
      </Box>
      <CollectionUnpublishDialog
        collection={unpublishing ? c : undefined}
        busy={busy}
        onCancel={() => setUnpublishing(false)}
        onConfirm={() => setPublished(false)}
      />
    </>
  );
}
