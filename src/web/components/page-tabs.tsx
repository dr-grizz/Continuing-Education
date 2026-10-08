"use client";
import NextLink from "next/link";
import { Box, Link } from "@mui/material";

// Tab-style links for staff pages whose tabs each have their own address
// (offering and collection pages). They are links in a labelled nav, with
// aria-current on the current one, not ARIA tabs.
export function PageTabs({
  label,
  tabs,
  current,
  hrefOf,
  onFollow,
}: {
  label: string;
  tabs: readonly { slug: string; label: string }[];
  current: string;
  hrefOf: (slug: string) => string;
  /** Called from each link's onClick, for example to ask about unsaved changes. */
  onFollow: (href: string) => (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <Box
      component="nav"
      aria-label={label}
      sx={{ mt: 2, mb: 3, borderBottom: 1, borderColor: "divider" }}
    >
      <Box
        component="ul"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: { xs: 0, sm: 1 },
          listStyle: "none",
          p: 0,
          m: 0,
        }}
      >
        {tabs.map((t) => {
          const selected = t.slug === current;
          return (
            <li key={t.slug}>
              <Link
                component={NextLink}
                href={hrefOf(t.slug)}
                aria-current={selected ? "page" : undefined}
                onClick={onFollow(hrefOf(t.slug))}
                underline="none"
                sx={{
                  display: "block",
                  px: 1.5,
                  py: 1.25,
                  fontWeight: selected ? 700 : 500,
                  color: selected ? "primary.main" : "text.secondary",
                  borderBottom: 3,
                  borderColor: selected ? "primary.main" : "transparent",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}
