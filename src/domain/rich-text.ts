// Rich text for sales pages, shared by the API (validation) and the website
// (editor and renderer). Content is Tiptap/ProseMirror JSON, never HTML. The
// server rebuilds every document from this allowlist, so only these nodes,
// marks and attributes can be saved or shown:
// - nodes: paragraph, heading (levels 2-4), bullet and numbered lists,
//   blockquote, horizontal rule, hard break, image, video embed
// - marks: bold, italic, link (http, https and mailto only)
// - images: files uploaded to the portal (/media/{id}) with alternative text
// - videos: any https player, each with a title. YouTube, Vimeo and Kaltura
//   links become their standard players; other sites are shown sandboxed.

export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; attrs: { href: string } };
export type RichNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
  marks?: Mark[];
};
export type RichDoc = { type: "doc"; content: RichNode[] };

export const emptyDoc = (): RichDoc => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

export const videoProviders = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  kaltura: "Kaltura",
  other: "Embedded",
} as const;
export type VideoProvider = keyof typeof videoProviders;

/**
 * Turns a video page link, player link or pasted embed code into a player
 * address, or null when it is not an https address. YouTube, Vimeo and
 * Kaltura links become their standard players (YouTube's privacy-enhanced
 * youtube-nocookie.com); any other https address is kept as given.
 */
export function parseVideo(
  input: string,
): { provider: VideoProvider; src: string } | null {
  const known = parseKnownVideo(input);
  if (known) return known;
  const pasted = input.trim().match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  try {
    const url = new URL(
      (pasted ? pasted[1] : input.trim()).replace(/&amp;/g, "&"),
    );
    // No passwords in addresses; https only, so pages never mix in insecure content.
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { provider: "other", src: url.toString() };
  } catch {
    return null;
  }
}
function parseKnownVideo(
  input: string,
): { provider: VideoProvider; src: string } | null {
  const pasted = input.trim().match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  let url: URL;
  try {
    url = new URL((pasted ? pasted[1] : input.trim()).replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const youtubeId = (id: string | null | undefined) =>
    id && /^[A-Za-z0-9_-]{6,20}$/.test(id)
      ? {
          provider: "youtube" as const,
          src: `https://www.youtube-nocookie.com/embed/${id}`,
        }
      : null;
  if (host === "youtu.be") return youtubeId(url.pathname.slice(1));
  if (/^(www\.|m\.)?youtube(-nocookie)?\.com$/.test(host)) {
    if (url.pathname === "/watch") return youtubeId(url.searchParams.get("v"));
    const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/]+)$/);
    return youtubeId(match?.[2]);
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const id = url.pathname.match(/^\/(\d+)$/)?.[1];
    return id
      ? { provider: "vimeo", src: `https://player.vimeo.com/video/${id}` }
      : null;
  }
  if (host === "player.vimeo.com") {
    const id = url.pathname.match(/^\/video\/(\d+)$/)?.[1];
    const hash = url.searchParams.get("h");
    return id
      ? {
          provider: "vimeo",
          src: `https://player.vimeo.com/video/${id}${hash && /^[0-9a-f]+$/.test(hash) ? `?h=${hash}` : ""}`,
        }
      : null;
  }
  // Kaltura players are served from kaltura.com hosts (for example
  // cdnapisec.kaltura.com/p/{partner}/...); the address is kept as given.
  if (host === "kaltura.com" || host.endsWith(".kaltura.com"))
    return url.pathname.startsWith("/p/") ||
      url.pathname.startsWith("/html5/") ||
      url.pathname.includes("/embed")
      ? { provider: "kaltura", src: url.toString() }
      : null;
  return null;
}

export const mediaPath = /^\/media\/[0-9a-f-]{36}$/;
const safeHref = (href: string) => /^(https?:\/\/|mailto:)/i.test(href.trim());

const LIMITS = { nodes: 5000, depth: 12, text: 50_000, attr: 300 };

/**
 * Rebuilds a document from the allowlist. Returns the clean document, or the
 * first problem found. Callers on the server reject the request; the editor
 * uses the clean form to compare drafts.
 */
