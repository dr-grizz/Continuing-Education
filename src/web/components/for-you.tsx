"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { api, FollowedPathway, Learning, Offering } from "./api";

// Registration states that leave a pathway step open for the learner.
const open = new Set(["expired", "approval_expired", "declined"]);
const needsAction = new Set(["reserved", "approved"]);
type Personal = {
  pathways: FollowedPathway[];
  saved: Offering[];
  learning: Learning[];
};

// Signed-in learners' part of the Explore tab: the next unregistered course in
// each followed pathway, registrations needing action, and saved courses.
// Uses registration status only; completion needs Canvas (decision F11).
export function ForYou() {
  const [data, setData] = useState<Personal>();
  useEffect(() => {
    Promise.all([
      api<FollowedPathway[]>("me/pathways"),
      api<Offering[]>("me/saved-courses"),
      api<Learning[]>("me/learning"),
    ])
      .then(([pathways, saved, learning]) => {
        setData({ pathways, saved, learning });
      })
      .catch(() => setData(undefined));
  }, []);
  if (!data) return null;
  const actions = data.learning.filter((row) => needsAction.has(row.status));
  const empty = !data.pathways.length && !data.saved.length && !actions.length;
  return (
    <Box component="section" aria-labelledby="for-you-heading" sx={{ mb: 5 }}>
      <Typography id="for-you-heading" variant="h5" component="h2">
        For you
      </Typography>
      {empty && (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Follow a pathway or save courses, and your next steps appear here.
        </Typography>
      )}
      {actions.length > 0 && (
        <Alert severity="info" role="note" sx={{ mt: 2 }}>
          {actions.length === 1
            ? "1 registration needs your attention."
            : `${actions.length} registrations need your attention.`}{" "}
          <Link href="/learning" underline="always">
            Go to My learning
          </Link>
        </Alert>
      )}
      {data.pathways.length > 0 && (
        <>
          <Typography variant="h6" component="h3" sx={{ mt: 3 }}>
            Continue your pathways
          </Typography>
          <Box
            sx={{
              mt: 1.5,
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
            }}
          >
            {data.pathways.map((pathway) => {
              const index = pathway.steps.findIndex(
                (step) =>
                  step.registration_status === null ||
                  open.has(step.registration_status),
              );
              const next = index >= 0 ? pathway.steps[index] : undefined;
              return (
                <Paper key={pathway.id} variant="outlined" sx={{ p: 2.5 }}>
                  <Link
                    href={`/collections/${pathway.slug}`}
                    variant="subtitle1"
                    sx={{ fontWeight: 600 }}
                  >
                    {pathway.title}
                  </Link>
                  {next ? (
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      sx={{
                        mt: 1,
                        gap: 1,
                        justifyContent: "space-between",
                        alignItems: { sm: "center" },
                      }}
                    >
                      <Typography>
                        Next: {next.title}{" "}
                        <Typography component="span" color="text.secondary">
                          (step {index + 1} of {pathway.steps.length})
                        </Typography>
                      </Typography>
                      <Button
                        href={`/courses/${next.id}`}
                        aria-label={`View course: ${next.title}`}
                        endIcon={<ArrowForwardIcon />}
                        sx={{ flexShrink: 0, alignSelf: "flex-start" }}
                      >
                        View course
                      </Button>
                    </Stack>
                  ) : (
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                      You have registered for every course in this pathway.
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Box>
        </>
      )}
      {data.saved.length > 0 && (
        <>
          <Typography variant="h6" component="h3" sx={{ mt: 3 }}>
            Saved courses
          </Typography>
          <Box
            component="ul"
            sx={{ m: 0, mt: 1, pl: 2.5, display: "grid", gap: 0.5 }}
          >
            {data.saved.slice(0, 3).map((course) => (
              <li key={course.id}>
                <Link href={`/courses/${course.id}`}>{course.title}</Link>
              </li>
            ))}
          </Box>
          <Link
            href="/learning"
            variant="body2"
            sx={{ display: "inline-block", mt: 1 }}
          >
            {data.saved.length > 3
              ? `See all ${data.saved.length} saved courses in My learning`
              : "Manage saved courses in My learning"}
          </Link>
        </>
      )}
    </Box>
  );
}
