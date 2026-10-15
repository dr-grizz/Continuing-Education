"use client";
import Image from "next/image";
import { useState } from "react";
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
import { courseFormatLabel, courseStart, money, Offering } from "./api";
import { courseImage, CU_CE_IMAGE } from "./course-images";

// Catalog course card, shared by the Courses and Explore tabs. Titles are h3,
// under the section's h2.
export function CourseCard({
  offering: o,
  layout,
}: {
  offering: Offering;
  layout: "list" | "grid";
}) {
  const source = courseImage(o);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const image = failedSource === source ? CU_CE_IMAGE : source;
  const branded = image === CU_CE_IMAGE;
  return (
    <Paper
      variant="outlined"
      sx={{
        p: layout === "grid" ? 0 : { xs: 2, sm: 3 },
        overflow: "hidden",
        gap: layout === "grid" ? 0 : { xs: 2, sm: 2.5 },
        display: "flex",
        flexDirection: layout === "grid" ? "column" : "row",
        minWidth: 0,
        transition: "border-color .15s, box-shadow .15s",
        "&:hover, &:focus-within": {
          borderColor: "primary.main",
          boxShadow: "0 6px 20px rgba(16, 32, 48, .08)",
        },
      }}
    >
      <Box
        sx={{
          position: "relative",
          flexShrink: 0,
          width: layout === "grid" ? "100%" : { xs: 88, sm: 144 },
          height: layout === "grid" ? "auto" : { xs: 88, sm: 108 },
          aspectRatio: layout === "grid" ? "16 / 9" : undefined,
          borderRadius: layout === "grid" ? 0 : 1,
          overflow: "hidden",
          bgcolor: branded ? "#19384b" : "action.hover",
        }}
      >
        <Image
          key={image}
          src={image}
          unoptimized={
            image.startsWith("https://") || image.startsWith("/media/")
          }
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(source)}
          alt=""
          fill
          sizes={
            layout === "grid"
              ? "(max-width: 599px) 100vw, (max-width: 899px) 50vw, 380px"
              : "(max-width: 599px) 157px, 192px"
          }
          style={{
            objectFit: branded ? "contain" : "cover",
            padding: branded ? "10%" : 0,
          }}
        />
      </Box>
      <Box
        sx={{
          p: layout === "grid" ? 2.5 : 0,
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Stack
          direction={layout === "grid" ? "column" : { xs: "column", sm: "row" }}
          sx={{
            justifyContent: "space-between",
            gap: 2,
            flexGrow: 1,
          }}
        >
          <Box>
            <Typography
              variant="overline"
              color="secondary"
              sx={{ fontWeight: 700 }}
            >
              {o.category}
            </Typography>
            <Typography
              variant="h5"
              component="h3"
              sx={{ fontSize: 22, mt: 0.5 }}
            >
              {o.title}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>
              {o.summary}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {courseFormatLabel(o)}
            </Typography>
          </Box>
          <Typography variant="h6" component="p" sx={{ whiteSpace: "nowrap" }}>
            {money(o.price_cents)}
          </Typography>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Stack
          direction={layout === "grid" ? "column" : { xs: "column", sm: "row" }}
          sx={{
            alignItems:
              layout === "grid"
                ? "flex-start"
                : { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Stack
            direction="row"
            sx={{
              gap: 1,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Typography variant="body2">{courseStart(o)}</Typography>
            {o.approval_required && (
              <Chip label="Approval required" variant="outlined" />
            )}
            {!o.enrollment_open && (
              <Chip
                label="Enrollment closed"
                color="warning"
                variant="outlined"
              />
            )}
          </Stack>
          <Button
            href={`/courses/${o.id}`}
            aria-label={`View course: ${o.title}`}
            endIcon={<ArrowForwardIcon />}
          >
            View course
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
