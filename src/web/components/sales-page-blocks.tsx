"use client";
import { Box, Paper, Typography } from "@mui/material";

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
  seo: { title: string; description: string };
};

export const blockLabels: Record<Block["type"], string> = {
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
