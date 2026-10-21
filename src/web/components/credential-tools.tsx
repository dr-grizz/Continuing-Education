"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useColorScheme } from "@mui/material/styles";
import { Alert, Box, LinearProgress, Paper } from "@mui/material";
import { useUnsavedChanges } from "./unsaved-changes";

export type CredentialTool =
  | "issuer"
  | "publishing"
  | "awards"
  | "certificates"
  | "issuances"
  | "my-badges";
const labels: Record<CredentialTool, string> = {
  issuer: "Badge designer",
  publishing: "Badge publishing and course mapping",
  awards: "Manual and CSV badge awards",
  certificates: "Certificate designer and issuance",
  issuances: "Badge and certificate issuance register",
  "my-badges": "My earned badges and certificates",
};
export function CredentialTools({ tool }: { tool: CredentialTool }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(950);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef(false);
  const dirty = useRef(false);
  const router = useRouter();
  const query = useSearchParams();
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const { setDirty } = useUnsavedChanges();
  useEffect(() => {
    setReady(false);
    loaded.current = false;
    setError("");
    const timer = setTimeout(
      () =>
        !loaded.current &&
        setError(
          "The credential workspace did not load. Reload this page to try again.",
        ),
      20000,
    );
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (
        event.data?.type === "cu-badge-height" &&
        Number.isFinite(event.data.height)
      )
        setHeight(Math.max(450, Math.min(30000, event.data.height)));
      if (event.data?.type === "cu-badge-dirty") {
        dirty.current = event.data.dirty === true;
        setDirty(event.data.dirty === true);
      }
      if (
        event.data?.type === "cu-badge-navigate" &&
        typeof event.data.href === "string" &&
        /^\/(staff(?:\/|$)|badges(?:\?|$)|sign-in(?:\?|$))/.test(
          event.data.href,
        )
      ) {
        if (
          dirty.current &&
          !window.confirm("Leave without saving your credential design?")
        )
          return;
        setDirty(false);
        router.push(event.data.href);
      }
    }
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      setDirty(false);
    };
  }, [tool, dark, router, setDirty]);
  const params = new URLSearchParams({ theme: dark ? "dark" : "light" });
  if (query.get("draft")) params.set("draft", query.get("draft")!);
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", minWidth: 0 }}>
      {!ready && <LinearProgress aria-label="Loading credential workspace" />}
      {error && <Alert severity="error">{error}</Alert>}
      <Box
        component="iframe"
        ref={frame}
        title={labels[tool]}
        src={`/credential-tools/${tool}.html?${params}`}
        onLoad={() => {
          loaded.current = true;
          setReady(true);
          setError("");
        }}
        sx={{
          display: "block",
          width: "100%",
          height,
          border: 0,
          colorScheme: dark ? "dark" : "light",
        }}
      />
    </Paper>
  );
}
