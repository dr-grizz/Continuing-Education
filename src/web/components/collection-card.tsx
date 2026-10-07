"use client";
import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { CollectionSummary, money } from "./api";

const priceRange = (c: CollectionSummary) =>
  c.min_price_cents === c.max_price_cents
    ? money(c.min_price_cents)
    : `${money(c.min_price_cents)}–${money(c.max_price_cents)}`;

// Card for a published collection or pathway, shared by the Explore,
// Collections and Pathways tabs. Pathways preview their first steps in order.
export function CollectionCard({
  collection: c,
  following = false,
}: {
  collection: CollectionSummary;
  following?: boolean;
}) {
  const pathway = c.kind === "pathway";
  const preview = c.course_titles.slice(0, 3);
  const noun = pathway ? "pathway" : "collection";
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.5 },
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        transition: "border-color .15s, box-shadow .15s",
        "&:hover, &:focus-within": {
          borderColor: "primary.main",
          boxShadow: "0 6px 20px rgba(16, 32, 48, .08)",
        },
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
      >
        <Typography
          variant="overline"
          color="secondary"
          sx={{ fontWeight: 700 }}
        >
          {pathway ? "Pathway" : "Collection"}
        </Typography>
        {following && (
          <Chip label="Following" color="primary" variant="outlined" />
        )}
      </Stack>
      <Typography variant="h5" component="h3" sx={{ fontSize: 22, mt: 0.5 }}>
        {c.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>
        {c.summary}
      </Typography>
      {pathway && preview.length > 0 && (
        <Box
          component="ol"
          aria-label={`Steps in ${c.title}`}
          sx={{ m: 0, mt: 1.5, pl: 2.5, typography: "body2" }}
        >
          {preview.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </Box>
      )}
      {pathway && c.course_titles.length > preview.length && (
        <Typography variant="body2" color="text.secondary" sx={{ pl: 2.5 }}>
          and {c.course_titles.length - preview.length} more
        </Typography>
      )}
      <Box sx={{ flexGrow: 1 }} />
      <Divider sx={{ my: 2 }} />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {c.course_count} {c.course_count === 1 ? "course" : "courses"} ·{" "}
          {priceRange(c)}
          {c.topics.length > 0 && <> · {c.topics.join(", ")}</>}
        </Typography>
        <Button
          href={`/collections/${c.slug}`}
          aria-label={`View ${noun}: ${c.title}`}
          endIcon={<ArrowForwardIcon />}
          sx={{ flexShrink: 0 }}
        >
          View {noun}
        </Button>
      </Stack>
    </Paper>
  );
}
