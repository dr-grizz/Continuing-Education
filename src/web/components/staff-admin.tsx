"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  Link,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api } from "./api";
import { RoleChips, roleLabels, StaffMember, StaffRole } from "./staff-session";

type Member = Omit<StaffMember, "scopes"> & {
  auth_provider: string;
  external_subject?: string | null;
  canvas_origin?: string | null;
};
type RoleEntry = {
  role: StaffRole;
  label: string;
  description: string;
  scopes: { scope: string; description: string }[];
  members: {
    id: string;
    display_name: string;
    email: string;
    active: boolean;
  }[];
};
const allRoles = Object.keys(roleLabels) as StaffRole[];
// The users table needs room for emails and role chips, so cards are used below md.
const wideOnly = { display: { xs: "none", md: "block" } };
const phoneOnly = { display: { xs: "block", md: "none" } };

// Staff administrators add people, assign roles and deactivate access.
export function StaffUsers({
  canManage,
  currentId,
  roleFilter,
  onRoleFilter,
  onChanged,
}: {
  canManage: boolean;
  currentId: string;
  roleFilter: StaffRole | "all";
  onRoleFilter: (role: StaffRole | "all") => void;
  onChanged: (message: string, selfChanged: boolean) => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Member | "new">();
  const [linking, setLinking] = useState<Member>();
  const load = () =>
    api<Member[]>("staff/members", { role: "staff" })
      .then((rows) => {
        setMembers(rows);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    if (canManage) load();
  }, [canManage]);
  if (!canManage)
    return (
      <Alert severity="info" role="note">
        Managing staff requires the Staff administrator role.
      </Alert>
    );
  const shown = members.filter(
    (member) => roleFilter === "all" || member.roles.includes(roleFilter),
  );
  const editButton = (member: Member) => (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
      <Button
        onClick={() => setEditing(member)}
        aria-label={`Edit ${member.display_name}`}
      >
        Edit
      </Button>
      <Button
        onClick={() => setLinking(member)}
        disabled={
          !member.external_subject && (!member.active || !member.canvas_origin)
        }
        aria-label={`${member.external_subject ? "View Canvas link for" : "Link Canvas for"} ${member.display_name}`}
      >
        {member.external_subject ? "View Canvas link" : "Link Canvas"}
      </Button>
    </Stack>
  );
  const canvasStatus = (member: Member) => (
    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
      {member.external_subject
        ? `Linked · Canvas user ${member.external_subject}`
        : "Not linked to Canvas"}
    </Typography>
  );
  const status = (member: Member) => (
    <Chip
      label={member.active ? "Active" : "Inactive"}
      color={member.active ? "success" : "default"}
      variant="outlined"
    />
  );
  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ justifyContent: "space-between", gap: 2, mb: 2 }}
      >
        <Typography variant="h6" component="h2">
          Staff members
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setEditing("new")}
        >
          Add staff member
        </Button>
      </Stack>
      <TextField
        select
        label="Role"
        value={roleFilter}
        onChange={(e) => onRoleFilter(e.target.value as StaffRole | "all")}
        sx={{ mb: 1.5, minWidth: 260 }}
      >
        <MenuItem value="all">All roles</MenuItem>
        {allRoles.map((role) => (
          <MenuItem key={role} value={role}>
            {roleLabels[role]}
          </MenuItem>
        ))}
      </TextField>
      <Alert severity="info" role="note" sx={{ mb: 2 }}>
        Adding an email does not enable Canvas sign-in. Link each active staff
        member to their verified Canvas user ID. Roles are managed separately.
      </Alert>
      {members.length > 0 &&
        !members.some((member) => member.canvas_origin) && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Canvas linking is unavailable until the portal's Canvas installation
            is configured.
          </Alert>
        )}
      <Typography
        variant="body2"
        color="text.secondary"
        aria-live="polite"
        sx={{ mb: 1.5 }}
      >
        {shown.length} of {members.length} staff members
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={1.5} sx={phoneOnly}>
        {shown.map((member) => (
          <Paper key={member.id} variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", gap: 1 }}
            >
              <Typography variant="subtitle1" component="h3">
                {member.display_name}
                {member.id === currentId ? " (you)" : ""}
              </Typography>
              {status(member)}
            </Stack>
            <Typography
              variant="body2"
              sx={{ overflowWrap: "anywhere", mb: 1 }}
            >
              {member.email}
            </Typography>
            <RoleChips roles={member.roles} />
            {canvasStatus(member)}
            <Box sx={{ mt: 1 }}>{editButton(member)}</Box>
          </Paper>
        ))}
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={wideOnly}>
        <Table aria-label="Staff members">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Roles</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Canvas sign-in</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((member) => (
              <TableRow key={member.id} hover>
                <TableCell>
                  {member.display_name}
                  {member.id === currentId ? " (you)" : ""}
                </TableCell>
                <TableCell sx={{ overflowWrap: "anywhere" }}>
                  {member.email}
                </TableCell>
                <TableCell>
                  <RoleChips roles={member.roles} />
                </TableCell>
                <TableCell>{status(member)}</TableCell>
                <TableCell>{canvasStatus(member)}</TableCell>
                <TableCell>{editButton(member)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <StaffMemberDialog
        member={editing}
        currentId={currentId}
        onClose={() => setEditing(undefined)}
        onSaved={async (text, selfChanged) => {
          setEditing(undefined);
          await load();
          await onChanged(text, selfChanged);
        }}
      />
      <CanvasLinkDialog
        member={linking}
        onClose={() => setLinking(undefined)}
        onSaved={async () => {
          const member = linking!;
          setLinking(undefined);
          await load();
          await onChanged(
            `Canvas sign-in enabled for ${member.display_name}.`,
            member.id === currentId,
          );
        }}
      />
    </>
  );
}

function CanvasLinkDialog({
  member,
  onClose,
  onSaved,
}: {
  member?: Member;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const errorRef = useRef<HTMLDivElement | null>(null);
  const linked = Boolean(member?.external_subject);
  useEffect(() => {
    setUserId(member?.external_subject || "");
    setConfirmed(false);
    setFailure("");
  }, [member]);
  useEffect(() => {
    if (failure) errorRef.current?.focus();
  }, [failure]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!member || linked || busy) return;
    if (!/^[1-9][0-9]{0,19}$/.test(userId.trim()) || !confirmed) {
      setFailure(
        "Enter the numeric Canvas user ID and confirm that you verified its owner.",
      );
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      await api(`staff/members/${member.id}/canvas-link`, {
        role: "staff",
        body: {
          version: member.version,
          canvasUserId: userId.trim(),
          identityVerified: true,
        },
      });
      await onSaved();
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={Boolean(member)}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
      aria-labelledby="canvas-link-title"
      aria-describedby="canvas-link-description"
    >
      <Box component="form" noValidate onSubmit={save}>
        <DialogTitle id="canvas-link-title">
          {linked ? "Canvas identity link" : "Link Canvas sign-in"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography id="canvas-link-description">
              {member?.display_name} · {member?.email}
            </Typography>
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              Canvas installation:{" "}
              {linked
                ? member?.auth_provider.replace(/^canvas:/, "")
                : member?.canvas_origin}
            </Typography>
            {linked ? (
              <Alert severity="info" role="note">
                This identity is linked. Changing an existing identity requires
                administrator recovery; it cannot be replaced here.
              </Alert>
            ) : (
              <Alert severity="info" role="note">
                In Canvas administration, open this person's profile and verify
                the numeric user ID. Email alone does not verify identity.
                Linking enables staff sign-in, keeps their roles, and signs out
                any older portal sessions for this person.
              </Alert>
            )}
            {failure && (
              <Alert severity="error" tabIndex={-1} ref={errorRef}>
                {failure}
              </Alert>
            )}
            <TextField
              label="Canvas user ID"
              required={!linked}
              disabled={busy}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              autoFocus={!linked}
              slotProps={{
                input: { readOnly: linked },
                htmlInput: { inputMode: "numeric", maxLength: 20 },
              }}
              helperText="Use the numeric Canvas user ID, not an email address or SIS ID."
            />
            {!linked && (
              <FormControlLabel
                control={
                  <Checkbox
                    required
                    disabled={busy}
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                }
                label={`I verified this Canvas user ID belongs to ${member?.display_name} (${member?.email}).`}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {linked ? "Close" : "Cancel"}
          </Button>
          {!linked && (
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? "Linking…" : "Link Canvas account"}
            </Button>
          )}
        </DialogActions>
      </Box>
    </Dialog>
  );
}

type Field = "displayName" | "email" | "roles";
const fieldLabels: Record<Field, string> = {
  displayName: "Name",
  email: "Email",
  roles: "Roles",
};

function StaffMemberDialog({
  member,
  currentId,
  onClose,
  onSaved,
}: {
  member?: Member | "new";
  currentId: string;
  onClose: () => void;
  onSaved: (message: string, selfChanged: boolean) => Promise<void>;
}) {
  const creating = member === "new";
  const existing = member && member !== "new" ? member : undefined;
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const summary = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!member) return;
    setDisplayName(existing?.display_name ?? "");
    setEmail(existing?.email ?? "");
    setRoles(existing?.roles ?? []);
    setActive(existing?.active ?? true);
    setErrors({});
    setFailure("");
  }, [member]);
  // Move focus to the summary once a server failure has rendered it.
  useEffect(() => {
    if (failure) summary.current?.focus();
  }, [failure]);
  async function save() {
    if (busy) return;
    const found: Partial<Record<Field, string>> = {};
    if (displayName.trim().length < 2 || displayName.trim().length > 120)
      found.displayName = "Enter 2 to 120 characters.";
    if (creating && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      found.email = "Enter a valid email address.";
    if (!roles.length) found.roles = "Choose at least one role.";
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length) {
      setTimeout(() => summary.current?.focus());
      return;
    }
    setBusy(true);
    try {
      if (existing)
        await api(`staff/members/${existing.id}`, {
          role: "staff",
          body: {
            version: existing.version,
            displayName: displayName.trim(),
            roles,
            active,
          },
        });
      else
        await api("staff/members", {
          role: "staff",
          body: {
            email: email.trim().toLowerCase(),
            displayName: displayName.trim(),
            roles,
          },
        });
      await onSaved(
        existing
          ? `Saved ${displayName.trim()}.`
          : `Added ${displayName.trim()}.`,
        existing?.id === currentId,
      );
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const errorList = Object.entries(errors).filter(([, text]) => text) as [
    Field,
    string,
  ][];
  return (
    <Dialog
      open={Boolean(member)}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        {creating ? "Add staff member" : "Edit staff member"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {existing?.id === currentId && (
            <Alert severity="warning" role="note">
              You are editing yourself. Removing a role or deactivating your
              account takes effect immediately.
            </Alert>
          )}
          {(errorList.length > 0 || failure) && (
            <Alert
              severity="error"
              ref={summary}
              tabIndex={-1}
              aria-labelledby="staff-error-heading"
            >
              <Typography
                id="staff-error-heading"
                variant="subtitle2"
                component="h3"
              >
                {failure
                  ? "The staff member was not saved"
                  : "Fix these fields"}
              </Typography>
              {failure || (
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {errorList.map(([name, text]) => (
                    <li key={name}>
                      <Link
                        href={`#staff-${name}`}
                        color="inherit"
                        onClick={(event) => {
                          event.preventDefault();
                          document.getElementById(`staff-${name}`)?.focus();
                        }}
                      >
                        {fieldLabels[name]}: {text}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <TextField
            id="staff-displayName"
            label="Name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={Boolean(errors.displayName)}
            helperText={errors.displayName}
          />
          <TextField
            id="staff-email"
            label="Email"
            type="email"
            required={creating}
            disabled={!creating}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={Boolean(errors.email)}
            helperText={
              errors.email ??
              (creating
                ? "After adding this person, use Link Canvas to enable Canvas sign-in."
                : "Email cannot change; add a new staff member instead.")
            }
          />
          <fieldset
            style={{ border: 0, margin: 0, padding: 0 }}
            aria-describedby="staff-roles-help"
          >
            <legend>
              <Typography variant="subtitle2" component="span">
                Roles (at least one)
              </Typography>
            </legend>
            <FormGroup>
              {allRoles.map((role, index) => (
                <FormControlLabel
                  key={role}
                  control={
                    <Checkbox
                      id={index === 0 ? "staff-roles" : undefined}
                      checked={roles.includes(role)}
                      onChange={(e) => {
                        setRoles(
                          e.target.checked
                            ? [...roles, role]
                            : roles.filter((r) => r !== role),
                        );
                        if (errors.roles)
                          setErrors({ ...errors, roles: undefined });
                      }}
                    />
                  }
                  label={roleLabels[role]}
                />
              ))}
            </FormGroup>
            <FormHelperText id="staff-roles-help" error={Boolean(errors.roles)}>
              {errors.roles ??
                "Permissions for each role are listed on the Roles tab."}
            </FormHelperText>
          </fieldset>
          {existing && (
            <FormControlLabel
              control={
                <Switch
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
              }
              label="Active (inactive staff cannot sign in or act)"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} aria-disabled={busy}>
          {busy ? "Saving…" : creating ? "Add staff member" : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Role catalog: what each role allows and who holds it. Permissions are defined in code.
export function StaffRoles({
  canManage,
  onAssign,
}: {
  canManage: boolean;
  onAssign: (role: StaffRole) => void;
}) {
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<RoleEntry[]>("staff/roles", { role: "staff" })
      .then(setRoles)
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Roles and permissions
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Every staff member can view the workspace and reports. Each role adds
        the permissions listed below; a person with several roles has all of
        them. Role permissions are fixed in this prototype.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        {roles.map((entry) => (
          <Paper
            key={entry.role}
            variant="outlined"
            component="section"
            aria-labelledby={`role-${entry.role}`}
            sx={{ p: 2.5 }}
          >
            <Typography
              id={`role-${entry.role}`}
              variant="subtitle1"
              component="h3"
            >
              {entry.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {entry.description}
            </Typography>
            <Typography variant="subtitle2" component="h4" sx={{ mt: 2 }}>
              Permissions
            </Typography>
            <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
              {entry.scopes.map((scope) => (
                <Typography component="li" variant="body2" key={scope.scope}>
                  {scope.description}
                </Typography>
              ))}
            </ul>
            <Typography variant="subtitle2" component="h4" sx={{ mt: 2 }}>
              People ({entry.members.length})
            </Typography>
            {entry.members.length ? (
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {entry.members.map((member) => (
                  <Typography component="li" variant="body2" key={member.id}>
                    {member.display_name}
                    {member.active ? "" : " (inactive)"}
                  </Typography>
                ))}
              </ul>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No one has this role.
              </Typography>
            )}
            {canManage && (
              <Button
                sx={{ mt: 1.5 }}
                onClick={() => onAssign(entry.role)}
                aria-label={`Manage people with the ${entry.label} role`}
              >
                Manage people
              </Button>
            )}
          </Paper>
        ))}
      </Box>
    </>
  );
}
