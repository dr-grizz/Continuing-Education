# ADR 0006: Rich text for sales pages (Tiptap)

Status: accepted, October 8, 2026. Refines decision F2 in the [decision register](../decision-register.md).

## Context

Sales pages started as a list of structured blocks (hero image, text, outcomes, instructor, testimonial, questions and answers) with plain text only. Program staff asked for a single rich text area for now, with image uploads and embedded videos, while keeping the block structure for later.

## Decision

- **Editor:** [Tiptap](https://tiptap.dev) 3 (MIT, built on ProseMirror) with [mui-tiptap](https://github.com/sjdemartini/mui-tiptap) (MIT) for a Material UI toolbar. Versions are pinned in `package.json`.
  - Considered and not chosen:
    - **Editor.js:** stores blocks natively, but its pop-up toolbars have known keyboard and screen-reader problems.
    - **Lexical:** image and embed support would have to be built from example code.
    - **Quill 2:** fewer recent releases, and its output would have to be sanitized as HTML.
- **Block structure kept:** a page is still `{ blocks, seo }`. The editor shows one `rich_text` block. The other block types stay in the page model, the server checks and the renderer, and `BLOCK_EDITING` in `components/staff-sales-pages.tsx` brings back the block list. A draft that already holds other block types shows the list.
- **Content is JSON, never HTML.**
  - Tiptap's JSON is rebuilt on the server from an allowlist (`src/domain/rich-text.ts`, shared with the website):
    - paragraphs, headings 2–4, bulleted and numbered lists, quotes, dividers and line breaks
    - bold, italic and links (https, http and mailto)
    - images and videos
  - Anything else is refused. Learners see it through our own React renderer, not `innerHTML`.
- **Images:**
  - Uploaded to the portal: PNG, JPEG, WebP or GIF up to 5 MB, checked by their first bytes. SVG is refused, because it can carry scripts.
  - Stored in the `media_assets` table for the prototype and served at `/media/{id}` with `nosniff`.
  - Each image needs a description (alternative text) before publishing. The editor asks for it before uploading.
- **Videos:**
  - Any **https** player, from a link or pasted embed code. Each needs a title, which becomes the player's accessible name. Insecure (`http:`) and script addresses, and addresses carrying passwords, are refused.
  - YouTube (privacy-enhanced youtube-nocookie.com player), Vimeo and Kaltura links become their standard players.
  - Players from other sites (`provider: "other"`) are shown with `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`: they play, but cannot redirect the page, submit forms or start downloads.
  - Changed the same day: the first version allowed only YouTube, Vimeo and Kaltura. Program staff chose not to limit sources; only content editors can embed, and every change is audited.
  - The editor shows a labelled placeholder; the preview and course page show the player.
- **Page title** (browser tab) sits at the top of the editor. The search description was dropped.

## Consequences

- Image uploads raise the API's JSON body limit to 8 MB (base64 through the website's proxy).
- Hosting needs object storage for images (Azure Blob Storage or Railway's buckets) in place of the database table. A Content Security Policy can still limit scripts and images, but its `frame-src` must allow any https site.
- An embedded page can show anything its site serves, including misleading content. Content editors are trusted to choose sources; the audit log records who changed each page.
- Draft images are reachable by their random address before publishing. That's acceptable for marketing images; revisit if private images are ever needed.
