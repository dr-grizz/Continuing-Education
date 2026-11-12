"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { api } from "./api";
import { RecordLifecycle } from "./record-lifecycle";
export type ManagedRow = {
  id: string;
  name: string;
  detail: string;
  version: number;
  archived: boolean;
  protectedReason?: string;
};
export function useManagedIndex(target: string, enabled = true) {
  const [records, setRecords] = useState<ManagedRow[]>([]),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setRecords(
        await api<ManagedRow[]>(`staff/records/${target}`, { role: "staff" }),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [target, enabled]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { records, error, refresh };
}
const effects: Record<string, string> = {
  staff:
    "Archiving deactivates sign-in, ends staff sessions and disconnects the Canvas grant. Restore returns an inactive account; reactivation and any Canvas authorization are separate steps. Your own account and the last active administrator are protected.",
  "progress-plan":
    "Archiving removes these requirements from new assignments and cohort choices. Existing learner progress and evidence remain available in reports.",
  cohort:
    "Archiving removes this cohort from new membership changes. Individual progress, membership history and evidence are kept.",
  "canvas-course":
    "This archives only the saved portal inventory entry. It does not archive or delete the course in Canvas, change its linked offering or affect enrollments.",
  "badge-draft":
    "Archiving removes this saved design from active editor and approval choices. Approved versions and issued awards are kept.",
  "badge-version":
    "Archiving disables this badge version and its earning rules. Issued awards and their verification remain available. Restoring returns an approved version; rules must be activated separately.",
  "badge-mapping":
    "Archiving disables this earning rule. Existing awards are kept. Restoring leaves the rule inactive until it is explicitly activated.",
  "badge-award":
    "Archiving hides this issued badge from active staff management. It does not revoke it or change learner access, sharing or verification.",
  "certificate-template":
    "Archiving removes this template from new certificate choices. Existing signed certificate snapshots and downloads are kept.",
  certificate:
    "Archiving hides this issued certificate from active staff management. Its signed content, learner access, verification and downloads are kept.",
};
export function ManagedActions({
  target,
  row,
  onChanged,
}: {
  target: string;
  row: ManagedRow;
  onChanged: () => Promise<void>;
}) {
  if (row.protectedReason)
    return (
      <Stack>
        <Button disabled>Archive</Button>
        <Typography variant="caption">{row.protectedReason}</Typography>
      </Stack>
    );
  return (
    <RecordLifecycle
      compact
      id={row.id}
      version={row.version}
      name={row.name}
      target={target}
      archived={row.archived}
      endpoint={`staff/records/${target}/${row.id}`}
      messages={{
        archive: effects[target],
        restore:
          target === "staff"
            ? effects.staff
            : target === "badge-version" || target === "badge-mapping"
              ? effects[target]
              : "Restore this record to the active management list. Existing history and credentials are preserved.",
        delete:
          target === "canvas-course"
            ? "Permanently remove this saved portal inventory entry from staff lists, including future source refreshes. This does not delete or change anything in Canvas. Linked offerings and registrations are kept."
            : "Permanently delete this archived record. This cannot be undone. Records with linked activity, membership, issuance or credential history must remain archived.",
      }}
      deleteProtectedReason={
        target === "badge-award" || target === "certificate"
          ? "Issued credentials are permanent records and cannot be deleted. Use the separate revocation workflow when a credential must no longer be valid."
          : undefined
      }
      onChanged={async () => {
        await onChanged();
      }}
    />
  );
}
export function RecordRegister({
  target,
  title,
  onChanged,
}: {
  target: string;
  title: string;
  onChanged?: () => Promise<void> | void;
}) {
  const { records, error, refresh } = useManagedIndex(target),
    [archived, setArchived] = useState(false),
    [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = records.filter((r) => r.archived === archived);
  return (
    <Stack spacing={1.5} sx={{ my: 2 }}>
      <Typography component="h2" variant="h6" ref={heading} tabIndex={-1}>
        {title}
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
        }
        label={`Show archived ${title.toLowerCase()} (${records.filter((r) => r.archived).length})`}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table aria-label={title} size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Details</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell
                  component="th"
                  scope="row"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {row.name}
                </TableCell>
                <TableCell sx={{ overflowWrap: "anywhere" }}>
                  {row.detail}
                </TableCell>
                <TableCell>{row.archived ? "Archived" : "Active"}</TableCell>
                <TableCell>
                  <ManagedActions
                    target={target}
                    row={row}
                    onChanged={async () => {
                      await refresh();
                      await onChanged?.();
                      setNotice("Record updated.");
                      setTimeout(() => heading.current?.focus(), 0);
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={4}>
                  No {archived ? "archived" : "active"} records.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
