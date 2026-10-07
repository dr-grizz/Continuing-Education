"use client";
import { useCallback, useEffect, useState } from "react";
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

export type StaffRole =
  | "approver"
  | "catalog_manager"
  | "support"
  | "finance"
  | "it_canvas_admin"
  | "staff_admin";
export const roleLabels: Record<StaffRole, string> = {
  approver: "Approver",
  catalog_manager: "Catalog manager",
  support: "Support",
  finance: "Finance",
  it_canvas_admin: "IT/Canvas administrator",
  staff_admin: "Staff administrator",
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

// Mock staff session (ADR 0004). `can` checks scopes from the API; the API enforces
// them again on every request, so hiding a control is convenience, not security.
export function useStaffSession() {
  const [member, setMember] = useState<StaffMember | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/staff-session", { cache: "no-store" });
      const data = await response.json();
      setMember(response.ok ? data.member : null);
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
      await fetch("/api/staff-session", { method: "DELETE" });
      setMember(null);
    },
  };
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

// Mock sign-in: pick a demo staff member. Replaced by SSO in a later add-on.
export function StaffSignIn({
  onSignIn,
}: {
  onSignIn: (email: string) => Promise<void>;
}) {
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/staff-session?directory=1", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setDirectory(data);
      })
      .catch((e) => setError((e as Error).message || "Unable to load staff."));
  }, []);
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
