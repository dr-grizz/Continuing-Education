import { Node, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { LinkBubbleMenuHandler } from "mui-tiptap";
import { videoProviders, type VideoProvider } from "../../domain/rich-text";

// Tiptap setup for sales page rich text. It matches the server's allowlist in
// src/domain/rich-text.ts: anything else is refused when saving.

/**
 * A YouTube, Vimeo or Kaltura player. The editor shows a labelled
 * placeholder instead of the player, so the editing area stays quiet and
 * keyboard-friendly; the preview and course page show the player.
 */
export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      provider: { default: "youtube" },
      src: { default: "" },
      title: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-video-embed]",
        getAttrs: (element) => ({
          provider: element.getAttribute("data-provider"),
          src: element.getAttribute("data-src"),
          title: element.getAttribute("data-title"),
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const provider = node.attrs.provider as VideoProvider;
    const title = (node.attrs.title as string) || "No title yet";
    return [
      "div",
      mergeAttributes({
        "data-video-embed": "",
        "data-provider": provider,
        "data-src": HTMLAttributes.src,
        "data-title": node.attrs.title,
        class: "rich-text-video",
      }),
      `▶ ${videoProviders[provider] ?? "Video"} video: ${title}`,
    ];
  },
});

export const richTextExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["mailto"],
    },
  }),
  LinkBubbleMenuHandler,
  Image.configure({ inline: false, allowBase64: false }),
  VideoEmbed,
];
