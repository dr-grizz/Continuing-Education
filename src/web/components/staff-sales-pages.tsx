"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { api } from "./api";
import {
  Block,
  blockLabels,
  heroImages,
  SalesPage,
  SalesPageBlocks,
} from "./sales-page-blocks";
import { LoadingCards } from "./loading";
import { visuallyHidden } from "./visually-hidden";

// Sales page editor (decision F2), in each offering's Sales page tab. Content
// editors build the course's page from structured blocks, preview it, and
// publish it as a numbered revision. Prices, dates and registration always come
// from the offering. Other staff can view.

type PageStatus = "none" | "draft" | "published" | "changes";
type Detail = {
  offering: {
    id: string;
    title: string;
    category: string;
    summary: string;
    outcomes: string[];
    published: boolean;
  };
  version: number;
  status: PageStatus;
  draft: SalesPage;
  published: SalesPage | null;
  published_revision: number | null;
  updated_at: string | null;
  published_at: string | null;
  problems: string[];
  revisions: { revision: number; published_at: string; published_by: string }[];
};
type Item = { key: string; block: Block };

const statusText: Record<PageStatus, string> = {
  none: "No sales page",
  draft: "Draft, not published",
  published: "Published",
  changes: "Published, with unpublished changes",
};
const when = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const newBlock = (type: Block["type"]): Block => {
  switch (type) {
    case "hero":
      return {
        type,
        image: "workplace-technology",
        decorative: false,
        alt: "",
        tagline: "",
      };
    case "text":
      return { type, heading: "", body: "" };
    case "outcomes":
      return { type, heading: "What you’ll learn" };
    case "instructor":
      return { type, heading: "Your instructor", name: "", role: "", bio: "" };
    case "testimonial":
      return {
        type,
        quote: "",
        name: "",
        role: "",
        consent: false,
        consentNote: "",
      };
    case "faq":
      return {
        type,
        heading: "Frequently asked questions",
        items: [{ question: "", answer: "" }],
      };
  }
};
// Fixed key order, so saved and edited pages compare exactly.
function canonical(page: SalesPage): string {
  return JSON.stringify({
    blocks: page.blocks.map((b) => ({ ...newBlock(b.type), ...b })),
    seo: { title: page.seo.title, description: page.seo.description },
  });
}

