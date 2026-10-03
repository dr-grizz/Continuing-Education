"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { courseImage } from "../components/course-images";
import { FeaturedCourses } from "../components/featured-courses";
import { LoadingCards } from "../components/loading";
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Divider,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ViewListIcon from "@mui/icons-material/ViewList";
import GridViewIcon from "@mui/icons-material/GridView";
import {
  api,
  date,
  money,
  courseStart,
  courseFormatLabel,
  Offering,
} from "../components/api";
const categories = ["Technology", "Leadership", "Healthcare", "Ministry"];
const courseTypes = {
  all: "All types",
  cohort: "Scheduled",
  self_paced: "Self-paced",
};
const sorts = {
  start: "Soonest start",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  title: "Title A–Z",
};
type CourseTypeFilter = keyof typeof courseTypes;
type Sort = keyof typeof sorts;
// Self-paced courses start anytime, so they sort ahead of scheduled dates.
const startKey = (o: Offering) => o.start_date ?? "";
export default function Catalog() {
  const [offerings, setOfferings] = useState<Offering[]>([]),
    [selectedTopics, setSelectedTopics] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [layout, setLayout] = useState<"list" | "grid">("list"),
    [courseType, setCourseType] = useState<CourseTypeFilter>("all"),
    [sort, setSort] = useState<Sort>("start"),
    [urlReady, setUrlReady] = useState(false);
  // Keep filters in the URL so filtered views can be shared and reloaded.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("q") ?? "");
    setSelectedTopics(
      (params.get("topics") ?? "")
        .split(",")
        .filter((topic) => categories.includes(topic)),
    );
    const type = params.get("type");
    if (type && type in courseTypes) setCourseType(type as CourseTypeFilter);
    const sortParam = params.get("sort");
    if (sortParam && sortParam in sorts) setSort(sortParam as Sort);
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (selectedTopics.length) params.set("topics", selectedTopics.join(","));
    if (courseType !== "all") params.set("type", courseType);
    if (sort !== "start") params.set("sort", sort);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  }, [urlReady, search, selectedTopics, courseType, sort]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ce-catalog-layout");
      if (saved === "list" || saved === "grid") setLayout(saved);
    } catch {
      /* Storage may be unavailable; the toggle still works. */
    }
  }, []);
  function changeLayout(value: "list" | "grid" | null) {
    if (!value) return;
    setLayout(value);
    try {
      localStorage.setItem("ce-catalog-layout", value);
    } catch {
      /* Retain the selection for this visit without persistence. */
    }
  }
  useEffect(() => {
    api<Offering[]>("offerings")
      .then(setOfferings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const filtered = offerings
    .filter(
      (o) =>
        (selectedTopics.length === 0 || selectedTopics.includes(o.category)) &&
        (courseType === "all" || o.course_type === courseType) &&
        `${o.title} ${o.summary}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "price-asc"
        ? a.price_cents - b.price_cents
        : sort === "price-desc"
          ? b.price_cents - a.price_cents
          : sort === "title"
            ? a.title.localeCompare(b.title)
            : startKey(a).localeCompare(startKey(b)) ||
              a.title.localeCompare(b.title),
    );
  const filtersActive =
    search !== "" || selectedTopics.length > 0 || courseType !== "all";
  function clearFilters() {
    setSearch("");
    setSelectedTopics([]);
    setCourseType("all");
  }
  return (
    <>
      <FeaturedCourses offerings={offerings} />
      <Typography
        variant="overline"
        color="secondary"
        sx={{ fontWeight: 700, letterSpacing: 1.6 }}
      >
        LEARN WITH PURPOSE
      </Typography>
      <Typography
        variant="h3"
        component="h1"
        sx={{ fontSize: { xs: 32, md: 42 }, mt: 1 }}
      >
        Build skills. Keep learning.
      </Typography>
      <Typography
        color="text.secondary"
        sx={{ mt: 2, maxWidth: 680, fontSize: 18, lineHeight: 1.7 }}
      >
        Explore non-credit courses for your work, leadership and service. Find a
        course that fits your goals and your schedule.
      </Typography>
      <Box sx={{ mt: 5 }}>
        <Box>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr 1fr",
                md: "minmax(0, 2fr) repeat(3, minmax(0, 1fr))",
              },
            }}
          >
            <TextField
              fullWidth
              sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}
              label="Search courses"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or topic"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <FormControl
              size="small"
              fullWidth
              sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}
            >
              <InputLabel id="topic-filter-label" shrink>
                Topics
              </InputLabel>
              <Select<string[]>
                labelId="topic-filter-label"
                id="topic-filter"
                label="Topics"
                multiple
                displayEmpty
                value={selectedTopics.length ? selectedTopics : ["all"]}
                onChange={(event) => {
                  const value = event.target.value;
                  const topics =
                    typeof value === "string" ? value.split(",") : value;
                  setSelectedTopics(
                    topics.includes("all") && selectedTopics.length > 0
                      ? []
                      : topics.filter((topic) => topic !== "all"),
                  );
                }}
                renderValue={(topics) =>
                  topics.length === 0 || topics.includes("all")
                    ? "All topics"
                    : topics.join(", ")
                }
              >
                <MenuItem value="all">
                  <Checkbox
                    checked={selectedTopics.length === 0}
                    tabIndex={-1}
                    aria-hidden="true"
                    sx={{ pointerEvents: "none" }}
                    disableRipple
                  />
                  <ListItemText primary="All topics" />
                </MenuItem>
                {categories.map((topic) => (
                  <MenuItem key={topic} value={topic}>
                    <Checkbox
                      checked={selectedTopics.includes(topic)}
                      tabIndex={-1}
                      aria-hidden="true"
                      sx={{ pointerEvents: "none" }}
                      disableRipple
                    />
                    <ListItemText primary={topic} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              select
              label="Course type"
              value={courseType}
              onChange={(e) =>
                setCourseType(e.target.value as CourseTypeFilter)
              }
            >
              {Object.entries(courseTypes).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              {Object.entries(sorts).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            All offerings are non-credit. Dates and prices are sample data.
          </Typography>
          <Stack
            direction="row"
            sx={{
              my: 2.5,
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="h6" component="h2">
              {selectedTopics.length === 0
                ? "All courses"
                : selectedTopics.length === 1
                  ? selectedTopics[0]
                  : "Selected courses"}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Typography
                variant="body2"
                color="text.secondary"
                aria-live="polite"
              >
                {filtered.length} {filtered.length === 1 ? "course" : "courses"}
              </Typography>
              {filtersActive && (
                <Button size="small" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
              <ToggleButtonGroup
                value={layout}
                exclusive
                size="small"
                onChange={(_, value) => changeLayout(value)}
                aria-label="Course layout"
              >
                <ToggleButton
                  value="list"
                  aria-label="List layout"
                  sx={{ gap: 0.75, textTransform: "none" }}
                >
                  <ViewListIcon fontSize="small" />
                  List
                </ToggleButton>
                <ToggleButton
                  value="grid"
                  aria-label="Grid layout"
                  sx={{ gap: 0.75, textTransform: "none" }}
                >
                  <GridViewIcon fontSize="small" />
                  Grid
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {loading && <LoadingCards label="Loading courses" image />}
          {!loading && !error && filtered.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography>No courses match your search.</Typography>
              <Button onClick={clearFilters}>Clear filters</Button>
            </Paper>
          )}
          <Box
            data-layout={layout}
            sx={{
              display: "grid",
              gridTemplateColumns:
                layout === "grid"
                  ? {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                      md: "repeat(3, minmax(0, 1fr))",
                    }
                  : "minmax(0, 1fr)",
              gap: 2,
            }}
          >
            {filtered.map((o) => (
              <Paper
                key={o.id}
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
                    bgcolor: "action.hover",
                  }}
                >
                  <Image
                    src={courseImage(o)}
                    alt=""
                    fill
                    sizes={
                      layout === "grid"
                        ? "(max-width: 599px) 100vw, (max-width: 899px) 50vw, 380px"
                        : "(max-width: 599px) 157px, 192px"
                    }
                    style={{ objectFit: "cover" }}
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
                    direction={
                      layout === "grid" ? "column" : { xs: "column", sm: "row" }
                    }
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
                      <Typography
                        color="text.secondary"
                        sx={{ mt: 1, lineHeight: 1.7 }}
                      >
                        {o.summary}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1.5 }}
                      >
                        {courseFormatLabel(o)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="h6"
                      component="p"
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      {money(o.price_cents)}
                    </Typography>
                  </Stack>
                  <Divider sx={{ my: 2 }} />
                  <Stack
                    direction={
                      layout === "grid" ? "column" : { xs: "column", sm: "row" }
                    }
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
            ))}
          </Box>
        </Box>
      </Box>
    </>
  );
}
