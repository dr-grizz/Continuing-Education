"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  api,
  CollectionDetail,
  courseSchedule,
  courseTypeLabel,
  FollowedPathway,
  money,
} from "../../../components/api";
import { useDemoAuth } from "../../../components/demo-auth";
import { LoadingCards } from "../../../components/loading";
import { visuallyHidden } from "../../../components/visually-hidden";
// A staff-curated collection, or a pathway whose courses are in a recommended
// order. Following a pathway is free and registers nothing (decision F4, proposed).
export default function Collection({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const auth = useDemoAuth();
  const router = useRouter();
  const [collection, setCollection] = useState<CollectionDetail>(),
    [error, setError] = useState(""),
    [following, setFollowing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    api<CollectionDetail>(`collections/${slug}`)
      .then(setCollection)
      .catch((e) => setError(e.message));
  }, [slug]);
  const pathway = collection?.kind === "pathway";
  useEffect(() => {
    if (!auth.signedIn || !pathway || !collection) {
      setFollowing(false);
      return;
    }
    api<FollowedPathway[]>("me/pathways")
      .then((list) => setFollowing(list.some((p) => p.id === collection.id)))
      .catch(() => setFollowing(false));
  }, [auth.learnerId, pathway, collection]);
  async function toggleFollow() {
    if (!collection) return;
    if (!auth.signedIn) {
      router.push(
        `/sign-in?returnTo=${encodeURIComponent(`/collections/${slug}`)}`,
      );
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ following: boolean }>(
        `me/pathways/${collection.id}`,
        { body: { following: !following } },
      );
      setFollowing(result.following);
      setMessage(
        result.following
          ? "Following. This pathway now appears in My learning."
          : "You stopped following this pathway.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!collection)
    return error ? (
      <Alert severity="error">
        {error}{" "}
        <Link href="/" underline="always">
          Browse all courses
        </Link>
      </Alert>
    ) : (
      <LoadingCards label="Loading collection" count={2} />
    );
  return (
    <>
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link href="/">Courses</Link>
        <Typography>{collection.title}</Typography>
      </Breadcrumbs>
      <Typography variant="overline" color="secondary" sx={{ fontWeight: 700 }}>
        {pathway ? "Pathway" : "Collection"}
      </Typography>
      <Typography
        variant="h3"
        component="h1"
        sx={{ fontSize: { xs: 30, md: 40 }, mt: 1 }}
      >
        {collection.title}
      </Typography>
      <Typography
        sx={{ mt: 2, fontSize: 18, maxWidth: 720 }}
        color="text.secondary"
      >
        {collection.summary}
      </Typography>
      {pathway && (
        <Stack spacing={1.5} sx={{ mt: 3, maxWidth: 720 }}>
          <Alert severity="info" role="note">
            The order is a recommendation, not a requirement. Following is free
            and does not register you; register for each course separately.
          </Alert>
          <Box>
            {/* Action labels rather than aria-pressed, so the name says what happens. */}
            <Button
              variant={following ? "outlined" : "contained"}
              onClick={toggleFollow}
              aria-disabled={busy || undefined}
            >
              {!auth.signedIn
                ? "Sign in to follow this pathway"
                : following
                  ? "Stop following"
                  : "Follow pathway"}
            </Button>
            <Typography
              variant="body2"
              color="text.secondary"
              aria-live="polite"
              sx={{ mt: message ? 1 : 0 }}
            >
              {message}
            </Typography>
          </Box>
        </Stack>
      )}
      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 2 }}>
        {pathway ? "Recommended order" : "Courses"}
      </Typography>
      {collection.offerings.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography>
            No courses in this {pathway ? "pathway" : "collection"} are offered
            right now.
          </Typography>
        </Paper>
      ) : (
        <Box
          component={pathway ? "ol" : "ul"}
          sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 2 }}
        >
          {collection.offerings.map((course, index) => (
            <Paper
              component="li"
              key={course.id}
              variant="outlined"
              sx={{
                p: { xs: 2, sm: 3 },
                display: "flex",
                gap: 2,
                alignItems: "flex-start",
              }}
            >
              {pathway && (
                <Box
                  aria-hidden="true"
                  sx={{
                    flex: "0 0 auto",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                  }}
                >
                  {index + 1}
                </Box>
              )}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" component="h3">
                  <Link href={`/courses/${course.id}`}>
                    {pathway && (
                      <Box component="span" sx={visuallyHidden}>
                        Step {index + 1}:{" "}
                      </Box>
                    )}
                    {course.title}
                  </Link>
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {course.summary}
                </Typography>
                <Stack
                  direction="row"
                  sx={{
                    mt: 1.5,
                    gap: 1,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <Chip label={course.category} variant="outlined" />
                  <Chip label={courseTypeLabel(course)} variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    {courseSchedule(course)} · {money(course.price_cents)}
                  </Typography>
                </Stack>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </>
  );
}
