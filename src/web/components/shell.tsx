"use client";
import {
  AppBar,
  Alert,
  CircularProgress,
  Paper,
  Box,
  Button,
  Container,
  Link,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useDemoAuth } from "./demo-auth";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import Image from "next/image";
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useDemoAuth();
  const router = useRouter();
  const [sessionError, setSessionError] = useState("");
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
          bgcolor: "white",
          "&:focus": { top: 8 },
        }}
      >
        Skip to content
      </Link>
      {sessionError && <Alert severity="error">{sessionError}</Alert>}
      <AppBar position="static" elevation={0}>
        <Container maxWidth="lg">
          <Toolbar
            disableGutters
            sx={{
              minHeight: { xs: 92, sm: 88 },
              flexWrap: "wrap",
              gap: 2,
              py: 1,
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Link
                href="/"
                color="inherit"
                sx={{
                  display: "block",
                  width: { xs: 280, sm: 320 },
                  maxWidth: "100%",
                  lineHeight: 0,
                }}
              >
                <Image
                  src="/brand/cedarville-continuing-education-white.png"
                  alt="Cedarville University Continuing Education"
                  width={4173}
                  height={914}
                  sizes="(max-width: 599px) 280px, 320px"
                  style={{ width: "100%", height: "auto" }}
                />
              </Link>
            </Box>
            <Stack
              direction="row"
              spacing={0.5}
              component="nav"
              aria-label="Main navigation"
              sx={{ flexWrap: "wrap", maxWidth: "100%", rowGap: 1 }}
            >
              {[
                ["/", "Courses"],
                ["/learning", "My learning"],
                ["/staff", "Staff"],
              ].map(([href, label]) => (
                <Button
                  key={href}
                  href={href}
                  color="inherit"
                  aria-current={pathname === href ? "page" : undefined}
                  sx={{
                    borderBottom:
                      pathname === href
                        ? "2px solid #d8b75d"
                        : "2px solid transparent",
                    borderRadius: 0,
                  }}
                >
                  {label}
                </Button>
              ))}
              {auth.ready &&
                (auth.email ? (
                  <Button
                    color="inherit"
                    onClick={async () => {
                      try {
                        await auth.signOut();
                        setSessionError("");
                        router.push("/");
                      } catch {
                        setSessionError("Unable to sign out. Try again.");
                      }
                    }}
                  >
                    Sign out
                  </Button>
                ) : (
                  <Button color="inherit" href="/sign-in">
                    Sign in
                  </Button>
                ))}
            </Stack>
            {auth.email && (
              <Typography
                variant="caption"
                sx={{ width: "100%", overflowWrap: "anywhere" }}
              >
                Demo session: {auth.email}
              </Typography>
            )}
          </Toolbar>
        </Container>
      </AppBar>
      <Box sx={{ bgcolor: "#fff8e6", borderBottom: "1px solid #ead8a8" }}>
        <Container maxWidth="lg">
          <Typography variant="body2" sx={{ py: 1 }}>
            Local prototype · Sample courses and demo accounts. No real payments
            or Canvas enrollments.
          </Typography>
        </Container>
      </Box>
      <Container
        component="main"
        id="main"
        tabIndex={-1}
        maxWidth="lg"
        sx={{ py: { xs: 3, md: 5 }, minHeight: "75vh" }}
      >
        {pathname === "/learning" && !auth.ready ? (
          <CircularProgress aria-label="Loading demo session" />
        ) : pathname === "/learning" && !auth.email ? (
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
      <Box component="footer" sx={{ borderTop: "1px solid #dde2e7", py: 3 }}>
        <Container maxWidth="lg">
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
              href="http://localhost:3001/api/docs"
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
