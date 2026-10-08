"use client";
import NextLink from "next/link";
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Tooltip,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

export type StaffNavItem = {
  slug: string;
  href: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  count?: number;
};

// Grouped links for the staff sections. Each section is its own address, so
// these are links (aria-current marks the current one), not tabs. The desktop
// rail can collapse to icons; on phones the same list sits in a drawer.
export function StaffNav({
  items,
  current,
  collapsed = false,
  onToggle,
  onNavigate,
  onLinkClick,
}: {
  items: StaffNavItem[];
  current: string;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  /** Can cancel navigation with event.preventDefault() (unsaved changes). */
  onLinkClick?: (event: React.MouseEvent, href: string) => void;
}) {
  const groups = [...new Set(items.map((item) => item.group))];
  return (
    <Box component="nav" aria-label="Staff sections" sx={{ py: 1 }}>
      {onToggle && (
        <Box
          sx={{
            display: "flex",
            justifyContent: collapsed ? "center" : "flex-end",
            px: 1,
          }}
        >
          <Tooltip title={collapsed ? "Expand menu" : "Collapse menu"}>
            <IconButton
              onClick={onToggle}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              aria-expanded={!collapsed}
              size="small"
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
      {groups.map((group) => {
        const id = `staff-nav-${group.toLowerCase().replace(/\W+/g, "-")}`;
        return (
          // The group label sits outside the list: lists may only contain items.
          <Box key={group}>
            {!collapsed && (
              <ListSubheader
                id={id}
                component="div"
                disableSticky
                sx={{
                  bgcolor: "transparent",
                  lineHeight: 2.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  fontSize: 12,
                }}
              >
                {group}
              </ListSubheader>
            )}
            <List
              dense
              aria-labelledby={collapsed ? undefined : id}
              aria-label={collapsed ? group : undefined}
              sx={{ py: collapsed ? 0.5 : 0 }}
            >
              {items
                .filter((item) => item.group === group)
                .map((item) => {
                  const selected = item.slug === current;
                  const name =
                    item.count !== undefined
                      ? `${item.label}, ${item.count}`
                      : item.label;
                  const button = (
                    <ListItemButton
                      component={NextLink}
                      href={item.href}
                      selected={selected}
                      aria-current={selected ? "page" : undefined}
                      aria-label={collapsed ? name : undefined}
                      onClick={(event) => {
                        onLinkClick?.(event, item.href);
                        if (!event.defaultPrevented) onNavigate?.();
                      }}
                      sx={{
                        mx: 1,
                        borderRadius: 1,
                        minHeight: 40,
                        justifyContent: collapsed ? "center" : "flex-start",
                      }}
                    >
                      <ListItemIcon
                        sx={{ minWidth: collapsed ? 0 : 36, color: "inherit" }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {!collapsed && (
                        <ListItemText
                          primary={item.label}
                          slotProps={{ primary: { noWrap: true } }}
                        />
                      )}
                      {!collapsed && item.count !== undefined && (
                        <Chip
                          label={item.count}
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </ListItemButton>
                  );
                  return (
                    <li key={item.slug} style={{ listStyle: "none" }}>
                      {collapsed ? (
                        <Tooltip title={name} placement="right">
                          {button}
                        </Tooltip>
                      ) : (
                        button
                      )}
                    </li>
                  );
                })}
            </List>
          </Box>
        );
      })}
    </Box>
  );
}
