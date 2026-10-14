"use client";
import type { StaffRole } from "../../generated/prisma/enums";
export type { StaffRole } from "../../generated/prisma/enums";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Alert,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";

export const roleLabels: Record<StaffRole, string> = {
  approver: "Approver",
  catalog_manager: "Course manager",
  support: "Support",
  it_canvas_admin: "IT/Canvas administrator",
  staff_admin: "Staff administrator",
  content_editor: "Content editor",
};
export type StaffMember = {
  id: string;
  email: string;
  display_name: string;
  roles: StaffRole[];
  active: boolean;
  version: number;
  scopes: string[];
};
type DirectoryEntry = Pick<
  StaffMember,
  "id" | "email" | "display_name" | "roles"
>;

// `can` checks scopes from the API; the API enforces
// them again on every request, so hiding a control is convenience, not security.
function useStaffSessionState() {
  const [member, setMember] = useState<StaffMember | null>(null);
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<{
    mode: "mock" | "canvas";
    configured: boolean;
  } | null>(null);
  const [sessionError, setSessionError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/staff-session", { cache: "no-store" });
      const data = await response.json();
      setMember(response.ok ? data.member : null);
      setAuth(response.ok ? data.auth : null);
      setSessionError(
        response.ok ? "" : "Staff sign-in is unavailable. Try again.",
      );
    } catch {
      setMember(null);
      setAuth(null);
      setSessionError("Staff sign-in is unavailable. Try again.");
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return {
    member,
    ready,
    auth,
    sessionError,
    refresh,
    can: (scope: string) => Boolean(member?.scopes.includes(scope)),
    async signIn(email: string) {
      const response = await fetch("/api/staff-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Sign-in failed.");
      await refresh();
    },
    async signOut() {
      const response = await fetch("/api/staff-session", { method: "DELETE" });
      if (!response.ok) {
        setSessionError("Unable to sign out. Try again.");
        return;
      }
      setSessionError("");
      setMember(null);
    },
  };
}

const StaffSessionContext = createContext<ReturnType<
  typeof useStaffSessionState
> | null>(null);

export function StaffSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useStaffSessionState();
  return (
    <StaffSessionContext.Provider value={session}>
      {children}
    </StaffSessionContext.Provider>
  );
}

export function useStaffSession() {
  const session = useContext(StaffSessionContext);
  if (!session) throw new Error("StaffSessionProvider is required.");
  return session;
}

export function RoleChips({ roles }: { roles: StaffRole[] }) {
  return (
    <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
      {roles.map((role) => (
        <Chip key={role} label={roleLabels[role] ?? role} variant="outlined" />
      ))}
    </Stack>
  );
}

// The API chooses the mode; unavailable Canvas configuration never enables mock selection.
export function StaffSignIn({
  onSignIn,
  auth,
  sessionError,
}: {
  onSignIn: (email: string) => Promise<void>;
  auth: { mode: "mock" | "canvas"; configured: boolean } | null;
  sessionError: string;
}) {
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (auth?.mode !== "mock") return;
    fetch("/api/staff-session?directory=1", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setDirectory(data);
      })
      .catch((e) => setError((e as Error).message || "Unable to load staff."));
  }, [auth?.mode]);
  if (auth?.mode !== "mock") {
    const messages: Record<string, string> = {
      configuration:
        "Canvas sign-in is not configured yet. Contact the portal administrator.",
      unavailable: "Unable to complete Canvas sign-in. Try again.",
      unauthorized:
        "Your Canvas account has not been authorized for this staff portal. Contact the portal administrator.",
      denied: "Canvas sign-in was cancelled or denied. You can try again.",
      invalid: "Sign-in expired or could not be verified. Try again.",
    };
    const failure =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("authError");
    const message =
      sessionError ||
      (failure ? messages[failure] || messages.invalid : "") ||
      (!auth?.configured ? messages.configuration : "");
    return (
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2.5, sm: 4 }, maxWidth: 640, mx: "auto" }}
      >
        <Typography variant="h4" component="h1">
          Staff sign-in
        </Typography>
        <Typography sx={{ my: 2 }}>
          Sign in through Canvas using your university account. The portal
          administrator controls staff access and roles.
        </Typography>
        {message && (
          <Alert
            severity={sessionError || failure ? "error" : "info"}
            sx={{ mb: 2 }}
          >
            {message}
          </Alert>
        )}
        {auth?.configured && (
          <Button href="/api/auth/canvas/start" variant="contained">
            Sign in with Canvas
          </Button>
        )}
      </Paper>
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!email) {
      setError("Choose a staff member to continue.");
      document
        .querySelector<HTMLInputElement>('input[name="staff-member"]')
        ?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSignIn(email);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2.5, sm: 4 }, maxWidth: 640, mx: "auto" }}
    >
      <Typography variant="h4" component="h1">
        Staff sign-in
      </Typography>
      <Alert severity="info" role="note" sx={{ my: 2 }}>
        Prototype only: choose a demo staff member to act with their roles. No
        password is used. University SSO will replace this screen later.
      </Alert>
      <form onSubmit={submit} noValidate>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend>
            <Typography variant="subtitle1" component="span">
              Demo staff member
            </Typography>
          </legend>
          <RadioGroup
            name="staff-member"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
          >
            {directory.map((entry) => (
              <FormControlLabel
                key={entry.id}
                value={entry.email}
                control={<Radio />}
                sx={{ alignItems: "flex-start", my: 0.75 }}
                label={
                  <Stack sx={{ gap: 0.5, pt: 0.75 }}>
                    <Typography>
                      {entry.display_name}{" "}
                      <Typography component="span" color="text.secondary">
                        ({entry.email})
                      </Typography>
                    </Typography>
                    <RoleChips roles={entry.roles} />
                  </Stack>
                }
              />
            ))}
          </RadioGroup>
        </fieldset>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          sx={{ mt: 2 }}
          aria-disabled={busy}
        >
          {busy ? "Signing in…" : "Sign in as staff"}
        </Button>
      </form>
    </Paper>
  );
}
