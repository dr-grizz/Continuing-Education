"use client";
import { useEffect, useRef, useState } from "react";
import {
  Box,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CloseIcon from "@mui/icons-material/Close";

export type OrderedOption = { id: string; title: string; note?: string };
const visuallyHidden = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

// Keyboard-operable ordered picker: add from a select, move up or down, remove.
// Focus stays on the moved item's arrow (switching arrows at the ends) or moves
// to a neighbour after removal, and a status region announces each change.
// The add select's id is `${id}-add`, for error-summary links.
export function OrderedListEditor({
  id,
  legend,
  noun,
  ids,
  options,
  onChange,
  max,
  emptyText,
  helperText,
  error,
}: {
  id: string;
  legend: string;
  /** Singular item name for labels and announcements, such as "course". */
  noun: string;
  ids: string[];
  options: OrderedOption[];
  onChange: (ids: string[]) => void;
  max?: number;
  emptyText: string;
  helperText?: string;
  error?: string;
}) {
  const [announcement, setAnnouncement] = useState(""),
    [pendingFocus, setPendingFocus] = useState<string>();
  const controls = useRef<Map<string, HTMLButtonElement>>(new Map());
  const addId = `${id}-add`;
  useEffect(() => {
    if (!pendingFocus) return;
    // The select's id is on its visible combobox, not the hidden input.
    if (pendingFocus === "add") document.getElementById(addId)?.focus();
    else controls.current.get(pendingFocus)?.focus();
    setPendingFocus(undefined);
  }, [ids, pendingFocus, addId]);
  const byId = new Map(options.map((o) => [o.id, o]));
  const titleOf = (item: string) => byId.get(item)?.title ?? `Unknown ${noun}`;
  const available = options.filter((o) => !ids.includes(o.id));
  const full = max !== undefined && ids.length >= max;
  function move(index: number, delta: number) {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    const target = index + delta;
    next.splice(target, 0, item);
    onChange(next);
    setAnnouncement(
      `${titleOf(item)} moved to position ${target + 1} of ${next.length}.`,
    );
    // Stay on the same arrow unless the item reached the end of the list.
    const atEnd =
      (delta < 0 && target === 0) || (delta > 0 && target === next.length - 1);
    const arrow = delta < 0 !== atEnd ? "up" : "down";
    setPendingFocus(`${item}:${next.length > 1 ? arrow : "remove"}`);
  }
  function remove(index: number) {
    const item = ids[index];
    const next = ids.filter((_, i) => i !== index);
    onChange(next);
    setAnnouncement(`${titleOf(item)} removed.`);
    const neighbour = next[index] ?? next[index - 1];
    setPendingFocus(neighbour ? `${neighbour}:remove` : "add");
  }
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
        {legend}
      </Typography>
      {ids.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyText}
        </Typography>
      ) : (
        <Box
          component="ol"
          sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 1 }}
        >
          {ids.map((item, index) => {
            const name = titleOf(item);
            const note = byId.get(item)?.note;
            return (
              <Paper
                component="li"
                key={item}
                variant="outlined"
                sx={{
                  p: 1,
                  pl: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ minWidth: 20 }}
                  aria-hidden="true"
                >
                  {index + 1}.
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2">
                    <Box component="span" sx={visuallyHidden}>
                      {index + 1} of {ids.length}:{" "}
                    </Box>
                    {name}
                  </Typography>
                  {note && (
                    <Typography variant="caption" color="text.secondary">
                      {note}
                    </Typography>
                  )}
                </Box>
                <IconButton
                  size="small"
                  aria-label={`Move ${name} up`}
                  disabled={index === 0}
                  ref={(el) => {
                    if (el) controls.current.set(`${item}:up`, el);
                  }}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Move ${name} down`}
                  disabled={index === ids.length - 1}
                  ref={(el) => {
                    if (el) controls.current.set(`${item}:down`, el);
                  }}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Remove ${name}`}
                  ref={(el) => {
                    if (el) controls.current.set(`${item}:remove`, el);
                  }}
                  onClick={() => remove(index)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Paper>
            );
          })}
        </Box>
      )}
      <TextField
        select
        id={addId}
        label={`Add a ${noun}`}
        value=""
        onChange={(e) => {
          const added = e.target.value;
          if (!added) return;
          onChange([...ids, added]);
          setAnnouncement(
            `${titleOf(added)} added as ${noun} ${ids.length + 1}.`,
          );
        }}
        error={Boolean(error)}
        helperText={
          error ??
          (full
            ? `The limit is ${max}. Remove one to add another.`
            : available.length === 0
              ? `Every ${noun} is already included.`
              : helperText)
        }
        fullWidth
        sx={{ mt: 2 }}
      >
        {/* Never disabled: the select often has focus when it fills up. */}
        {full || available.length === 0 ? (
          <MenuItem value="" disabled>
            {full ? `Limit of ${max} reached` : `No more ${noun}s to add`}
          </MenuItem>
        ) : (
          available.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {o.title}
              {o.note ? ` (${o.note.toLowerCase()})` : ""}
            </MenuItem>
          ))
        )}
      </TextField>
      <Box role="status" sx={visuallyHidden}>
        {announcement}
      </Box>
    </Box>
  );
}
