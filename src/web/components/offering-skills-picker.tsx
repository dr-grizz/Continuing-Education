"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { OfferingSkill } from "../../domain/offering-skills";

async function reference<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/badges/public/skills/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Skills are temporarily unavailable.");
  return data;
}
export function OfferingSkillsPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: OfferingSkill[];
  onChange: (skills: OfferingSkill[]) => void;
  disabled?: boolean;
}) {
  const id = useId(),
    [query, setQuery] = useState(""),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [failure, setFailure] = useState(""),
    [status, setStatus] = useState(""),
    [results, setResults] = useState<OfferingSkill[]>([]);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    reference<{ ready: boolean }>("catalog", undefined, controller.signal)
      .then((data) => {
        setReady(data.ready);
        if (!data.ready)
          setStatus(
            "The skills catalog is not available yet. You can save the offering and add skills later.",
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setFailure(error.message);
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, []);
  async function search() {
    if (loading || disabled || !ready) return;
    if (query.trim().length < 2) {
      setFailure("Enter at least two characters to search skills.");
      return;
    }
    setLoading(true);
    setFailure("");
    setStatus("Searching skills…");
    const controller = new AbortController();
    pending.current = controller;
    try {
      const data = await reference<{ skills: OfferingSkill[] }>(
        "search",
        { query: query.trim() },
        controller.signal,
      );
      setResults(data.skills);
      setStatus(
        data.skills.length
          ? `${data.skills.length} skills found. Select Add beside a skill to attach it.`
          : "No skills found. Try another skill name or software title.",
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatus("");
        setFailure((error as Error).message);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  const selected = (skill: OfferingSkill) =>
    value.some(
      (item) => item.id === skill.id && item.releaseId === skill.releaseId,
    );
  return (
    <Box
      component="section"
      aria-labelledby={`${id}-heading`}
      sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}
    >
      <Stack spacing={1.5}>
        <Typography id={`${id}-heading`} component="h3" variant="h6">
          Skills
        </Typography>
        <Typography variant="body2">
          Select up to 20 O*NET skills this offering develops. Search a skill
          name or software title, then choose Add.
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "start" } }}
        >
          <TextField
            label="Search offering skills"
            placeholder="Critical thinking or Microsoft Excel"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled || !ready}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 100 } }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
          />
          <Button
            variant="outlined"
            disabled={disabled || !ready || loading}
            onClick={search}
            sx={{ minHeight: 48, flexShrink: 0 }}
          >
            Search skills
          </Button>
        </Stack>
        {failure && <Alert severity="error">{failure}</Alert>}
        <Typography role="status" variant="body2">
          {status}
        </Typography>
        {results.length > 0 && (
          <Stack
            spacing={1}
            sx={{ maxHeight: 280, overflowY: "auto", p: 0.5 }}
            aria-label="Skill search results"
          >
            {results.map((skill) => (
              <Paper
                key={`${skill.releaseId}:${skill.id}`}
                variant="outlined"
                sx={{ p: 1.5 }}
              >
                <Typography sx={{ fontWeight: 600 }}>{skill.name}</Typography>
                <Typography variant="body2">{skill.description}</Typography>
                <Button
                  disabled={disabled || selected(skill) || value.length >= 20}
                  aria-label={`Add ${skill.name}`}
                  onClick={() => {
                    if (selected(skill) || value.length >= 20) return;
                    onChange([...value, skill]);
                    setStatus(`${skill.name} added.`);
                  }}
                >
                  {selected(skill) ? "Added" : "Add"}
                </Button>
              </Paper>
            ))}
          </Stack>
        )}
        <Typography component="h4" variant="subtitle2">
          Selected skills ({value.length}/20)
        </Typography>
        {value.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No skills selected. Skills are optional.
          </Typography>
        ) : (
          <Stack
            component="ul"
            spacing={1}
            sx={{ p: 0, m: 0, listStyle: "none" }}
          >
            {value.map((skill) => (
              <Paper
                component="li"
                key={`${skill.releaseId}:${skill.id}`}
                variant="outlined"
                sx={{ p: 1.5 }}
              >
                <Typography sx={{ fontWeight: 600 }}>{skill.name}</Typography>
                <Typography variant="body2">{skill.description}</Typography>
                <Typography variant="caption">
                  O*NET {skill.version} · {skill.category}
                </Typography>
                <Button
                  disabled={disabled}
                  aria-label={`Remove ${skill.name}`}
                  onClick={() => {
                    onChange(
                      value.filter(
                        (item) =>
                          !(
                            item.id === skill.id &&
                            item.releaseId === skill.releaseId
                          ),
                      ),
                    );
                    setStatus(`${skill.name} removed.`);
                  }}
                >
                  Remove
                </Button>
              </Paper>
            ))}
          </Stack>
        )}
        <Typography variant="caption" color="text.secondary">
          Definitions:{" "}
          <Link
            href="https://www.onetcenter.org/database.html"
            target="_blank"
            rel="noreferrer"
          >
            O*NET Database
          </Link>{" "}
          by USDOL/ETA,{" "}
          <Link
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </Link>
          .{" "}
          <Link href="/skills" target="_blank" rel="noreferrer">
            Explore skills and careers
          </Link>
          .
        </Typography>
      </Stack>
    </Box>
  );
}