// Shown in the offering page's Sales page tab, which supplies the heading.
export function SalesPageEditor({
  id,
  canEdit,
  onChanged,
  onDirtyChange,
}: {
  id: string;
  canEdit: boolean;
  onChanged: (message: string) => void;
  /** Lets the offering page warn before leaving with unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [detail, setDetail] = useState<Detail>(),
    [items, setItems] = useState<Item[]>([]),
    [seo, setSeo] = useState({ title: "", description: "" }),
    [error, setError] = useState(""),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<"edit" | "preview">(
      canEdit ? "edit" : "preview",
    ),
    [addType, setAddType] = useState<Block["type"]>("text"),
    [announcement, setAnnouncement] = useState(""),
    [pendingFocus, setPendingFocus] = useState<string>(),
    [confirm, setConfirm] = useState<
      { kind: "remove" } | { kind: "restore"; revision: number }
    >();
  const failureRef = useRef<HTMLDivElement>(null);
  const focusables = useRef<Map<string, HTMLElement>>(new Map());
  const register = (name: string) => (element: HTMLElement | null) => {
    if (element) focusables.current.set(name, element);
    else focusables.current.delete(name);
  };
  const nextKey = useRef(0);
  const keyed = (blocks: Block[]) =>
    blocks.map((block) => ({ key: `b${nextKey.current++}`, block }));

  function apply(data: Detail) {
    setDetail(data);
    setItems(keyed(data.draft.blocks));
    setSeo(data.draft.seo);
  }
  const load = () =>
    api<Detail>(`staff/sales-pages/${id}`, { role: "staff" })
      .then((data) => {
        apply(data);
        setError("");
        return data;
      })
      .catch((e) => {
        setError((e as Error).message);
        return undefined;
      });
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);
  const unsaved =
    !!detail &&
    canonical({ blocks: items.map((i) => i.block), seo }) !==
      canonical(detail.draft);
  useEffect(() => {
    onDirtyChange?.(unsaved);
  }, [unsaved, onDirtyChange]);
  useEffect(() => {
    if (!pendingFocus) return;
    // The select's id is on its visible combobox, not the hidden input.
    if (pendingFocus === "add")
      document.getElementById("sales-page-add")?.focus();
    else focusables.current.get(pendingFocus)?.focus();
    setPendingFocus(undefined);
  }, [items, pendingFocus]);

  if (error && !detail) return <Alert severity="error">{error}</Alert>;
  if (!detail) return <LoadingCards label="Loading sales page" count={1} />;

  const page: SalesPage = { blocks: items.map((i) => i.block), seo };
  const dirty = canonical(page) !== canonical(detail.draft);
  const ready = !dirty && detail.problems.length === 0;
  const label = (index: number) =>
    `block ${index + 1} (${blockLabels[items[index].block.type]})`;

  function update(key: string, block: Block) {
    setItems((list) => list.map((i) => (i.key === key ? { key, block } : i)));
  }
  function move(index: number, by: -1 | 1) {
    const target = index + by;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    const key = items[index].key;
    // Keep focus on the same arrow unless the block reached the end.
    const edge = target === 0 || target === items.length - 1;
    setPendingFocus(
      `${key}-${edge ? (by < 0 ? "down" : "up") : by < 0 ? "up" : "down"}`,
    );
    setAnnouncement(
      `${blockLabels[items[index].block.type]} moved to position ${target + 1} of ${items.length}.`,
    );
  }
  function remove(index: number) {
    const removed = items[index];
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    const neighbour = next[index] ?? next[index - 1];
    setPendingFocus(neighbour ? `${neighbour.key}-block` : "add");
    setAnnouncement(`${blockLabels[removed.block.type]} block removed.`);
  }
  function add() {
    const [item] = keyed([newBlock(addType)]);
    setItems([...items, item]);
    setPendingFocus(`${item.key}-block`);
    setAnnouncement(
      `${blockLabels[addType]} block added as block ${items.length + 1}.`,
    );
  }
  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await action();
      await load();
      onChanged(success);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = () =>
    run(
      () =>
        api(`staff/sales-pages/${id}`, {
          role: "staff",
          body: { version: detail.version, page },
        }),
      "Draft saved. Learners see changes only after you publish.",
    );
  const publish = () => {
    if (!ready) {
      setFailure(
        dirty
          ? "Save the draft before publishing."
          : "Fix the items under “Before publishing” first.",
      );
      return;
    }
    run(
      () =>
        api(`staff/sales-pages/${id}/publish`, {
          role: "staff",
          body: { version: detail.version },
        }),
      "Sales page published. Learners see it on the course page now.",
    );
  };
  async function confirmAction() {
    const current = confirm;
    setConfirm(undefined);
    if (!current) return;
    if (current.kind === "remove")
      await run(
        () =>
          api(`staff/sales-pages/${id}/unpublish`, {
            role: "staff",
            body: { version: detail!.version },
          }),
        "Published page removed. The course shows its default page; the draft is kept.",
      );
    else
      await run(
        () =>
          api(`staff/sales-pages/${id}/restore`, {
            role: "staff",
            body: { version: detail!.version, revision: current.revision },
          }),
        `Revision ${current.revision} copied to the draft. Publish it to make it live.`,
      );
  }

  return (
    <>
      <Stack
        direction="row"
        sx={{ mt: 1, mb: 2, gap: 1, flexWrap: "wrap", alignItems: "center" }}
      >
        <Chip
          label={statusText[detail.status]}
          variant="outlined"
          size="small"
        />
        <Typography variant="body2" color="text.secondary">
          {detail.published_at
            ? `Revision ${detail.published_revision} published ${when(detail.published_at)}.`
            : "Learners see the default course page."}{" "}
          {detail.offering.published ? (
            <Link href={`/courses/${id}`} underline="always">
              View the course page
            </Link>
          ) : (
            "The course itself is not published."
          )}
        </Typography>
      </Stack>
      {!canEdit && (
        <Alert severity="info" role="note" sx={{ mb: 2 }}>
          Your role can view this page. Content editors edit and publish it.
        </Alert>
      )}
      {failure && (
        <Alert severity="error" ref={failureRef} tabIndex={-1} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      )}
      {canEdit && (
        <Tabs
          value={view}
          onChange={(_, next) => setView(next)}
          aria-label="Sales page views"
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab
            value="edit"
            label="Edit"
            id="sales-page-tab-edit"
            aria-controls="sales-page-panel-edit"
          />
          <Tab
            value="preview"
            label="Preview"
            id="sales-page-tab-preview"
            aria-controls="sales-page-panel-preview"
          />
        </Tabs>
      )}
      {canEdit && view === "edit" && (
        <Box
          role="tabpanel"
          id="sales-page-panel-edit"
          aria-labelledby="sales-page-tab-edit"
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Text appears exactly as typed. Separate paragraphs with a blank
            line, and start lines with “- ” for a bulleted list. Prices, dates
            and registration are added from the course automatically.
          </Typography>
          {items.length === 0 && (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              No blocks yet. Add one below; until a page is published, learners
              see the default course page.
            </Typography>
          )}
          <Stack spacing={2}>
            {items.map((item, index) => (
              <Paper
                key={item.key}
                component="fieldset"
                variant="outlined"
                ref={register(`${item.key}-block`)}
                tabIndex={-1}
                sx={{ p: 2, m: 0, minWidth: 0 }}
              >
                {/* The legend must be the fieldset's first child to name the group. */}
                <Typography
                  component="legend"
                  variant="subtitle1"
                  sx={{ fontWeight: 600, float: "left", p: 0, mt: 1, mr: 1 }}
                >
                  Block {index + 1} of {items.length}:{" "}
                  {blockLabels[item.block.type]}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, float: "right" }}>
                  <IconButton
                    ref={register(`${item.key}-up`)}
                    aria-label={`Move ${label(index)} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpwardIcon />
                  </IconButton>
                  <IconButton
                    ref={register(`${item.key}-down`)}
                    aria-label={`Move ${label(index)} down`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon />
                  </IconButton>
                  <IconButton
                    aria-label={`Remove ${label(index)}`}
                    onClick={() => remove(index)}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Box>
                <Box sx={{ clear: "both", pt: 1 }}>
                  <BlockFields
                    id={item.key}
                    block={item.block}
                    outcomes={detail.offering.outcomes}
                    onChange={(block) => update(item.key, block)}
                  />
                </Box>
              </Paper>
            ))}
          </Stack>
          <Stack
            direction="row"
            sx={{ mt: 2, gap: 1, flexWrap: "wrap", alignItems: "center" }}
          >
            <TextField
              select
              size="small"
              label="Block type"
              value={addType}
              onChange={(e) => setAddType(e.target.value as Block["type"])}
              slotProps={{ select: { id: "sales-page-add" } }}
              sx={{ minWidth: 220 }}
            >
              {(Object.keys(blockLabels) as Block["type"][]).map((type) => (
                <MenuItem key={type} value={type}>
                  {blockLabels[type]}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              onClick={add}
              disabled={items.length >= 20}
            >
              Add block
            </Button>
          </Stack>
          <Paper
            component="fieldset"
            variant="outlined"
            sx={{ p: 2, m: 0, mt: 3, minWidth: 0 }}
          >
            <Typography
              component="legend"
              variant="subtitle1"
              sx={{ fontWeight: 600, px: 0.5 }}
            >
              Browser tab and search results
            </Typography>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Page title"
                value={seo.title}
                onChange={(e) => setSeo({ ...seo, title: e.target.value })}
                slotProps={{ htmlInput: { maxLength: 70 } }}
                helperText={`Leave blank to use the course title. ${seo.title.length}/70`}
              />
              <TextField
                label="Description"
                value={seo.description}
                onChange={(e) =>
                  setSeo({ ...seo, description: e.target.value })
                }
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 160 } }}
                helperText={`One or two sentences for search results and shared links. ${seo.description.length}/160`}
              />
            </Stack>
          </Paper>
          {detail.problems.length > 0 && (
            <Alert severity="warning" sx={{ mt: 3 }}>
              <AlertTitle component="h4">Before publishing</AlertTitle>
              {dirty && (
                <Typography variant="body2" sx={{ mb: 1 }}>
                  These are from the saved draft. Save to check your changes.
                </Typography>
              )}
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {detail.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </Box>
            </Alert>
          )}
          <Stack
            direction="row"
            sx={{ mt: 3, gap: 2, alignItems: "center", flexWrap: "wrap" }}
          >
            <Button
              variant="contained"
              onClick={save}
              aria-disabled={busy || undefined}
            >
              {busy ? "Saving…" : "Save draft"}
            </Button>
            <Button
              variant="outlined"
              onClick={publish}
              aria-disabled={busy || !ready || undefined}
              aria-describedby="sales-page-publish-note"
            >
              Publish
            </Button>
            {detail.published && (
              <Button
                color="error"
                onClick={() => setConfirm({ kind: "remove" })}
                aria-disabled={busy || undefined}
              >
                Remove published page
              </Button>
            )}
            <Typography
              id="sales-page-publish-note"
              variant="body2"
              color="text.secondary"
            >
              {dirty
                ? "You have unsaved changes. Save the draft before publishing."
                : detail.problems.length
                  ? "Fix the items above to publish."
                  : detail.status === "published"
                    ? "The published page matches this draft."
                    : "Ready to publish."}
            </Typography>
          </Stack>
        </Box>
      )}
      {(view === "preview" || !canEdit) && (
        <Box
          role={canEdit ? "tabpanel" : undefined}
          id="sales-page-panel-preview"
          aria-labelledby={canEdit ? "sales-page-tab-preview" : undefined}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {canEdit
              ? "Your edits as learners would see them, including unsaved changes. On the course page, price and registration appear beside the page."
              : "The current draft. On the course page, price and registration appear beside it."}
          </Typography>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            {page.blocks.length ? (
              <SalesPageBlocks
                page={page}
                outcomes={detail.offering.outcomes}
                level={4}
              />
            ) : (
              <Typography color="text.secondary">
                Nothing to preview yet.
              </Typography>
            )}
          </Paper>
        </Box>
      )}
      <Typography variant="h6" component="h4" sx={{ mt: 4 }}>
        Published revisions
      </Typography>
      {detail.revisions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Not published yet.
        </Typography>
      ) : (
        <Box
          component="ul"
          sx={{ listStyle: "none", p: 0, m: 0, mt: 1, display: "grid", gap: 1 }}
        >
          {detail.revisions.map((r) => (
            <Box
              component="li"
              key={r.revision}
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                alignItems: "center",
              }}
            >
              <Typography variant="body2">
                Revision {r.revision}
                {r.revision === detail.published_revision
                  ? " (live)"
                  : ""} · {when(r.published_at)} · {r.published_by}
              </Typography>
              {canEdit && (
                <Button
                  size="small"
                  onClick={() =>
                    setConfirm({ kind: "restore", revision: r.revision })
                  }
                  aria-label={`Copy revision ${r.revision} to the draft`}
                >
                  Copy to draft
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
      <Box aria-live="polite" sx={visuallyHidden}>
        {announcement}
      </Box>
      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(undefined)}
        aria-labelledby="sales-page-confirm-title"
        maxWidth="xs"
      >
        <DialogTitle id="sales-page-confirm-title">
          {confirm?.kind === "remove"
            ? "Remove the published page?"
            : `Copy revision ${confirm?.kind === "restore" ? confirm.revision : ""} to the draft?`}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm?.kind === "remove"
              ? "Learners will see the default course page. The draft and earlier revisions are kept, so you can publish again later."
              : `This replaces the current draft${dirty ? ", including your unsaved changes" : ""}. The live page does not change until you publish.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(undefined)}>Cancel</Button>
          <Button
            onClick={confirmAction}
            color={confirm?.kind === "remove" ? "error" : "primary"}
          >
            {confirm?.kind === "remove" ? "Remove page" : "Replace draft"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function BlockFields({
  id,
  block,
  outcomes,
  onChange,
}: {
  id: string;
  block: Block;
  outcomes: string[];
  onChange: (block: Block) => void;
}) {
  const field = (
    name: string,
    label: string,
    value: string,
    max: number,
    set: (value: string) => void,
    options: { multiline?: boolean; helper?: string; required?: boolean } = {},
  ) => (
    <TextField
      id={`${id}-${name}`}
      label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      multiline={options.multiline}
      minRows={options.multiline ? 3 : undefined}
      required={options.required}
      slotProps={{ htmlInput: { maxLength: max } }}
      helperText={`${options.helper ? `${options.helper} ` : ""}${value.length}/${max}`}
      fullWidth
    />
  );
  switch (block.type) {
    case "hero":
      return (
        <Stack spacing={2}>
          <TextField
            select
            label="Image"
            value={block.image}
            onChange={(e) =>
              onChange({
                ...block,
                image: e.target.value as typeof block.image,
              })
            }
            slotProps={{ select: { id: `${id}-image` } }}
            helperText="Images come from the portal's library."
          >
            {heroImages.map((image) => (
              <MenuItem key={image.key} value={image.key}>
                {image.label}
              </MenuItem>
            ))}
          </TextField>
          <img
            src={`/course-images/${block.image}.jpg`}
            alt=""
            style={{ width: 200, maxWidth: "100%", borderRadius: 6 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={block.decorative}
                onChange={(e) =>
                  onChange({
                    ...block,
                    decorative: e.target.checked,
                    alt: e.target.checked ? "" : block.alt,
                  })
                }
              />
            }
            label="Decorative only (adds no information, so screen readers skip it)"
          />
          {!block.decorative &&
            field(
              "alt",
              "Alternative text",
              block.alt,
              200,
              (alt) => onChange({ ...block, alt }),
              {
                required: true,
                helper:
                  "Describe what the image shows for people who cannot see it.",
              },
            )}
          {field(
            "tagline",
            "Tagline (optional)",
            block.tagline,
            200,
            (tagline) => onChange({ ...block, tagline }),
          )}
        </Stack>
      );
    case "text":
      return (
        <Stack spacing={2}>
          {field(
            "heading",
            "Heading (optional)",
            block.heading,
            120,
            (heading) => onChange({ ...block, heading }),
          )}
          {field(
            "body",
            "Text",
            block.body,
            5000,
            (body) => onChange({ ...block, body }),
            {
              multiline: true,
              required: true,
            },
          )}
        </Stack>
      );
    case "outcomes":
      return (
        <Stack spacing={1.5}>
          {field(
            "heading",
            "Heading",
            block.heading,
            120,
            (heading) => onChange({ ...block, heading }),
            { required: true },
          )}
          <Typography variant="body2" color="text.secondary">
            Lists the course&apos;s {outcomes.length} learning outcomes from the
            offering. Catalog managers change them in Offerings.
          </Typography>
        </Stack>
      );
    case "instructor":
      return (
        <Stack spacing={2}>
          {field("heading", "Heading", block.heading, 120, (heading) =>
            onChange({ ...block, heading }),
          )}
          {field(
            "name",
            "Name",
            block.name,
            120,
            (name) => onChange({ ...block, name }),
            {
              required: true,
            },
          )}
          {field("role", "Title or role (optional)", block.role, 160, (role) =>
            onChange({ ...block, role }),
          )}
          {field(
            "bio",
            "Biography",
            block.bio,
            2000,
            (bio) => onChange({ ...block, bio }),
            {
              multiline: true,
              required: true,
            },
          )}
        </Stack>
      );
    case "testimonial":
      return (
        <Stack spacing={2}>
          {field(
            "quote",
            "Quote",
            block.quote,
            600,
            (quote) => onChange({ ...block, quote }),
            {
              multiline: true,
              required: true,
            },
          )}
          {field(
            "name",
            "Name",
            block.name,
            120,
            (name) => onChange({ ...block, name }),
            {
              required: true,
            },
          )}
          {field(
            "role",
            "Role or organization (optional)",
            block.role,
            160,
            (role) => onChange({ ...block, role }),
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={!!block.consent}
                onChange={(e) =>
                  onChange({ ...block, consent: e.target.checked })
                }
              />
            }
            label="This person agreed in writing to be quoted with their name"
          />
          {field(
            "consentNote",
            "Where the consent is kept (staff only)",
            block.consentNote ?? "",
            300,
            (consentNote) => onChange({ ...block, consentNote }),
            {
              helper:
                "For example, the email or form. Never shown to learners.",
            },
          )}
        </Stack>
      );
    case "faq":
      return (
        <Stack spacing={2}>
          {field(
            "heading",
            "Heading",
            block.heading,
            120,
            (heading) => onChange({ ...block, heading }),
            { required: true },
          )}
          {block.items.map((item, i) => (
            <Box
              key={i}
              component="fieldset"
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                p: 2,
                m: 0,
                minWidth: 0,
              }}
            >
              <Typography
                component="legend"
                variant="body2"
                sx={{ px: 0.5, fontWeight: 600 }}
              >
                Question {i + 1}
              </Typography>
              <Stack spacing={2}>
                {field(
                  `q${i}`,
                  "Question",
                  item.question,
                  200,
                  (question) =>
                    onChange({
                      ...block,
                      items: block.items.map((it, j) =>
                        j === i ? { ...it, question } : it,
                      ),
                    }),
                  { required: true },
                )}
                {field(
                  `a${i}`,
                  "Answer",
                  item.answer,
                  2000,
                  (answer) =>
                    onChange({
                      ...block,
                      items: block.items.map((it, j) =>
                        j === i ? { ...it, answer } : it,
                      ),
                    }),
                  { multiline: true, required: true },
                )}
                <Box>
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      onChange({
                        ...block,
                        items: block.items.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove question {i + 1}
                  </Button>
                </Box>
              </Stack>
            </Box>
          ))}
          <Box>
            <Button
              size="small"
              variant="outlined"
              disabled={block.items.length >= 15}
              onClick={() =>
                onChange({
                  ...block,
                  items: [...block.items, { question: "", answer: "" }],
                })
              }
            >
              Add a question
            </Button>
          </Box>
        </Stack>
      );
  }
}
