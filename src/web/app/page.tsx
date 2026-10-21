"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CollectionCard } from "../components/collection-card";
import { CourseCard } from "../components/course-card";
import { useDemoAuth } from "../components/demo-auth";
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
  InputAdornment,
  Link,
  Paper,
  Stack,
  Tab,
  Tabs,
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
  CollectionSummary,
  CollectionDetail,
  ExploreData,
  FollowedPathway,
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
// Explore is the default view; the other tabs are complete lists.
const tabs = ["explore", "courses", "collections", "pathways"] as const;
type CatalogTab = (typeof tabs)[number];
// Self-paced courses start anytime, so they sort ahead of scheduled dates.
const startKey = (o: Offering) => o.start_date ?? "";
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
const cardList = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: "minmax(0, 1fr)",
} as const;
const cardGrid = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    md: "repeat(3, minmax(0, 1fr))",
  },
} as const;
// The landing redirect is considered once per page load, against the URL as
// it first loaded (the URL is tidied before the session is known).
let landingChecked = false;
let initialSearch: string | undefined;
export default function Catalog() {
  const auth = useDemoAuth();
  const router = useRouter();
  const [offerings, setOfferings] = useState<Offering[]>([]),
    [selectedTopics, setSelectedTopics] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [layout, setLayout] = useState<"list" | "grid">("list"),
    [courseType, setCourseType] = useState<CourseTypeFilter>("all"),
    [sort, setSort] = useState<Sort>("start"),
    [tab, setTab] = useState<CatalogTab>("explore"),
    [explore, setExplore] = useState<ExploreData>(),
    [collections, setCollections] = useState<CollectionSummary[]>([]),
    [following, setFollowing] = useState<Set<string>>(new Set()),
    [collectionSlug, setCollectionSlug] = useState(""),
    [collection, setCollection] = useState<CollectionDetail>(),
    [urlReady, setUrlReady] = useState(false);
  // Signed-in learners land on My learning when they open the bare home page
  // from outside the site (a bookmark or typed address). In-site links, links
  // to a tab or filter, reloads and back/forward still show the catalog.
  useEffect(() => {
    initialSearch ??= window.location.search;
    if (landingChecked || !auth.ready) return;
    landingChecked = true;
    if (!auth.signedIn || initialSearch) return;
    const entry = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    let fromOutside = true;
    try {
      fromOutside =
        !document.referrer ||
        new URL(document.referrer).origin !== window.location.origin;
    } catch {
      /* An unreadable referrer counts as arriving from outside. */
    }
    const freshHomeLoad =
      !entry ||
      (entry.type === "navigate" && new URL(entry.name).pathname === "/");
    if (fromOutside && freshHomeLoad) router.replace("/learning");
  }, [auth.ready, auth.learnerId, router]);
  // Keep the tab and filters in the URL so views can be shared and reloaded.
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
    // Older links filter courses by collection; show them on the Courses tab.
    const legacyCollection = params.get("collection") ?? "";
    setCollectionSlug(legacyCollection);
    const tabParam = params.get("tab") as CatalogTab | null;
    if (tabParam && tabs.includes(tabParam)) setTab(tabParam);
    else if (legacyCollection) setTab("courses");
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (tab !== "explore") params.set("tab", tab);
    if (tab === "courses") {
      if (search) params.set("q", search);
      if (selectedTopics.length) params.set("topics", selectedTopics.join(","));
      if (courseType !== "all") params.set("type", courseType);
      if (sort !== "start") params.set("sort", sort);
      if (collectionSlug) params.set("collection", collectionSlug);
    }
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  }, [urlReady, tab, search, selectedTopics, courseType, sort, collectionSlug]);
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
    api<CollectionSummary[]>("collections")
      .then(setCollections)
      .catch(() => setCollections([]));
    api<ExploreData>("explore")
      .then(setExplore)
      .catch(() => setExplore({ courses: [], collections: [], pathways: [] }));
  }, []);
  // Followed pathways get a "Following" chip on their cards.
  useEffect(() => {
    if (!auth.signedIn) {
      setFollowing(new Set());
      return;
    }
    api<FollowedPathway[]>("me/pathways")
      .then((list) => setFollowing(new Set(list.map((p) => p.id))))
      .catch(() => setFollowing(new Set()));
  }, [auth.signedIn]);
  // A legacy collection filter supplies its course list.
  useEffect(() => {
    if (!collectionSlug) {
      setCollection(undefined);
      return;
    }
    let current = true;
    api<CollectionDetail>(`collections/${collectionSlug}`)
      .then((detail) => current && setCollection(detail))
      .catch(() => {
        if (!current) return;
        setCollection(undefined);
        setCollectionSlug("");
      });
    return () => {
      current = false;
    };
  }, [collectionSlug]);
  const inCollection = collection
    ? new Set(collection.offerings.map((o) => o.id))
    : undefined;
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
        (!collectionSlug || (inCollection?.has(o.id) ?? false)) &&
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
    search !== "" ||
    selectedTopics.length > 0 ||
    courseType !== "all" ||
    collectionSlug !== "";
  function clearFilters() {
    setSearch("");
    setSelectedTopics([]);
    setCourseType("all");
    setCollectionSlug("");
  }
  const allCollections = collections.filter((c) => c.kind === "collection");
  const allPathways = collections.filter((c) => c.kind === "pathway");
  // Tabs with nothing published are hidden rather than shown empty.
  const visibleTabs = tabs.filter(
    (t) =>
      (t !== "collections" || allCollections.length > 0) &&
      (t !== "pathways" || allPathways.length > 0),
  );
  const current = visibleTabs.includes(tab) ? tab : "explore";
  // Counts are hidden on phones so all four tabs fit without scrolling. Each
  // label is one span, because MUI stacks a tab's label children in a column.
  const count = (n: number) => (
    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
      &nbsp;({n})
    </Box>
  );
  const tabLabel: Record<CatalogTab, React.ReactNode> = {
    explore: "Explore",
    courses: <span>Courses{!loading && count(offerings.length)}</span>,
    collections: <span>Collections{count(allCollections.length)}</span>,
    pathways: <span>Pathways{count(allPathways.length)}</span>,
  };
  // "See all" links switch tabs and move focus to the selected tab.
  function openTab(next: CatalogTab) {
    setTab(next);
    setTimeout(() => document.getElementById(`catalog-tab-${next}`)?.focus());
  }
  const seeAll = (next: CatalogTab, text: string) => (
    <Button
      onClick={() => openTab(next)}
      endIcon={<ArrowForwardIcon />}
      sx={{ mt: 1.5 }}
    >
      {text}
    </Button>
  );
  const panel = (name: CatalogTab) => ({
    role: "tabpanel",
    id: `catalog-panel-${name}`,
    "aria-labelledby": `catalog-tab-${name}`,
    hidden: current !== name,
  });
  return (
    <>
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
        course, collection or pathway that fits your goals and your schedule.
      </Typography>
      {/* The layout toggle applies to every tab and is remembered in the browser. */}
      <Stack
        direction="row"
        sx={{
          mt: 4,
          mb: 3,
          borderBottom: 1,
          borderColor: "divider",
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 2,
          flexWrap: { xs: "wrap", sm: "nowrap" },
        }}
      >
        <Tabs
          value={current}
          onChange={(_, value: CatalogTab) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Course views"
          sx={{ flex: "1 1 auto", minWidth: 0 }}
        >
          {visibleTabs.map((t) => (
            <Tab
              key={t}
              value={t}
              label={tabLabel[t]}
              id={`catalog-tab-${t}`}
              aria-controls={`catalog-panel-${t}`}
              sx={{ minWidth: 0, px: { xs: 1.25, sm: 2 } }}
            />
          ))}
        </Tabs>
        <Box sx={{ py: 1, ml: { xs: "auto", sm: 0 } }}>
          <ToggleButtonGroup
            value={layout}
            exclusive
            size="small"
            onChange={(_, value) => changeLayout(value)}
            aria-label="Card layout"
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
        </Box>
      </Stack>

      <Box {...panel("explore")}>
        {current === "explore" && (
          <>
            {!explore && (
              <LoadingCards label="Loading featured courses" count={3} />
            )}
            {explore && explore.courses.length > 0 && (
              <Box
                component="section"
                aria-labelledby="featured-courses"
                sx={{ mb: 5 }}
              >
                <Typography
                  id="featured-courses"
                  variant="h5"
                  component="h2"
                  sx={{ mb: 2 }}
                >
                  Featured courses
                </Typography>
                <Box sx={layout === "grid" ? cardGrid : cardList}>
                  {explore.courses.map((o) => (
                    <CourseCard key={o.id} offering={o} layout={layout} />
                  ))}
                </Box>
                {seeAll("courses", `See all courses (${offerings.length})`)}
              </Box>
            )}
            {explore && explore.pathways.length > 0 && (
              <Box
                component="section"
                aria-labelledby="featured-pathways"
                sx={{ mb: 5 }}
              >
                <Typography id="featured-pathways" variant="h5" component="h2">
                  Featured pathways
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                  Courses in a recommended order. Following is free.
                </Typography>
                <Box sx={layout === "grid" ? cardGrid : cardList}>
                  {explore.pathways.map((c) => (
                    <CollectionCard
                      key={c.id}
                      layout={layout}
                      collection={c}
                      following={following.has(c.id)}
                    />
                  ))}
                </Box>
                {seeAll("pathways", `See all pathways (${allPathways.length})`)}
              </Box>
            )}
            {explore && explore.collections.length > 0 && (
              <Box
                component="section"
                aria-labelledby="featured-collections"
                sx={{ mb: 5 }}
              >
                <Typography
                  id="featured-collections"
                  variant="h5"
                  component="h2"
                >
                  Featured collections
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                  Related courses grouped by theme.
                </Typography>
                <Box sx={layout === "grid" ? cardGrid : cardList}>
                  {explore.collections.map((c) => (
                    <CollectionCard key={c.id} collection={c} layout={layout} />
                  ))}
                </Box>
                {seeAll(
                  "collections",
                  `See all collections (${allCollections.length})`,
                )}
              </Box>
            )}
          </>
        )}
      </Box>

      <Box {...panel("courses")}>
        {current === "courses" && (
          <>
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
            {collection && (
              <Stack
                direction="row"
                sx={{ mt: 2, gap: 1, alignItems: "center", flexWrap: "wrap" }}
              >
                <Chip label={`In: ${collection.title}`} />
                <Button
                  size="small"
                  onClick={() => setCollectionSlug("")}
                  aria-label={`Remove filter: ${collection.title}`}
                >
                  Remove
                </Button>
                <Link href={`/collections/${collection.slug}`} variant="body2">
                  View{" "}
                  {collection.kind === "pathway" ? "pathway" : "collection"}
                </Link>
              </Stack>
            )}
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
                {collection
                  ? collection.title
                  : selectedTopics.length === 0
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
                  {plural(filtered.length, "course", "courses")}
                </Typography>
                {filtersActive && (
                  <Button size="small" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
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
              sx={layout === "grid" ? cardGrid : cardList}
            >
              {filtered.map((o) => (
                <CourseCard key={o.id} offering={o} layout={layout} />
              ))}
            </Box>
          </>
        )}
      </Box>

      <Box {...panel("collections")}>
        {current === "collections" && (
          <>
            <Typography variant="h5" component="h2">
              All collections
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Related courses grouped by theme. Register for each course
              separately.
            </Typography>
            <Box sx={layout === "grid" ? cardGrid : cardList}>
              {allCollections.map((c) => (
                <CollectionCard key={c.id} collection={c} layout={layout} />
              ))}
            </Box>
          </>
        )}
      </Box>

      <Box {...panel("pathways")}>
        {current === "pathways" && (
          <>
            <Typography variant="h5" component="h2">
              All pathways
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Courses in a recommended order. Following a pathway is free and
              does not register you.
            </Typography>
            <Box sx={layout === "grid" ? cardGrid : cardList}>
              {allPathways.map((c) => (
                <CollectionCard
                  key={c.id}
                  layout={layout}
                  collection={c}
                  following={following.has(c.id)}
                />
              ))}
            </Box>
          </>
        )}
      </Box>
    </>
  );
}
