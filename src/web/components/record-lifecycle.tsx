"use client";
import { useId, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { api } from "./api";
export function RecordLifecycle({
  id,
  version,
  name,
  target,
  archived,
  onChanged,
  compact = false,
  endpoint,
  messages,
  deleteProtectedReason,
}: {
  endpoint?: string;
  messages?: Partial<Record<"archive" | "restore" | "delete", string>>;
  deleteProtectedReason?: string;
  compact?: boolean;
  id: string;
  version: number;
  name: string;
  target: string;
  archived: boolean;
  onChanged: (message: string, deleted: boolean) => Promise<void>;
}) {
  const dialogId = useId();
  const reasonRef = useRef<HTMLInputElement>(null);
  const [action, setAction] = useState<"archive" | "restore" | "delete">();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!action || busy) return;
    if (reason.trim().length < 10) {
      setError("Explain why in at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        endpoint ||
          `${target === "learner" ? "staff/learners" : "offerings"}/${id}/lifecycle`,
        { role: "staff", body: { action, version, reason: reason.trim() } },
      );
      await onChanged(
        `${name} ${action === "archive" ? "archived" : action === "restore" ? "restored" : "deleted"}.`,
        action === "delete",
      );
      setAction(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = (next: typeof action) => {
    setReason("");
    setError("");
    setAction(next);
  };
  return (
    <>
      <Stack
        direction="row"
        sx={{ gap: 1, flexWrap: "wrap", my: compact ? 0 : 2 }}
      >
        <Button
          variant={compact ? "text" : "outlined"}
          aria-label={
            compact ? `${archived ? "Restore" : "Archive"} ${name}` : undefined
          }
          onClick={() => open(archived ? "restore" : "archive")}
        >
          {archived ? "Restore" : "Archive"}
          {!compact && ` ${target}`}
        </Button>
        {archived && (
          <Button
            color="error"
            aria-label={compact ? `Delete ${name}` : undefined}
            onClick={() => open("delete")}
          >
            Delete{!compact && ` ${target}`}
          </Button>
        )}
      </Stack>
      <Dialog
        open={Boolean(action)}
        onClose={() => !busy && setAction(undefined)}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        fullWidth
        slotProps={{
          transition: { onEntered: () => reasonRef.current?.focus() },
        }}
        maxWidth="sm"
      >
        <DialogTitle id={`${dialogId}-title`}>
          {action === "archive"
            ? "Archive"
            : action === "restore"
              ? "Restore"
              : "Delete"}{" "}
          {name}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id={`${dialogId}-description`}>
            {(action && messages?.[action]) ||
              (action === "delete"
                ? "This permanently deletes this record and its saved preferences. This cannot be undone. Deletion is blocked when protected registration, progress or credential history exists; keep those records archived. Previously published or Canvas-linked offerings are also protected."
                : action === "archive"
                  ? target === "learner"
                    ? "Archiving hides this learner from the active list and blocks portal sign-in. Existing enrollments, progress and credentials are kept. You can restore the account later."
                    : "Archiving unpublishes this offering and hides it from the active staff list. Existing registrations, progress, credentials and collection membership are kept. You can restore it later."
                  : target === "learner"
                    ? "This returns the learner to the active list. Account access stays deactivated until you explicitly reactivate it."
                    : "This returns the offering to the active list without publishing it. Publish it separately when ready.")}
          </DialogContentText>
          <TextField
            inputRef={reasonRef}
            autoFocus
            label="Reason"
            required
            multiline
            minRows={2}
            fullWidth
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            helperText="10 to 500 characters. Recorded in the audit log."
            sx={{ mt: 2 }}
          />
          {action === "delete" && deleteProtectedReason && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {deleteProtectedReason}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setAction(undefined)}>
            Cancel
          </Button>
          <Button
            disabled={
              busy || (action === "delete" && Boolean(deleteProtectedReason))
            }
            color={action === "delete" ? "error" : "primary"}
            onClick={save}
          >
            {busy
              ? "Saving…"
              : action === "delete"
                ? "Delete permanently"
                : action === "archive"
                  ? "Archive"
                  : "Restore"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
