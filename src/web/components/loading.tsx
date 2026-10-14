"use client";
import { Box, Paper, Skeleton, Stack } from "@mui/material";
import { visuallyHidden } from "./visually-hidden";

// Placeholder cards shaped like the content they replace; announced once by label.
export function LoadingCards({
  label,
  count = 3,
  image = false,
}: {
  label: string;
  count?: number;
  image?: boolean;
}) {
  return (
    <Box role="status" aria-busy="true">
      <Box component="span" sx={visuallyHidden}>
        {label}
      </Box>
      <Stack spacing={2} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <Paper
            key={index}
            variant="outlined"
            sx={{ p: { xs: 2, sm: 3 }, display: "flex", gap: 2.5 }}
          >
            {image && (
              <Skeleton
                variant="rounded"
                sx={{
                  width: { xs: 88, sm: 144 },
                  height: { xs: 88, sm: 108 },
                  flexShrink: 0,
                }}
              />
            )}
            <Box sx={{ flex: 1 }}>
              <Skeleton width="20%" />
              <Skeleton width="55%" sx={{ fontSize: 22 }} />
              <Skeleton width="85%" />
              <Skeleton width="40%" />
            </Box>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
