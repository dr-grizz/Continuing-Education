"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  date,
  money,
  courseStart,
  courseTypeLabel,
  type Offering,
} from "./api";
import { courseImage } from "./course-images";
import { brand } from "../app/theme";

// Prototype editorial picks. Course details still come from the catalog API.
const featuredIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000005",
];

export function FeaturedCourses({ offerings }: { offerings: Offering[] }) {
  const [selected, setSelected] = useState(0);
  const featured = featuredIds.flatMap((id) => {
    const course = offerings.find(
      (offering) => offering.id === id && offering.published,
    );
    return course ? [course] : [];
  });
  if (featured.length === 0) return null;
  const index = selected % featured.length;
  const course = featured[index];
  function move(offset: number) {
    setSelected((index + offset + featured.length) % featured.length);
  }

  return (
    <Paper
      component="section"
      aria-label="Featured course spotlight"
      elevation={0}
      sx={{
        mb: 4,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        bgcolor: brand.navy,
        color: brand.onNavy,
      }}
    >
      <Box
        sx={{
          p: { xs: 2.5, sm: 4 },
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <Typography
          variant="overline"
          sx={{ fontWeight: 700, letterSpacing: 1.5, color: "#e7d99b" }}
        >
          Featured course · {courseTypeLabel(course)}
        </Typography>
        <Box aria-live="polite" aria-atomic="true" sx={{ flex: 1 }}>
          <Typography
            component="h2"
            variant="h4"
            sx={{ mt: 1, fontSize: { xs: 27, sm: 32 }, lineHeight: 1.2 }}
          >
            {course.title}
          </Typography>
          <Typography
            sx={{ mt: 1.5, color: "#e2e8ed", lineHeight: 1.65, maxWidth: 430 }}
          >
            {course.summary}
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, color: "#e2e8ed" }}>
            {money(course.price_cents)} · {courseStart(course)}
          </Typography>
          <Button
            href={`/courses/${course.id}`}
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            aria-label={`Explore ${course.title}`}
            sx={{
              mt: 2.5,
              bgcolor: "white",
              color: brand.navy,
              "&:hover": { bgcolor: "#edf1f4" },
            }}
          >
            Explore course
          </Button>
        </Box>
        {featured.length > 1 && (
          <Stack direction="row" sx={{ mt: 3, gap: 1, alignItems: "center" }}>
            <IconButton
              size="small"
              aria-label="Previous featured course"
              onClick={() => move(-1)}
              sx={{ color: "inherit", width: 44, height: 44 }}
            >
              <ChevronLeftIcon />
            </IconButton>
            {featured.map((item, itemIndex) => (
              <IconButton
                key={item.id}
                size="small"
                aria-label={`Show ${item.title}`}
                aria-pressed={itemIndex === index}
                onClick={() => setSelected(itemIndex)}
                sx={{ color: "inherit", width: 44, height: 44 }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: itemIndex === index ? "white" : "transparent",
                    border: "1px solid white",
                  }}
                />
              </IconButton>
            ))}
            <IconButton
              size="small"
              aria-label="Next featured course"
              onClick={() => move(1)}
              sx={{ color: "inherit", width: 44, height: 44 }}
            >
              <ChevronRightIcon />
            </IconButton>
            <Typography variant="caption" sx={{ ml: 1, color: "#e2e8ed" }}>
              {index + 1} / {featured.length}
            </Typography>
          </Stack>
        )}
      </Box>
      <Box
        sx={{
          position: "relative",
          // Hidden on phones so the catalog appears sooner.
          display: { xs: "none", sm: "block" },
          minHeight: { sm: 270, md: 360 },
          order: { xs: -1, md: 0 },
        }}
      >
        <Image
          key={course.id}
          src={courseImage(course)}
          alt=""
          fill
          sizes="(max-width: 899px) 100vw, 640px"
          style={{ objectFit: "cover" }}
        />
      </Box>
    </Paper>
  );
}