export function normalizeDoc(
  input: unknown,
): { doc: RichDoc; error?: undefined } | { doc?: undefined; error: string } {
  let nodes = 0;
  let textLength = 0;
  const fail = (error: string) => {
    throw new Error(error);
  };
  const str = (value: unknown, max = LIMITS.attr) =>
    typeof value === "string" ? value.slice(0, max) : "";
  const marksOf = (marks: unknown): Mark[] | undefined => {
    if (!Array.isArray(marks) || !marks.length) return undefined;
    const clean: Mark[] = [];
    for (const mark of marks as {
      type?: string;
      attrs?: { href?: unknown };
    }[]) {
      if (mark?.type === "bold" || mark?.type === "italic")
        clean.push({ type: mark.type });
      else if (mark?.type === "link") {
        const href = str(mark.attrs?.href, 2000).trim();
        if (!safeHref(href))
          fail("Links must start with https://, http:// or mailto:.");
        clean.push({ type: "link", attrs: { href } });
      } else fail(`Text formatting "${String(mark?.type)}" is not allowed.`);
    }
    return clean.length ? clean : undefined;
  };
  const walk = (raw: unknown, depth: number, allowed: string[]): RichNode => {
    if (++nodes > LIMITS.nodes) fail("The page is too long.");
    if (depth > LIMITS.depth) fail("The page is nested too deeply.");
    const node = (raw ?? {}) as RichNode;
    if (!allowed.includes(node.type))
      fail(`Content type "${String(node.type)}" is not allowed here.`);
    const children = (kinds: string[]) =>
      Array.isArray(node.content)
        ? node.content.map((child) => walk(child, depth + 1, kinds))
        : [];
    const withContent = (n: RichNode, kinds: string[]) => {
      const content = children(kinds);
      return content.length ? { ...n, content } : n;
    };
    switch (node.type) {
      case "text": {
        const text = str(node.text, LIMITS.text);
        textLength += text.length;
        if (textLength > LIMITS.text) fail("The page has too much text.");
        const marks = marksOf(node.marks);
        return marks ? { type: "text", text, marks } : { type: "text", text };
      }
      case "hardBreak":
      case "horizontalRule":
        return { type: node.type };
      case "paragraph":
        return withContent({ type: "paragraph" }, inline);
      case "heading": {
        const level = Number(node.attrs?.level);
        return withContent(
          {
            type: "heading",
            attrs: { level: [2, 3, 4].includes(level) ? level : 2 },
          },
          inline,
        );
      }
      case "bulletList":
        return withContent({ type: "bulletList" }, ["listItem"]);
      case "orderedList": {
        const start = Number(node.attrs?.start);
        return withContent(
          {
            type: "orderedList",
            attrs: { start: Number.isInteger(start) && start > 0 ? start : 1 },
          },
          ["listItem"],
        );
      }
      case "listItem":
        return withContent({ type: "listItem" }, blocks);
      case "blockquote":
        return withContent({ type: "blockquote" }, blocks);
      case "image": {
        const src = str(node.attrs?.src);
        if (!mediaPath.test(src))
          fail("Images must be uploaded to the portal.");
        return { type: "image", attrs: { src, alt: str(node.attrs?.alt) } };
      }
      case "videoEmbed": {
        const video = parseVideo(str(node.attrs?.src, 2000));
        if (!video) fail("Video addresses must start with https://.");
        return {
          type: "videoEmbed",
          attrs: { ...video, title: str(node.attrs?.title, 200) },
        };
      }
    }
    return fail(`Content type "${String(node.type)}" is not allowed.`);
  };
  const inline = ["text", "hardBreak"];
  const blocks = [
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "blockquote",
    "horizontalRule",
    "image",
    "videoEmbed",
  ];
  try {
    const doc = (input ?? {}) as RichNode;
    if (doc.type !== "doc") fail("Rich text must be a document.");
    const content = Array.isArray(doc.content)
      ? doc.content.map((child) => walk(child, 1, blocks))
      : [];
    return { doc: { type: "doc", content } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** True when a document has no text, images or videos. */
export function docIsEmpty(doc: RichDoc): boolean {
  const visit = (node: RichNode): boolean =>
    (node.type === "text" && !!node.text?.trim()) ||
    node.type === "image" ||
    node.type === "videoEmbed" ||
    !!node.content?.some(visit);
  return !doc.content.some(visit);
}

/** What a rich text block still needs before publishing. */
export function richTextProblems(doc: RichDoc, where: string): string[] {
  const problems: string[] = [];
  let images = 0;
  let videos = 0;
  let text = "";
  const visit = (node: RichNode) => {
    if (node.type === "text") text += node.text ?? "";
    if (node.type === "image") {
      images++;
      if (!str(node.attrs?.alt).trim())
        problems.push(`${where}: describe image ${images} (alternative text).`);
    }
    if (node.type === "videoEmbed") {
      videos++;
      if (!str(node.attrs?.title).trim())
        problems.push(`${where}: give video ${videos} a title.`);
    }
    node.content?.forEach(visit);
  };
  doc.content.forEach(visit);
  if (!text.trim() && !images && !videos)
    problems.unshift(`${where}: add some content.`);
  return problems;
}
const str = (value: unknown) => (typeof value === "string" ? value : "");
