"use client";
import { Fragment } from "react";
import { Box, Link, Paper, Typography } from "@mui/material";
import type { Mark, RichDoc, RichNode } from "../../domain/rich-text";

// Sales page blocks as learners see them, shared by the course page and the
// staff preview. Everything renders as plain text (no HTML), so a page cannot
// inject markup. Headings start at `level` so the preview nests correctly.

export const heroImages = [
  { key: "data-analysis", label: "Data analysis" },
  { key: "leadership", label: "Leadership" },
  { key: "healthcare", label: "Healthcare" },
  { key: "biblical-study", label: "Biblical study" },
  { key: "workplace-technology", label: "Workplace technology" },
] as const;
export type HeroImage = (typeof heroImages)[number]["key"];

export type Block =
  | { type: "rich_text"; doc: RichDoc }
  | {
      type: "hero";
      image: HeroImage;
      decorative: boolean;
      alt: string;
      tagline: string;
    }
  | { type: "text"; heading: string; body: string }
  | { type: "outcomes"; heading: string }
  | {
      type: "instructor";
      heading: string;
      name: string;
      role: string;
      bio: string;
    }
  | {
      type: "testimonial";
      quote: string;
      name: string;
      role: string;
      /** Staff-only; learners never receive these two fields. */
      consent?: boolean;
      consentNote?: string;
    }
  | {
      type: "faq";
      heading: string;
      items: { question: string; answer: string }[];
    };
export type SalesPage = {
  blocks: Block[];
  seo: { title: string };
};

export const blockLabels: Record<Block["type"], string> = {
  rich_text: "Rich text",
  hero: "Hero image",
  text: "Text",
  outcomes: "Learning outcomes",
  instructor: "Instructor",
  testimonial: "Testimonial",
  faq: "Questions and answers",
};

type Level = 2 | 3 | 4;
const tag = (level: number) => `h${Math.min(level, 6)}` as "h2";

/** Paragraphs are separated by blank lines; lines starting with "- " form a bulleted list. */
export function PlainText({ text }: { text: string }) {
  const chunks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return (
    <>
      {chunks.map((chunk, index) => {
        const lines = chunk.split("\n").map((line) => line.trim());
        if (lines.every((line) => line.startsWith("- ")))
          return (
            <Box
              component="ul"
              key={index}
              sx={{ pl: 3, my: 1.5, lineHeight: 1.8 }}
            >
              {lines.map((line, i) => (
                <li key={i}>{line.slice(2)}</li>
              ))}
            </Box>
          );
        return (
          <Typography key={index} sx={{ my: 1.5, lineHeight: 1.85 }}>
            {lines.join(" ")}
          </Typography>
        );
      })}
    </>
  );
}

export function SalesPageBlocks({
  page,
  outcomes,
  level = 2,
}: {
  page: SalesPage;
  /** The offering's own outcomes, shown by the outcomes block. */
  outcomes: string[];
  level?: Level;
}) {
  const heading = tag(level);
  const subheading = tag(level + 1);
  return (
    <Box sx={{ display: "grid", gap: 4 }}>
      {page.blocks.map((block, index) => {
        switch (block.type) {
          case "rich_text":
            return <RichTextView key={index} doc={block.doc} level={level} />;
          case "hero":
            return (
              <Box key={index}>
                <img
                  src={`/course-images/${block.image}-hd.jpg`}
                  alt={block.decorative ? "" : block.alt}
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 7",
                    objectFit: "cover",
                    borderRadius: 8,
                    display: "block",
                  }}
                />
                {block.tagline.trim() && (
                  <Typography sx={{ mt: 2, fontSize: 20, fontWeight: 500 }}>
                    {block.tagline}
                  </Typography>
                )}
              </Box>
            );
          case "text":
            return (
              <Box key={index}>
                {block.heading.trim() && (
                  <Typography variant="h5" component={heading}>
                    {block.heading}
                  </Typography>
                )}
                <PlainText text={block.body} />
              </Box>
            );
          case "outcomes":
            return (
              <Box key={index}>
                <Typography variant="h5" component={heading}>
                  {block.heading || "What you’ll learn"}
                </Typography>
                <Box component="ul" sx={{ pl: 3, lineHeight: 1.8 }}>
                  {outcomes.map((outcome) => (
                    <li key={outcome}>{outcome}</li>
                  ))}
                </Box>
              </Box>
            );
          case "instructor":
            return (
              <Box key={index}>
                <Typography variant="h5" component={heading}>
                  {block.heading || "Your instructor"}
                </Typography>
                <Typography
                  variant="h6"
                  component={subheading}
                  sx={{ mt: 1.5 }}
                >
                  {block.name}
                </Typography>
                {block.role.trim() && (
                  <Typography color="text.secondary">{block.role}</Typography>
                )}
                <PlainText text={block.bio} />
              </Box>
            );
          case "testimonial":
            return (
              <Paper
                key={index}
                component="figure"
                variant="outlined"
                sx={{
                  m: 0,
                  p: 3,
                  borderLeftWidth: 4,
                  borderLeftColor: "secondary.main",
                }}
              >
                <Box component="blockquote" sx={{ m: 0 }}>
                  <Typography sx={{ fontSize: 18, lineHeight: 1.7 }}>
                    “{block.quote}”
                  </Typography>
                </Box>
                <Typography
                  component="figcaption"
                  color="text.secondary"
                  sx={{ mt: 1.5 }}
                >
                  {block.name}
                  {block.role.trim() ? `, ${block.role}` : ""}
                </Typography>
              </Paper>
            );
          case "faq":
            return (
              <Box key={index}>
                <Typography variant="h5" component={heading}>
                  {block.heading}
                </Typography>
                {block.items.map((item, i) => (
                  <Box key={i} sx={{ mt: 2 }}>
                    <Typography
                      variant="subtitle1"
                      component={subheading}
                      sx={{ fontWeight: 600 }}
                    >
                      {item.question}
                    </Typography>
                    <PlainText text={item.answer} />
                  </Box>
                ))}
              </Box>
            );
        }
      })}
    </Box>
  );
}

