import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import Theme from "./theme";
import Shell from "../components/shell";
import { DemoAuthProvider } from "../components/demo-auth";
// Figtree: a free, self-hosted (next/font) stand-in for Proxima Nova, the cedarville.edu font.
const sans = Figtree({ subsets: ["latin"], variable: "--font-sans" });
export const metadata: Metadata = {
  title: "Continuing Education | Local prototype",
  description: "Local continuing education portal with sample offerings.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <AppRouterCacheProvider>
          <Theme>
            <DemoAuthProvider>
              <Shell>{children}</Shell>
            </DemoAuthProvider>
          </Theme>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
