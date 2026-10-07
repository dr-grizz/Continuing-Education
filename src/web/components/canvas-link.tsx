"use client";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

// Sample offerings use reserved example addresses (canvas.example.edu) until
// real Canvas courses are mapped. Those open an explanation instead of a dead
// page; real addresses open in a new tab. Replacing the offering's Canvas
// address in Staff → Offerings is all that is needed later.
export function isPlaceholderUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      /(^|\.)example\.(com|org|net|edu)$/.test(host) ||
      /(^|\.)(test|example|invalid|localhost)$/.test(host)
    );
  } catch {
    return true;
  }
}

export function CanvasLinkButton({
  id,
  url,
  title,
}: {
  /** Offering ID, used to make the dialog's label unique. */
  id: string;
  url: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  if (!isPlaceholderUrl(url))
    return (
      <Button
        variant="contained"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        endIcon={<OpenInNewIcon />}
        aria-label={`Open ${title} in Canvas (opens in a new tab)`}
        data-next-action
      >
        Open course in Canvas
      </Button>
    );
  const titleId = `canvas-placeholder-${id}`;
  return (
    <>
      <Button
        variant="contained"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Open ${title} in Canvas`}
        data-next-action
      >
        Open course in Canvas
      </Button>
      {/* MUI focuses the dialog (its title is announced) and returns focus to
          the button when it closes. */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        maxWidth="xs"
      >
        <DialogTitle id={titleId}>Canvas course not connected yet</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This prototype uses a placeholder address for {title}, so there is
            no Canvas course to open. When the course is connected to Canvas,
            this button opens it in a new tab.
          </DialogContentText>
          <DialogContentText sx={{ mt: 1.5, wordBreak: "break-all" }}>
            Placeholder: {url}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