/**
 * Rich text as learners see it. Built from the server-checked JSON with React
 * elements, never HTML. Content headings 2-4 start at `level`.
 */
export function RichTextView({
  doc,
  level = 2,
}: {
  doc: RichDoc;
  level?: Level;
}) {
  return (
    <Box sx={{ "& > :first-of-type": { mt: 0 } }}>
      {doc.content.map(renderNode(level))}
    </Box>
  );
}
const renderNode =
  (level: number) =>
  (node: RichNode, index: number): React.ReactNode => {
    const children = () => node.content?.map(renderNode(level));
    switch (node.type) {
      case "paragraph":
        return (
          <Typography key={index} sx={{ my: 1.5, lineHeight: 1.85 }}>
            {children()}
          </Typography>
        );
      case "heading": {
        const n = Number(node.attrs?.level ?? 2);
        return (
          <Typography
            key={index}
            variant={n === 2 ? "h5" : n === 3 ? "h6" : "subtitle1"}
            component={tag(level + n - 2)}
            sx={{ mt: 3, mb: 1, fontWeight: 600 }}
          >
            {children()}
          </Typography>
        );
      }
      case "bulletList":
      case "orderedList":
        return (
          <Box
            key={index}
            component={node.type === "bulletList" ? "ul" : "ol"}
            start={
              node.type === "orderedList"
                ? Number(node.attrs?.start ?? 1)
                : undefined
            }
            sx={{ pl: 3, my: 1.5, lineHeight: 1.8, "& p": { my: 0.5 } }}
          >
            {children()}
          </Box>
        );
      case "listItem":
        return <li key={index}>{children()}</li>;
      case "blockquote":
        return (
          <Box
            key={index}
            component="blockquote"
            sx={{
              mx: 0,
              my: 2,
              pl: 2,
              borderLeft: 4,
              borderColor: "secondary.main",
            }}
          >
            {children()}
          </Box>
        );
      case "horizontalRule":
        return (
          <Box
            key={index}
            component="hr"
            sx={{ my: 3, border: 0, borderTop: 1, borderColor: "divider" }}
          />
        );
      case "hardBreak":
        return <br key={index} />;
      case "image":
        return (
          // Uploaded portal images; sizes vary, so CSS keeps them within the column.
          <img
            key={index}
            src={String(node.attrs?.src)}
            alt={String(node.attrs?.alt ?? "")}
            style={{
              maxWidth: "100%",
              height: "auto",
              display: "block",
              margin: "16px 0",
              borderRadius: 8,
            }}
          />
        );
      case "videoEmbed":
        return (
          <Box
            key={index}
            sx={{ my: 2, position: "relative", aspectRatio: "16 / 9" }}
          >
            <iframe
              src={String(node.attrs?.src)}
              title={String(node.attrs?.title || "Video")}
              loading="lazy"
              allow="fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: 0,
                borderRadius: 8,
              }}
            />
          </Box>
        );
      case "text":
        return (
          <Fragment key={index}>
            {(node.marks ?? []).reduceRight<React.ReactNode>(
              (inner, mark) => applyMark(mark, inner),
              node.text,
            )}
          </Fragment>
        );
    }
    return null;
  };
function applyMark(mark: Mark, inner: React.ReactNode) {
  if (mark.type === "bold") return <strong>{inner}</strong>;
  if (mark.type === "italic") return <em>{inner}</em>;
  return (
    <Link href={mark.attrs.href} underline="always">
      {inner}
    </Link>
  );
}
