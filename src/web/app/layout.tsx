import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import Theme from "./theme";
import Shell from "../components/shell";
import { DemoAuthProvider } from "../components/demo-auth";
import { StaffSessionProvider } from "../components/staff-session";
export const metadata: Metadata = {
  title: "Continuing Education | Local prototype",
  description: "Local continuing education portal with sample offerings.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // The color scheme script sets a class on <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/brand/typography.css" />
      </head>
      <body>
        <InitColorSchemeScript attribute="class" />
        <AppRouterCacheProvider>
          <Theme>
            <DemoAuthProvider>
              <StaffSessionProvider>
                <Shell>{children}</Shell>
              </StaffSessionProvider>
            </DemoAuthProvider>
          </Theme>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
