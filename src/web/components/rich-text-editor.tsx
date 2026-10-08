"use client";
import { useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import {
  LinkBubbleMenu,
  MenuButton,
  MenuButtonBlockquote,
  MenuButtonBold,
  MenuButtonBulletedList,
  MenuButtonEditLink,
  MenuButtonHorizontalRule,
  MenuButtonImageUpload,
  MenuButtonItalic,
  MenuButtonOrderedList,
  MenuButtonRedo,
  MenuButtonUndo,
  MenuControlsContainer,
  MenuDivider,
  MenuSelectHeading,
  RichTextEditor,
  type RichTextEditorRef,
  useRichTextEditorContext,
} from "mui-tiptap";
import { api } from "./api";
import { richTextExtensions } from "./rich-text-extensions";
import {
  parseVideo,
  videoProviders,
  type RichDoc,
} from "../../domain/rich-text";

// The sales page's rich text editor (Tiptap with mui-tiptap's toolbar). Images
// are uploaded to the portal and need a description first; videos come from
// YouTube, Vimeo or Kaltura and need a title.

const imageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE = 5 * 1024 * 1024;

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

type AltRequest = {
  fileName?: string;
  alt: string;
  resolve: (alt: string | null) => void;
};
type VideoRequest = { link: string; title: string; editing: boolean };

export function SalesRichTextEditor({
  content,
  onChange,
  onError,
}: {
  content: RichDoc;
  onChange: (doc: RichDoc) => void;
  onError: (message: string) => void;
}) {
  const editorRef = useRef<RichTextEditorRef>(null);
  const [altRequest, setAltRequest] = useState<AltRequest>(),
    [altError, setAltError] = useState(""),
    [video, setVideo] = useState<VideoRequest>(),
    [videoError, setVideoError] = useState("");
  const editor = () => editorRef.current?.editor ?? null;

  // Asks for the image description before uploading (or to change it).
  const askAlt = (fileName?: string, alt = "") =>
    new Promise<string | null>((resolve) => {
      setAltError("");
      setAltRequest({ fileName, alt, resolve });
    });
  async function uploadFiles(files: File[]) {
    const file = files[0];
    if (!file) return [];
    if (!imageTypes.includes(file.type)) {
      onError("Choose a PNG, JPEG, WebP or GIF image.");
      return [];
    }
    if (file.size > MAX_IMAGE) {
      onError("Images must be 5 MB or smaller.");
      return [];
    }
    const alt = await askAlt(file.name);
    if (alt === null) return [];
    try {
      const uploaded = await api<{ url: string }>("staff/media", {
        role: "staff",
        body: {
          fileName: file.name,
          contentType: file.type,
          data: await readBase64(file),
        },
      });
      return [{ src: uploaded.url, alt }];
    } catch (e) {
      onError(`The image was not uploaded. ${(e as Error).message}`);
      return [];
    }
  }
  async function describeSelectedImage(current: Editor) {
    const alt = await askAlt(
      undefined,
      current.getAttributes("image").alt ?? "",
    );
    if (alt !== null)
      current.chain().focus().updateAttributes("image", { alt }).run();
  }
  function openVideo(current: Editor) {
    setVideoError("");
    if (current.isActive("videoEmbed")) {
      const attrs = current.getAttributes("videoEmbed");
      setVideo({ link: attrs.src, title: attrs.title ?? "", editing: true });
    } else setVideo({ link: "", title: "", editing: false });
  }
  function saveVideo() {
    const current = editor();
    if (!video || !current) return;
    const parsed = parseVideo(video.link);
    if (!parsed) {
      setVideoError(
        "Paste a YouTube, Vimeo or Kaltura link or embed code. Other sites are not allowed.",
      );
      document.getElementById("video-link")?.focus();
      return;
    }
    if (!video.title.trim()) {
      setVideoError("Give the video a title. Screen readers announce it.");
      document.getElementById("video-title")?.focus();
      return;
    }
    const attrs = { ...parsed, title: video.title.trim() };
    if (video.editing)
      current.chain().focus().updateAttributes("videoEmbed", attrs).run();
    else
      current
        .chain()
        .focus()
        // A paragraph after the video takes the cursor, so the next thing
        // typed or inserted does not replace the selected video.
        .insertContent([{ type: "videoEmbed", attrs }, { type: "paragraph" }])
        .run();
    setVideo(undefined);
  }

  return (
    <Box
      sx={{
        // A comfortable writing area that grows with the content.
        "& .ProseMirror": { minHeight: 240 },
        "& .rich-text-video": {
          p: 2,
          my: 1,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "action.hover",
        },
        "& .ProseMirror img": { maxWidth: "100%", height: "auto" },
      }}
    >
      <RichTextEditor
        ref={editorRef}
        extensions={richTextExtensions}
        content={content}
        immediatelyRender={false}
        onUpdate={({ editor: current }) =>
          onChange(current.getJSON() as RichDoc)
        }
        editorProps={{
          attributes: {
            role: "textbox",
            "aria-multiline": "true",
            "aria-label": "Page content",
          },
        }}
        renderControls={() => (
          <MenuControlsContainer>
            <MenuSelectHeading aria-label="Text style" />
            <MenuDivider />
            <MenuButtonBold />
            <MenuButtonItalic />
            <MenuButtonEditLink />
            <MenuDivider />
            <MenuButtonBulletedList />
            <MenuButtonOrderedList />
            <MenuButtonBlockquote />
            <MenuButtonHorizontalRule />
            <MenuDivider />
            <MenuButtonImageUpload
              tooltipLabel="Upload an image"
              onUploadFiles={uploadFiles}
              inputProps={{ accept: imageTypes.join(","), multiple: false }}
            />
            <ImageDescriptionButton onClick={describeSelectedImage} />
            <VideoButton onClick={openVideo} />
            <MenuDivider />
            <MenuButtonUndo />
            <MenuButtonRedo />
          </MenuControlsContainer>
        )}
      >
        {() => <LinkBubbleMenu />}
      </RichTextEditor>
      <Dialog
        open={!!altRequest}
        onClose={() => {
          altRequest?.resolve(null);
          setAltRequest(undefined);
        }}
        aria-labelledby="image-alt-title"
        fullWidth
        maxWidth="sm"
        // Opened from the file picker, the dialog itself would take focus;
        // the description field is where typing goes.
        slotProps={{
          transition: {
            onEntered: () => document.getElementById("image-alt")?.focus(),
          },
        }}
      >
        <DialogTitle id="image-alt-title">Describe the image</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {altRequest?.fileName ? `${altRequest.fileName}: ` : ""}
            Describe what the image shows for people who cannot see it. Skip
            words like “image of”.
          </DialogContentText>
          <TextField
            id="image-alt"
            label="Image description"
            value={altRequest?.alt ?? ""}
            onChange={(e) =>
              altRequest &&
              setAltRequest({ ...altRequest, alt: e.target.value })
            }
            error={!!altError}
            helperText={
              altError || "Required before publishing. Up to 300 characters."
            }
            slotProps={{ htmlInput: { maxLength: 300 } }}
            required
            autoFocus
            fullWidth
            multiline
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              altRequest?.resolve(null);
              setAltRequest(undefined);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!altRequest) return;
              if (!altRequest.alt.trim()) {
                setAltError("Describe the image.");
                document.getElementById("image-alt")?.focus();
                return;
              }
              altRequest.resolve(altRequest.alt.trim());
              setAltRequest(undefined);
            }}
          >
            {altRequest?.fileName ? "Upload image" : "Save description"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!video}
        onClose={() => setVideo(undefined)}
        aria-labelledby="video-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="video-dialog-title">
          {video?.editing ? "Edit video" : "Add a video"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText>
              Paste a link or embed code from{" "}
              {Object.values(videoProviders).join(", ")}.
            </DialogContentText>
            {videoError && (
              <Alert severity="error" role="alert">
                {videoError}
              </Alert>
            )}
            <TextField
              id="video-link"
              label="Video link or embed code"
              value={video?.link ?? ""}
              onChange={(e) =>
                video && setVideo({ ...video, link: e.target.value })
              }
              required
              autoFocus
              fullWidth
              multiline
              maxRows={4}
            />
            <TextField
              id="video-title"
              label="Video title"
              value={video?.title ?? ""}
              onChange={(e) =>
                video && setVideo({ ...video, title: e.target.value })
              }
              helperText="Screen readers announce this name for the player."
              slotProps={{ htmlInput: { maxLength: 200 } }}
              required
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVideo(undefined)}>Cancel</Button>
          <Button variant="contained" onClick={saveVideo}>
            {video?.editing ? "Save video" : "Add video"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ImageDescriptionButton({
  onClick,
}: {
  onClick: (editor: Editor) => void;
}) {
  const current = useRichTextEditorContext();
  return (
    <MenuButton
      tooltipLabel="Describe the selected image"
      IconComponent={ImageSearchIcon}
      disabled={!current?.isEditable || !current.isActive("image")}
      onClick={() => current && onClick(current)}
    />
  );
}

function VideoButton({ onClick }: { onClick: (editor: Editor) => void }) {
  const current = useRichTextEditorContext();
  return (
    <MenuButton
      tooltipLabel={
        current?.isActive("videoEmbed")
          ? "Edit the selected video"
          : "Add a video"
      }
      IconComponent={VideoLibraryIcon}
      disabled={!current?.isEditable}
      selected={!!current?.isActive("videoEmbed")}
      onClick={() => current && onClick(current)}
    />
  );
}
