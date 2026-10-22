"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "./api";
import { courseImage, CU_CE_IMAGE } from "./course-images";
import type { StaffOffering } from "./offering-form";

type Mode = "upload" | "fallback" | "source";
type Upload = {
  fileName: string;
  contentType: string;
  data: string;
  preview: string;
};

export function OfferingImageEditor({
  offering,
  disabled,
  onSaved,
}: {
  offering: StaffOffering;
  disabled: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const label = offering.image_override
    ? offering.image_media_id
      ? "Uploaded portal image"
      : "CU CE image"
    : offering.imported_from_canvas
      ? "Canvas image, with CU CE fallback"
      : "Default course image";
  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="h6" component="h3">
        Course display image
      </Typography>
      <Typography sx={{ mt: 1 }}>{label}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
        Image changes stay in the portal. Canvas is never changed, and
        refreshing Canvas details preserves your choice.
      </Typography>
      <Button
        variant="outlined"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Change image
      </Button>
      {disabled && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          Save or discard your detail changes before changing the image.
        </Typography>
      )}
      {open && (
        <ImageDialog
          offering={offering}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </Paper>
  );
}

function ImageDialog({
  offering,
  onClose,
  onSaved,
}: {
  offering: StaffOffering;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const initial: Mode = offering.image_override
    ? offering.image_media_id
      ? "upload"
      : "fallback"
    : "source";
  const [mode, setMode] = useState<Mode>(initial);
  const [upload, setUpload] = useState<Upload>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [failedSource, setFailedSource] = useState("");
  const failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) failure.current?.focus();
  }, [error]);
  const needsReason = Boolean(offering.published || offering.unpublished_at);
  const source =
    mode === "fallback"
      ? CU_CE_IMAGE
      : mode === "upload"
        ? (upload?.preview ?? courseImage(offering))
        : courseImage({ ...offering, image_override: false });
  const preview = failedSource === source ? CU_CE_IMAGE : source;
  const changed = mode !== initial || Boolean(upload);
  async function choose(file?: File) {
    setUpload(undefined);
    setError("");
    if (!file) return;
    if (
      !file.size ||
      file.size > 5 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
        file.type,
      )
    ) {
      setError("Choose a PNG, JPEG, WebP or GIF image, 5 MB or smaller.");
      return;
    }
    setReading(true);
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () =>
          reject(new Error("The image could not be read. Choose it again."));
        reader.readAsDataURL(file);
      });
      setUpload({
        fileName: file.name,
        contentType: file.type,
        data: result.split(",")[1],
        preview: result,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || reading) return;
    if (needsReason && reason.trim().length < 10) {
      setError("Give a reason of at least 10 characters.");
      return;
    }
    if (mode === "upload" && !upload) {
      setError("Choose an image to upload.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`offerings/${offering.id}/image`, {
        role: "staff",
        body: {
          version: offering.version,
          mode,
          reason: reason.trim() || undefined,
          ...(mode === "upload" && upload
            ? {
                fileName: upload.fileName,
                contentType: upload.contentType,
                data: upload.data,
              }
            : {}),
        },
      });
      await onSaved("Course image saved in the portal. Canvas is unchanged.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy && !reading) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="offering-image-title"
      aria-describedby="offering-image-help"
    >
      <Box component="form" onSubmit={save}>
        <DialogTitle id="offering-image-title">Change course image</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography id="offering-image-help">
              Uploaded images and the CU CE choice stay in the portal and are
              preserved during Canvas refreshes.
            </Typography>
            {error && (
              <Alert severity="error" tabIndex={-1} ref={failure}>
                {error}
              </Alert>
            )}
            <FormControl disabled={busy || reading}>
              <FormLabel id="offering-image-source">Image source</FormLabel>
              <RadioGroup
                aria-labelledby="offering-image-source"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as Mode);
                  setError("");
                }}
              >
                <FormControlLabel
                  value="upload"
                  control={<Radio />}
                  label="Upload a portal image"
                />
                <FormControlLabel
                  value="fallback"
                  control={<Radio />}
                  label="Use CU CE image"
                />
                <FormControlLabel
                  value="source"
                  control={<Radio />}
                  label={
                    offering.imported_from_canvas
                      ? "Use Canvas course image"
                      : "Use default course image"
                  }
                />
              </RadioGroup>
            </FormControl>
            {mode === "source" && (
              <Typography variant="body2" color="text.secondary">
                {offering.imported_from_canvas
                  ? "Follows the Canvas image on future refreshes. Missing or unavailable images use the CU CE image."
                  : "Uses the standard image for this course."}
              </Typography>
            )}
            {mode === "upload" && (
              <Stack spacing={1}>
                <label htmlFor="offering-image-file">
                  Choose image (PNG, JPEG, WebP or GIF; up to 5 MB)
                </label>
                <input
                  id="offering-image-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={busy || reading}
                  onChange={(event) => {
                    void choose(event.target.files?.[0]);
                  }}
                />
              </Stack>
            )}
            <Box
              component="img"
              src={preview}
              alt="Course display image preview"
              referrerPolicy="no-referrer"
              onError={() => setFailedSource(source)}
              sx={{
                width: "100%",
                aspectRatio: "16 / 9",
                objectFit: preview === CU_CE_IMAGE ? "contain" : "cover",
                p: preview === CU_CE_IMAGE ? 3 : 0,
                bgcolor: "#19384b",
                borderRadius: 1,
              }}
            />
            {needsReason && (
              <TextField
                label="Reason for image change"
                required
                multiline
                minRows={2}
                value={reason}
                disabled={busy || reading}
                onChange={(event) => setReason(event.target.value)}
                helperText="At least 10 characters. Recorded in offering activity."
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || reading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={
              busy || reading || !changed || (mode === "upload" && !upload)
            }
          >
            {busy ? "Saving image…" : "Save image"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
