"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  MenuItem,
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
import { api, CollectionKind } from "./api";
import type { StaffOffering } from "./offering-form";
import { OrderedListEditor } from "./ordered-list-editor";

// Staff-curated collections and pathways (decisions F3 and F4). Catalog managers
// create drafts, order courses and publish; other staff see the list read-only.
type StaffCollection = {
  id: string;
  kind: CollectionKind;
  slug: string;
  title: string;
  summary: string;
  published: boolean;
  version: number;
  followers: number;
  courses: {
    id: string;
    title: string;
    published: boolean;
    listed?: boolean;
  }[];
};
const kindLabel = (kind: CollectionKind) =>
  kind === "pathway" ? "Pathway" : "Collection";
const minimumCourses = (kind: CollectionKind) => (kind === "pathway" ? 2 : 1);

export function StaffCollections({
  canManage,
  offerings,
  onChanged,
}: {
  canManage: boolean;
  offerings: StaffOffering[];
  onChanged: (message: string) => void;
}) {
  const [rows, setRows] = useState<StaffCollection[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [editing, setEditing] = useState<StaffCollection | null>(),
    [unpublishing, setUnpublishing] = useState<StaffCollection>();
  const load = () =>
    api<StaffCollection[]>("staff/collections", { role: "staff" })
      .then((data) => {
        setRows(data);
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  useEffect(() => {
    load();
  }, []);
  async function setPublished(row: StaffCollection, published: boolean) {
    if (busy) return;
    setBusy(row.id);
    setError("");
    try {
      await api(
        `collections/${row.id}/${published ? "publish" : "unpublish"}`,
        { role: "staff", body: { version: row.version } },
      );
      setUnpublishing(undefined);
      await load();
      onChanged(`${row.title} ${published ? "published" : "unpublished"}.`);
    } catch (e) {
      setUnpublishing(undefined);
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const status = (row: StaffCollection) => (
    <Chip
      label={row.published ? "Published" : "Draft"}
      color={row.published ? "success" : "default"}
      variant="outlined"
    />
  );
  const courseList = (row: StaffCollection) =>
    row.courses.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        No courses
      </Typography>
    ) : (
      <Box
        component={row.kind === "pathway" ? "ol" : "ul"}
        sx={{ m: 0, pl: 2.5, typography: "body2" }}
      >
        {row.courses.map((course) => (
          <li key={course.id}>
            {course.title}
            {(!course.published || course.listed === false) && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
              >
                {" "}
                {course.published
                  ? "(unlisted, hidden from this list)"
                  : "(not published, hidden from learners)"}
              </Typography>
            )}
          </li>
        ))}
      </Box>
    );
  const actions = (row: StaffCollection) =>
    canManage && (
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
        <Button
          onClick={() => setEditing(row)}
          aria-label={`Edit ${row.title}`}
        >
          Edit
        </Button>
        {row.published ? (
          <Button
            color="error"
            onClick={() => setUnpublishing(row)}
            aria-label={`Unpublish ${row.title}`}
          >
            Unpublish
          </Button>
        ) : (
          <Button
            onClick={() => setPublished(row, true)}
            aria-disabled={busy === row.id || undefined}
            aria-label={`Publish ${row.title}`}
          >
            {busy === row.id ? "Publishing…" : "Publish"}
          </Button>
        )}
      </Stack>
    );
  return (
    <>
      <Stack
        direction="row"
        sx={{
          mb: 2,
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="h5" component="h2">
            Collections and pathways
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Collections group related courses. Pathways add a recommended order;
            learners can follow them for free, and following registers nothing.
          </Typography>
        </Box>
        {canManage && (
          <Button variant="contained" onClick={() => setEditing(null)}>
            New collection
          </Button>
        )}
      </Stack>
      {!canManage && (
        <Alert severity="info" role="note" sx={{ mb: 2 }}>
          Your role can view collections. Course managers create and publish
          them.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {loaded && rows.length === 0 && !error && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography>No collections yet.</Typography>
        </Paper>
      )}
      {rows.length > 0 && (
        <>
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Table aria-label="Collections and pathways">
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Courses</TableCell>
                  <TableCell>Followers</TableCell>
                  <TableCell>Status</TableCell>
                  {canManage && <TableCell>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600 }}>
                        {row.title}
                      </Typography>
                      {row.published ? (
                        <Link
                          href={`/collections/${row.slug}`}
                          variant="body2"
                          aria-label={`Public page for ${row.title}`}
                        >
                          /collections/{row.slug}
                        </Link>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          /collections/{row.slug}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{kindLabel(row.kind)}</TableCell>
                    <TableCell>{courseList(row)}</TableCell>
                    <TableCell>
                      {row.kind === "pathway" ? row.followers : "—"}
                    </TableCell>
                    <TableCell>{status(row)}</TableCell>
                    {canManage && <TableCell>{actions(row)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {rows.map((row) => (
              <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", gap: 1 }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="overline" color="secondary">
                      {kindLabel(row.kind)}
                    </Typography>
                    <Typography variant="h6" component="h3">
                      {row.title}
                    </Typography>
                  </Box>
                  <Box>{status(row)}</Box>
                </Stack>
                <Box sx={{ mt: 1 }}>{courseList(row)}</Box>
                {row.kind === "pathway" && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {row.followers}{" "}
                    {row.followers === 1 ? "follower" : "followers"}
                  </Typography>
                )}
                {canManage && <Box sx={{ mt: 1.5 }}>{actions(row)}</Box>}
              </Paper>
            ))}
          </Stack>
        </>
      )}
      <CollectionDialog
        open={editing !== undefined}
        collection={editing ?? undefined}
        offerings={offerings}
        onClose={() => setEditing(undefined)}
        onSaved={async (text) => {
          setEditing(undefined);
          await load();
          onChanged(text);
        }}
      />
      <Dialog
        open={Boolean(unpublishing)}
        onClose={() => setUnpublishing(undefined)}
        aria-labelledby="unpublish-collection-title"
      >
        <DialogTitle id="unpublish-collection-title">
          Unpublish {unpublishing?.title}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Learners will no longer see this{" "}
            {unpublishing?.kind === "pathway" ? "pathway" : "collection"} in the
            course list.
            {unpublishing?.kind === "pathway" &&
              ` It disappears from My learning for ${unpublishing.followers} ${
                unpublishing.followers === 1 ? "follower" : "followers"
              }; their follows are kept if you publish it again.`}{" "}
            Registrations are not affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnpublishing(undefined)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            aria-disabled={Boolean(busy) || undefined}
            onClick={() => unpublishing && setPublished(unpublishing, false)}
          >
            {busy ? "Unpublishing…" : "Unpublish"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

type Field = "title" | "slug" | "summary" | "courses";
const fieldLabels: Record<Field, string> = {
  title: "Title",
  slug: "Web address",
  summary: "Summary",
  courses: "Courses",
};
function CollectionDialog({
  open,
  collection,
  offerings,
  onClose,
  onSaved,
}: {
  open: boolean;
  collection?: StaffCollection;
  offerings: StaffOffering[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<CollectionKind>("collection"),
    [title, setTitle] = useState(""),
    [slug, setSlug] = useState(""),
    [summary, setSummary] = useState(""),
    [courseIds, setCourseIds] = useState<string[]>([]),
    [errors, setErrors] = useState<Partial<Record<Field, string>>>({}),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    setKind(collection?.kind ?? "collection");
    setTitle(collection?.title ?? "");
    setSlug("");
    setSummary(collection?.summary ?? "");
    setCourseIds(collection?.courses.map((c) => c.id) ?? []);
    setErrors({});
    setFailure("");
  }, [open, collection]);
  useEffect(() => {
    if (failure) summaryRef.current?.focus();
  }, [failure]);
  const byId = new Map(offerings.map((o) => [o.id, o]));
  const published = collection?.published ?? false;
  function validate() {
    const found: Partial<Record<Field, string>> = {};
    if (title.trim().length < 3 || title.trim().length > 120)
      found.title = "Enter 3 to 120 characters.";
    if (!collection && slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      found.slug =
        "Use lowercase letters and numbers joined by hyphens, or leave it empty.";
    if (summary.trim().length < 10 || summary.trim().length > 500)
      found.summary = "Enter 10 to 500 characters.";
    if (published) {
      const visible = courseIds.filter(
        (id) => byId.get(id)?.published && byId.get(id)?.listed !== false,
      ).length;
      if (visible < minimumCourses(kind))
        found.courses =
          kind === "pathway"
            ? "A published pathway needs at least two published, listed courses."
            : "A published collection needs at least one published, listed course.";
    }
    return found;
  }
  async function save() {
    if (busy) return;
    const found = validate();
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length) {
      setTimeout(() => summaryRef.current?.focus());
      return;
    }
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        summary: summary.trim(),
        offeringIds: courseIds,
      };
      if (collection)
        await api(`collections/${collection.id}/edit`, {
          role: "staff",
          body: { ...body, version: collection.version },
        });
      else
        await api("collections", {
          role: "staff",
          body: { ...body, kind, ...(slug ? { slug } : {}) },
        });
      await onSaved(
        collection
          ? `Changes saved for ${body.title}.`
          : `Draft ${kind} saved. Publish it when it is ready.`,
      );
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const errorList = Object.entries(errors).filter(([, text]) => text) as [
    Field,
    string,
  ][];
  const fieldId = (name: Field) =>
    name === "courses" ? "collection-courses-add" : `collection-${name}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="collection-dialog-title"
    >
      <DialogTitle id="collection-dialog-title">
        {collection ? `Edit ${collection.title}` : "New collection or pathway"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {(errorList.length > 0 || failure) && (
            <Alert
              severity="error"
              ref={summaryRef}
              tabIndex={-1}
              aria-labelledby="collection-error-heading"
            >
              <Typography
                id="collection-error-heading"
                variant="subtitle2"
                component="h3"
              >
                {failure ? "The collection was not saved" : "Fix these fields"}
              </Typography>
              {failure ? (
                failure
              ) : (
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {errorList.map(([name, text]) => (
                    <li key={name}>
                      <Link
                        href={`#${fieldId(name)}`}
                        color="inherit"
                        onClick={(event) => {
                          event.preventDefault();
                          document.getElementById(fieldId(name))?.focus();
                        }}
                      >
                        {fieldLabels[name]}: {text}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <TextField
            select
            id="collection-kind"
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value as CollectionKind)}
            disabled={Boolean(collection)}
            helperText={
              collection
                ? "The type is fixed after creation."
                : "A pathway shows its courses in a recommended order."
            }
            fullWidth
          >
            <MenuItem value="collection">Collection</MenuItem>
            <MenuItem value="pathway">Pathway</MenuItem>
          </TextField>
          <TextField
            id="collection-title"
            label="Title"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors({ ...errors, title: undefined });
            }}
            error={Boolean(errors.title)}
            helperText={errors.title}
            fullWidth
          />
          {!collection ? (
            <TextField
              id="collection-slug"
              label="Web address (optional)"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                if (errors.slug) setErrors({ ...errors, slug: undefined });
              }}
              error={Boolean(errors.slug)}
              helperText={
                errors.slug ??
                "Leave empty to build it from the title. It cannot be changed later."
              }
              fullWidth
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Web address: /collections/{collection.slug} (fixed)
            </Typography>
          )}
          <TextField
            id="collection-summary"
            label="Summary"
            required
            multiline
            minRows={2}
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              if (errors.summary) setErrors({ ...errors, summary: undefined });
            }}
            error={Boolean(errors.summary)}
            helperText={
              errors.summary ?? "Shown to learners. 10 to 500 characters."
            }
            fullWidth
          />
          <OrderedListEditor
            id="collection-courses"
            legend={
              kind === "pathway" ? "Courses in recommended order" : "Courses"
            }
            noun="course"
            ids={courseIds}
            options={offerings.map((o) => ({
              id: o.id,
              title: o.title,
              note: o.published
                ? o.listed === false
                  ? "Unlisted; hidden from this list"
                  : undefined
                : "Not published; hidden from learners",
            }))}
            onChange={(next) => {
              setCourseIds(next);
              if (errors.courses) setErrors({ ...errors, courses: undefined });
            }}
            emptyText="No courses added yet."
            error={errors.courses}
            helperText={
              kind === "pathway"
                ? "Publishing needs at least two published, listed courses."
                : "Publishing needs at least one published, listed course."
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          aria-disabled={busy || undefined}
        >
          {busy ? "Saving…" : collection ? "Save changes" : "Save draft"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
