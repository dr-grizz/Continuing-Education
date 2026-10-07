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
// Collections and Pathways tabs; course lists are on the collection's own page.
// The list layout puts the details and action in a side column from `sm` up.
export function CollectionCard({
  collection: c,
  following = false,
  layout = "grid",
}: {
  collection: CollectionSummary;
  following?: boolean;
  layout?: "list" | "grid";
}) {
  const pathway = c.kind === "pathway";
  const list = layout === "list";
  const noun = pathway ? "pathway" : "collection";
  const details = (
    <>
      <Typography variant="body2" color="text.secondary">
        {c.course_count} {c.course_count === 1 ? "course" : "courses"} ·{" "}
        {priceRange(c)}
        {c.topics.length > 0 && <> · {c.topics.join(", ")}</>}
      </Typography>
      <Button
        href={`/collections/${c.slug}`}
        aria-label={`View ${noun}: ${c.title}`}
        endIcon={<ArrowForwardIcon />}
        sx={{ flexShrink: 0, alignSelf: list ? "flex-start" : undefined }}
      >
        View {noun}
      </Button>
    </>
  );
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: list ? 3 : 2.5 },
        display: "flex",
        flexDirection: list ? { xs: "column", sm: "row" } : "column",
        gap: list ? { xs: 1.5, sm: 3 } : 0,
        minWidth: 0,
        transition: "border-color .15s, box-shadow .15s",
        "&:hover, &:focus-within": {
          borderColor: "primary.main",
          boxShadow: "0 6px 20px rgba(16, 32, 48, .08)",
        },
      }}
    >
      <Box
        sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      >
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
          }}
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
      </Box>
      {list ? (
        <Stack
          sx={{
            gap: 1,
            width: { sm: 220 },
            flexShrink: 0,
            justifyContent: "center",
            borderTop: { xs: 1, sm: 0 },
            borderLeft: { xs: 0, sm: 1 },
            borderColor: "divider",
            pt: { xs: 1.5, sm: 0 },
            pl: { sm: 3 },
          }}
        >
          {details}
        </Stack>
      ) : (
        <>
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
            {details}
          </Stack>
        </>
      )}
    </Paper>
  );
}
