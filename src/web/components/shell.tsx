"use client";
import {
  AppBar,
  Alert,
  CircularProgress,
  Paper,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Link,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useDemoAuth } from "./demo-auth";
import { useStaffSession } from "./staff-session";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import Image from "next/image";
import MenuIcon from "@mui/icons-material/Menu";
import SettingsIcon from "@mui/icons-material/Settings";
import { brand } from "../app/theme";
import { StripeTestCardsButton } from "./stripe-test-cards";
const navLinks = [
  ["/", "Courses"],
  ["/learning", "My learning"],
  ["/badges", "My badges"],
  ["/staff", "Admin"],
];
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The staff workspace is an admin layout: full width, with its own sidebar.
  const staff = pathname === "/staff" || pathname.startsWith("/staff/");
  const width = staff ? false : "lg";
  const current = (href: string) =>
    pathname === href || (href === "/staff" && staff);
  const auth = useDemoAuth();
  const staffSession = useStaffSession();
  const showSignIn =
    auth.ready && staffSession.ready && !auth.signedIn && !staffSession.member;
  const showSignOut = auth.ready && Boolean(auth.signedIn);
  const router = useRouter();
  const [sessionError, setSessionError] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  async function signOut() {
    setMenuAnchor(null);
    try {
      await auth.signOut();
      setSessionError("");
      router.push("/");
    } catch {
      setSessionError("Unable to sign out. Try again.");
    }
  }
  return (
    <>
      <Link
        href="#main"
        sx={{
          position: "absolute",
          top: -60,
          left: 12,
          zIndex: 1400,
          p: 1,
          bgcolor: "background.paper",
          "&:focus": { top: 8 },
        }}
      >
        Skip to content
      </Link>
      {sessionError && <Alert severity="error">{sessionError}</Alert>}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: brand.navy,
          color: brand.onNavy,
          // Keep the brand bar in forced-color modes: the logo is white artwork
          // and the gold underline marks the current page (navy/white is high
          // contrast already).
          "@media (forced-colors: active)": { forcedColorAdjust: "none" },
        }}
      >
        <Container maxWidth={width}>
          <Toolbar
            disableGutters
            sx={{ minHeight: { xs: 64, md: 80 }, gap: 2, py: 1 }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Link
                href="/"
                color="inherit"
                sx={{
                  display: "block",
                  width: { xs: 196, sm: 260, md: 300 },
                  maxWidth: "100%",
                  lineHeight: 0,
                }}
              >
                <Image
                  src="/brand/cedarville-continuing-education-white.png"
                  alt="Cedarville University Continuing Education"
                  width={4173}
                  height={914}
                  sizes="(max-width: 599px) 196px, (max-width: 899px) 260px, 300px"
                  style={{ width: "100%", height: "auto" }}
                  loading="eager"
                />
              </Link>
            </Box>
            <Stack
              direction="row"
              spacing={0.5}
              component="nav"
              aria-label="Main navigation"
              sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}
            >
              {navLinks.map(([href, label]) => (
                <Button
                  key={href}
                  href={href}
                  color="inherit"
                  aria-current={current(href) ? "page" : undefined}
                  sx={{
                    borderBottom: current(href)
                      ? `2px solid ${brand.gold}`
                      : "2px solid transparent",
                    borderRadius: 0,
                  }}
                >
                  {label}
                </Button>
              ))}
              {showSignOut && (
                <Button color="inherit" onClick={signOut}>
                  Sign out
                </Button>
              )}
              {showSignIn && (
                <Button color="inherit" href="/sign-in">
                  Sign in
                </Button>
              )}
              {auth.ready && staffSession.member && !auth.signedIn && (
                <Button color="inherit" href="/sign-in">
                  Use as learner
                </Button>
              )}
            </Stack>
            {/* Settings sits at the right of the bar at every width; the
                gold underline marks it as the current page, like the links. */}
            <IconButton
              href="/settings"
              color="inherit"
              aria-label="Settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              sx={{
                width: 48,
                height: 48,
                borderRadius: 0,
                borderBottom:
                  pathname === "/settings"
                    ? `2px solid ${brand.gold}`
                    : "2px solid transparent",
              }}
            >
              <SettingsIcon />
            </IconButton>
            <IconButton
              color="inherit"
              aria-label="Open navigation menu"
              aria-controls={menuAnchor ? "main-menu" : undefined}
              aria-haspopup="true"
              aria-expanded={menuAnchor ? "true" : undefined}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{
                display: { xs: "inline-flex", md: "none" },
                width: 48,
                height: 48,
              }}
            >
              <MenuIcon />
            </IconButton>
            <Menu
              id="main-menu"
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              slotProps={{ list: { "aria-label": "Main navigation" } }}
            >
              {auth.signedIn && (
                <ListSubheader
                  sx={{
                    lineHeight: 1.5,
                    py: 1,
                    maxWidth: 300,
                    overflowWrap: "anywhere",
                  }}
                >
                  Signed in as {auth.displayName}
                </ListSubheader>
              )}
              {auth.signedIn && <Divider />}
              {navLinks.map(([href, label]) => (
                <MenuItem
                  key={href}
                  component="a"
                  href={href}
                  selected={current(href)}
                  aria-current={current(href) ? "page" : undefined}
                  sx={{ minHeight: 48 }}
                >
                  {label}
                </MenuItem>
              ))}
              {(showSignIn || showSignOut) && <Divider />}
              {showSignOut && (
                <MenuItem onClick={signOut} sx={{ minHeight: 48 }}>
                  Sign out
                </MenuItem>
              )}
              {showSignIn && (
                <MenuItem component="a" href="/sign-in" sx={{ minHeight: 48 }}>
                  Sign in
                </MenuItem>
              )}
              {auth.ready && staffSession.member && !auth.signedIn && (
                <MenuItem component="a" href="/sign-in" sx={{ minHeight: 48 }}>
                  Use as learner
                </MenuItem>
              )}
            </Menu>
          </Toolbar>
          {auth.signedIn && (
            <Typography
              variant="caption"
              sx={{
                display: { xs: "none", md: "block" },
                pb: 1,
                color: brand.onNavyMuted,
                overflowWrap: "anywhere",
              }}
            >
              Signed in as {auth.displayName}
            </Typography>
          )}
        </Container>
      </AppBar>
      <Box
        sx={(theme) => ({
          bgcolor: "#fff8e6",
          borderBottom: "1px solid #ead8a8",
          ...theme.applyStyles("dark", {
            bgcolor: "#2b2412",
            borderColor: "#5c4a1c",
          }),
        })}
      >
        <Container maxWidth={width}>
          <Typography variant="body2" sx={{ py: { xs: 0.75, sm: 1 } }}>
            Local prototype · Sample data only
            <Box
              component="span"
              sx={{ display: { xs: "none", sm: "inline" } }}
            >
              {" "}
              · No real payments or Canvas enrollments.
            </Box>{" "}
            · <StripeTestCardsButton />
          </Typography>
        </Container>
      </Box>
      <Container
        component="main"
        id="main"
        tabIndex={-1}
        maxWidth={width}
        disableGutters={staff}
        sx={{ py: staff ? 0 : { xs: 3, md: 5 }, minHeight: "75vh" }}
      >
        {pathname === "/learning" && !auth.ready ? (
          <CircularProgress aria-label="Loading learner session" />
        ) : pathname === "/learning" && !auth.signedIn ? (
          <Paper variant="outlined" sx={{ p: 4 }}>
            <Typography component="h1" variant="h4">
              My learning
            </Typography>
            <Typography sx={{ my: 2 }}>
              Sign in to view your demo registrations and course access.
            </Typography>
            <Button variant="contained" href="/sign-in?returnTo=%2Flearning">
              Sign in
            </Button>
          </Paper>
        ) : (
          children
        )}
      </Container>
      <Box
        component="footer"
        sx={{ borderTop: 1, borderColor: "divider", py: 3 }}
      >
        <Container maxWidth={width}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Continuing Education · Non-credit learning
            </Typography>
            <Link
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              variant="body2"
            >
              Prototype API documentation
            </Link>
          </Stack>
        </Container>
      </Box>
    </>
  );
}
