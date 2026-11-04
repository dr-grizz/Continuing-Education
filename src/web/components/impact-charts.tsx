"use client";
import { useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";

export const progressSeries = [
  { key: "completed", name: "Completed", color: "#38845c" },
  { key: "inProgress", name: "In progress", color: "#2a78d6" },
  {
    key: "awaitingVerification",
    name: "Awaiting verification",
    color: "#ad7930",
  },
  { key: "notStarted", name: "Verified not started", color: "#858585" },
] as const;
type Bar = {
  id: string;
  label: string;
  value: number | null;
  detail?: string;
  color?: string;
};

/** Inline chart marks use the exact reviewed rows also shown in tables/CSV. */
export function ImpactBars({
  title,
  rows,
  unit,
  maximum,
  format = (value) => value.toLocaleString("en-US"),
  empty = "No data in this selection.",
}: {
  title: string;
  rows: Bar[];
  unit: string;
  maximum?: number;
  format?: (value: number) => string;
  empty?: string;
}) {
  const [expanded, setExpanded] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const max = maximum ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  const shown = expanded ? rows : rows.slice(0, 6);
  const active = rows.find((r) => r.id === selected);
  if (!rows.length)
    return <Typography color="text.secondary">{empty}</Typography>;
  return (
    <Box role="group" aria-label={title}>
      <Stack spacing={1.5}>
        {shown.map((row) => (
          <Box
            component="button"
            type="button"
            key={row.id}
            aria-label={`${row.label}: ${row.value === null ? "unavailable" : format(row.value)} ${unit}${row.detail ? "; " + row.detail : ""}`}
            aria-pressed={selected === row.id}
            onClick={() => setSelected(selected === row.id ? null : row.id)}
            sx={{
              width: "100%",
              p: 1,
              m: 0,
              border: 1,
              borderColor: selected === row.id ? "text.primary" : "transparent",
              borderRadius: 1,
              bgcolor: "transparent",
              color: "text.primary",
              textAlign: "left",
              font: "inherit",
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "text.primary",
                outlineOffset: 2,
              },
            }}
          >
            <Stack
              direction="row"
              sx={{
                gap: 2,
                justifyContent: "space-between",
                alignItems: "baseline",
                mb: 0.75,
              }}
            >
              <Typography
                component="span"
                variant="body2"
                sx={{ overflowWrap: "anywhere" }}
              >
                {row.label}
              </Typography>
              <Typography
                component="span"
                variant="body2"
                sx={{ fontWeight: 650, whiteSpace: "nowrap" }}
              >
                {row.value === null ? "—" : format(row.value)}
              </Typography>
            </Stack>
            <Box
              aria-hidden
              sx={{
                height: 14,
                bgcolor: "action.hover",
                borderRadius: 0.5,
                overflow: "hidden",
              }}
            >
              <Box
                data-impact-bar={row.id}
                sx={{
                  height: "100%",
                  width: `${row.value === null ? 0 : Math.max(0, Math.min(100, (100 * row.value) / max))}%`,
                  bgcolor: row.color ?? "#2a78d6",
                  borderRadius: 0.5,
                }}
              />
            </Box>
            {row.detail && (
              <Typography
                variant="caption"
                color="text.secondary"
                component="span"
                sx={{ display: "block", mt: 0.5 }}
              >
                {row.detail}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", px: 1, mt: 0.5 }}
      >
        <Typography variant="caption" color="text.secondary">
          0
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {format(max)} {unit}
        </Typography>
      </Stack>
      {rows.length > 6 && (
        <Button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      )}
      <Typography
        role="status"
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1, minHeight: 20 }}
      >
        {active
          ? `${active.label}: ${active.value === null ? "unavailable" : format(active.value) + " " + unit}${active.detail ? " · " + active.detail : ""}`
          : "Select a bar to inspect its value."}
      </Typography>
    </Box>
  );
}

export function CompletionDonut({
  counts,
}: {
  counts: Record<(typeof progressSeries)[number]["key"], number>;
}) {
  const [selected, setSelected] = useState<
    (typeof progressSeries)[number]["key"] | null
  >(null);
  const total = progressSeries.reduce((n, s) => n + counts[s.key], 0),
    circumference = 2 * Math.PI * 58;
  let offset = 0;
  const parts = progressSeries.map((s) => {
    const length = total ? (counts[s.key] / total) * circumference : 0;
    const start = offset;
    offset += length;
    return { ...s, length, start };
  });
  const active = progressSeries.find((s) => s.key === selected);
  return (
    <>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "center",
          gridTemplateColumns: { xs: "1fr", sm: "160px minmax(0,1fr)" },
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 160 160"
          role="img"
          aria-label={
            total
              ? `Completion breakdown: ${progressSeries.map((s) => `${counts[s.key]} ${s.name.toLowerCase()}`).join(", ")}; ${total} assignments`
              : "Completion breakdown unavailable: no progress assignments"
          }
          sx={{
            width: 160,
            height: 160,
            justifySelf: "center",
            overflow: "visible",
          }}
        >
          <Box
            component="circle"
            cx="80"
            cy="80"
            r="58"
            fill="none"
            stroke="currentColor"
            strokeWidth="18"
            sx={{ color: "action.disabledBackground" }}
          />
          {parts
            .filter((s) => s.length > 0)
            .map((s) => (
              <circle
                key={s.key}
                cx="80"
                cy="80"
                r="58"
                fill="none"
                stroke={s.color}
                strokeWidth={selected === s.key ? 22 : 18}
                strokeDasharray={`${s.length} ${circumference - s.length}`}
                strokeDashoffset={-s.start}
                transform="rotate(-90 80 80)"
                opacity={selected && selected !== s.key ? 0.35 : 1}
              />
            ))}
          <Box
            component="text"
            x="80"
            y="80"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="currentColor"
            sx={{ color: "text.primary", fontSize: 24, fontWeight: 650 }}
          >
            {total ? `${((100 * counts.completed) / total).toFixed(1)}%` : "—"}
          </Box>
          <Box
            component="text"
            x="80"
            y="100"
            textAnchor="middle"
            fill="currentColor"
            sx={{ color: "text.secondary", fontSize: 11 }}
          >
            {total ? "completed" : "no assignments"}
          </Box>
        </Box>
        <Stack spacing={0.5}>
          {progressSeries.map((s) => (
            <Box
              component="button"
              type="button"
              key={s.key}
              aria-label={`Inspect ${s.name.toLowerCase()}: ${counts[s.key]} assignments`}
              aria-pressed={selected === s.key}
              onClick={() => setSelected(selected === s.key ? null : s.key)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
                p: 0.75,
                border: 1,
                borderColor:
                  selected === s.key ? "text.primary" : "transparent",
                borderRadius: 1,
                bgcolor: "transparent",
                color: "text.primary",
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                "&:focus-visible": {
                  outline: "2px solid",
                  outlineColor: "text.primary",
                },
              }}
            >
              <Box
                aria-hidden
                sx={{ width: 10, height: 10, bgcolor: s.color, flexShrink: 0 }}
              />
              <Typography variant="body2" component="span" sx={{ flex: 1 }}>
                {s.name}
              </Typography>
              <Typography
                variant="body2"
                component="span"
                sx={{ fontWeight: 650 }}
              >
                {counts[s.key]}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
      <Typography
        role="status"
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1 }}
      >
        {active
          ? `${active.name}: ${counts[active.key]} of ${total} assignments${total ? ` (${((100 * counts[active.key]) / total).toFixed(1)}%)` : ""}`
          : total
            ? `${total} assignments · select a legend item to highlight it.`
            : "No progress assignments in this selection; a completion rate is unavailable."}
      </Typography>
    </>
  );
}
