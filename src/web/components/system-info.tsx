"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { SystemInfo as Report } from "../../server/system-info";
export default function SystemInfo() {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch("/api/system-info", {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      let data;
      try {
        data = JSON.parse(await response.text());
      } catch {
        throw new Error(
          `System information returned an empty or invalid response (HTTP ${response.status}). Check application startup.`,
        );
      }
      if (!response.ok)
        throw new Error(data?.message || "System information is unavailable.");
      if (
        !data?.application ||
        !data?.database ||
        !Array.isArray(data.database.migrations)
      )
        throw new Error("System information returned an unexpected response.");
      setReport(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "System information could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Stack spacing={3} sx={{ maxWidth: 1000, minWidth: 0, mx: "auto", py: 3 }}>
      <Typography variant="h3" component="h1">
        System Info
      </Typography>
      <Typography>
        Read-only application and database migration checks. This page does not
        run or repair migrations.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh system information
        </Button>
        <Button component="a" href="/staff">
          Staff sign-in
        </Button>
      </Stack>
      {busy && (
        <Typography role="status">Checking system information…</Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {report && (
        <>
          <Alert
            severity={
              report.database.state === "current" ? "success" : "warning"
            }
            role="status"
          >
            {report.database.state === "current"
              ? "All shipped migrations are applied and the critical tables are present."
              : report.database.state === "unavailable"
                ? "Database checks could not complete. Review database availability and runtime logs."
                : "Database migration or critical-table checks need attention."}
          </Alert>
          <Typography variant="body2">
            Checked {new Date(report.checkedAt).toLocaleString()}. This checks
            migration records and critical table presence; it does not prove
            every column, index or constraint matches.
          </Typography>
          <Paper
            component="section"
            aria-labelledby="system-application"
            sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
          >
            <Stack spacing={1}>
              <Typography variant="h5" component="h2" id="system-application">
                Application
              </Typography>
              <Typography>Version: {report.application.version}</Typography>
              <Typography sx={{ overflowWrap: "anywhere" }}>
                Revision: {report.application.revision}
                {report.application.localChanges
                  ? " (includes local changes)"
                  : ""}
              </Typography>
              <Typography>
                Manifest generated:{" "}
                {new Date(report.application.buildTime).toLocaleString()}
              </Typography>
              <Typography>Node.js: {report.application.nodeVersion}</Typography>
              <Typography>
                Runtime profile: {report.application.profile}
              </Typography>
              <Typography>
                Startup migrations:{" "}
                {report.application.startupMigrationsEnabled
                  ? "enabled"
                  : "disabled"}
              </Typography>
            </Stack>
          </Paper>
          <Paper
            component="section"
            aria-labelledby="system-database"
            sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
          >
            <Stack spacing={2}>
              <Typography variant="h5" component="h2" id="system-database">
                Database migrations
              </Typography>
              {report.database.error && (
                <Alert severity="error">
                  {report.database.error.message} ({report.database.error.code})
                </Alert>
              )}
              <Typography>
                Database query:{" "}
                {report.database.connected ? "connected" : "unavailable"}.
                Migration history:{" "}
                {report.database.historyPresent === null
                  ? "not checked"
                  : report.database.historyPresent
                    ? "present"
                    : "missing"}
                .
              </Typography>
              <Typography>
                {
                  report.database.migrations.filter(
                    (row) => row.state === "applied",
                  ).length
                }{" "}
                applied ·{" "}
                {
                  report.database.migrations.filter(
                    (row) => row.state === "pending",
                  ).length
                }{" "}
                pending ·{" "}
                {
                  report.database.migrations.filter(
                    (row) => !["applied", "pending"].includes(row.state),
                  ).length
                }{" "}
                failed or inconsistent · {report.database.unknownMigrations}{" "}
                unrecognized.
              </Typography>
              <TableContainer
                tabIndex={0}
                role="region"
                aria-label="Migration results"
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Migration</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Applied</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.database.migrations.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            overflowWrap: "anywhere",
                            maxWidth: { xs: 170, sm: "none" },
                          }}
                        >
                          {row.name}
                        </TableCell>
                        <TableCell>{row.state}</TableCell>
                        <TableCell>
                          {row.appliedAt
                            ? new Date(row.appliedAt).toLocaleString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="h6" component="h3">
                Critical tables
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ flexWrap: "wrap" }}
              >
                {report.database.criticalTables.map((table) => (
                  <Chip
                    key={table.name}
                    label={`${table.name}: ${table.present ? "present" : "missing"}`}
                    color={table.present ? "default" : "error"}
                    sx={{ maxWidth: "100%" }}
                  />
                ))}
              </Stack>
              <Typography variant="body2">
                Pending migrations normally apply inside Azure before startup
                when enabled. Failed migrations, checksum mismatches, missing
                tables or unrecognized history require administrator review. Do
                not reset the database.
              </Typography>
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}
