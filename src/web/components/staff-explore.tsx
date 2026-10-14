"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { api, CollectionKind } from "./api";
import type { StaffOffering } from "./offering-form";
import { OrderedListEditor } from "./ordered-list-editor";

// Staff picks for the learner Explore tab. Empty spots fill automatically, so
// picks are optional. Only published items can be picked; unpublishing removes
// an item from the picks.
type Pick = { id: string; title: string; published: boolean };
type Picks = { courses: Pick[]; collections: Pick[]; pathways: Pick[] };
type Section = keyof Picks;
type CollectionRow = {
  id: string;
  kind: CollectionKind;
  title: string;
  published: boolean;
};
const sections: {
  key: Section;
  legend: string;
  noun: string;
  max: number;
}[] = [
  { key: "courses", legend: "Featured courses", noun: "course", max: 5 },
  { key: "pathways", legend: "Featured pathways", noun: "pathway", max: 3 },
  {
    key: "collections",
    legend: "Featured collections",
    noun: "collection",
    max: 3,
  },
];

export function StaffExplore({
  canManage,
  offerings,
  onChanged,
}: {
  canManage: boolean;
  offerings: StaffOffering[];
  onChanged: (message: string) => void;
}) {
  const [saved, setSaved] = useState<Picks>(),
    [ids, setIds] = useState<Record<Section, string[]>>({
      courses: [],
      collections: [],
      pathways: [],
    }),
    [collections, setCollections] = useState<CollectionRow[]>([]),
    [error, setError] = useState(""),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const failureRef = useRef<HTMLDivElement | null>(null);
  const load = () =>
    Promise.all([
      api<Picks>("staff/explore", { role: "staff" }),
      api<CollectionRow[]>("staff/collections", { role: "staff" }),
    ])
      .then(([picks, rows]) => {
        setSaved(picks);
        setIds({
          courses: picks.courses.map((p) => p.id),
          collections: picks.collections.map((p) => p.id),
          pathways: picks.pathways.map((p) => p.id),
        });
        setCollections(rows);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);
  const options: Record<Section, { id: string; title: string }[]> = {
    courses: offerings
      .filter((o) => o.published)
      .map((o) => ({ id: o.id, title: o.title })),
    collections: collections
      .filter((c) => c.published && c.kind === "collection")
      .map((c) => ({ id: c.id, title: c.title })),
    pathways: collections
      .filter((c) => c.published && c.kind === "pathway")
      .map((c) => ({ id: c.id, title: c.title })),
  };
  const changed =
    saved !== undefined &&
    sections.some(
      ({ key }) => ids[key].join() !== saved[key].map((p) => p.id).join(),
    );
  async function save() {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await api("staff/explore", { role: "staff", body: ids });
      await load();
      onChanged("Explore page saved. Learners see the new picks now.");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" component="h2">
          Explore page
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Choose what learners see first on the Explore tab, in order. Empty
          spots fill automatically: open courses starting soonest, then the
          newest self-paced courses, and the newest collections and pathways.{" "}
          <Link href="/" underline="always">
            View the Explore tab
          </Link>
        </Typography>
      </Box>
      {!canManage && (
        <Alert severity="info" role="note" sx={{ mb: 2 }}>
          Your role can view the picks. Course managers and content editors
          change them.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {failure && (
        <Alert severity="error" ref={failureRef} tabIndex={-1} sx={{ mb: 2 }}>
          The Explore page was not saved. {failure}
        </Alert>
      )}
      {saved && (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            // Panels wrap to fewer columns when narrow (sidebar, large text).
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            alignItems: "start",
          }}
        >
          {sections.map(({ key, legend, noun, max }) => (
            <Paper key={key} variant="outlined" sx={{ p: 2 }}>
              {canManage ? (
                <OrderedListEditor
                  id={`explore-${key}`}
                  legend={`${legend} (up to ${max})`}
                  noun={noun}
                  ids={ids[key]}
                  options={[
                    ...options[key],
                    // Keep titles for saved picks that are no longer offered.
                    ...saved[key].filter(
                      (p) => !options[key].some((o) => o.id === p.id),
                    ),
                  ]}
                  max={max}
                  onChange={(next) => setIds({ ...ids, [key]: next })}
                  emptyText="No picks; all spots fill automatically."
                  helperText="Only published items can be picked."
                />
              ) : (
                <>
                  <Typography variant="subtitle2" component="h3">
                    {legend}
                  </Typography>
                  {saved[key].length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No picks; all spots fill automatically.
                    </Typography>
                  ) : (
                    <Box component="ol" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                      {saved[key].map((p) => (
                        <li key={p.id}>{p.title}</li>
                      ))}
                    </Box>
                  )}
                </>
              )}
            </Paper>
          ))}
        </Box>
      )}
      {canManage && saved && (
        <Stack
          direction="row"
          sx={{ mt: 2, gap: 2, alignItems: "center", flexWrap: "wrap" }}
        >
          <Button
            variant="contained"
            onClick={save}
            aria-disabled={busy || undefined}
          >
            {busy ? "Saving…" : "Save Explore page"}
          </Button>
          <Typography variant="body2" color="text.secondary" aria-live="polite">
            {changed ? "You have unsaved changes." : ""}
          </Typography>
        </Stack>
      )}
    </>
  );
}
