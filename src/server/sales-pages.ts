import { BadRequestException } from "@nestjs/common";
// Sales page blocks (decision F2). Pages are structured data, never HTML: text is
// rendered as plain text, so nothing a content editor types can run as markup.
// Prices, dates and seats always come from the offering, never from page text.
// Drafts may be incomplete; `publishProblems` lists what must be fixed to publish.

export const heroImages = [
  "data-analysis",
  "leadership",
  "healthcare",
  "biblical-study",
  "workplace-technology",
] as const;

export type HeroBlock = {
  type: "hero";
  image: (typeof heroImages)[number];
  /** Decorative images need no alternative text; informative ones must have it. */
  decorative: boolean;
  alt: string;
  tagline: string;
};
export type TextBlock = { type: "text"; heading: string; body: string };
/** Lists the offering's own learning outcomes, so they cannot drift. */
export type OutcomesBlock = { type: "outcomes"; heading: string };
export type InstructorBlock = {
  type: "instructor";
  heading: string;
  name: string;
  role: string;
  bio: string;
};
export type TestimonialBlock = {
  type: "testimonial";
  quote: string;
  name: string;
  role: string;
  /** Staff confirm the person agreed to be quoted; required to publish. Never shown to learners. */
  consent: boolean;
  consentNote: string;
};
export type FaqBlock = {
  type: "faq";
  heading: string;
  items: { question: string; answer: string }[];
};
export type Block =
  | HeroBlock
  | TextBlock
  | OutcomesBlock
  | InstructorBlock
  | TestimonialBlock
  | FaqBlock;
export type SalesPage = {
  blocks: Block[];
  /** Browser tab title; blank uses the course title. */
  seo: { title: string };
};

export const emptySalesPage = (): SalesPage => ({
  blocks: [],
  seo: { title: "" },
});

export const blockLabels: Record<Block["type"], string> = {
  hero: "Hero image",
  text: "Text",
  outcomes: "Learning outcomes",
  instructor: "Instructor",
  testimonial: "Testimonial",
  faq: "Questions and answers",
};

const MAX_BLOCKS = 20;
const MAX_FAQ_ITEMS = 15;

function record(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException(`${where} must be an object.`);
  return value as Record<string, unknown>;
}
function text(
  source: Record<string, unknown>,
  field: string,
  max: number,
  where: string,
): string {
  const value = source[field] ?? "";
  if (typeof value !== "string")
    throw new BadRequestException(`${where}: ${field} must be text.`);
  if (value.length > max)
    throw new BadRequestException(
      `${where}: ${field} must be ${max} characters or fewer.`,
    );
  return value;
}
function flag(source: Record<string, unknown>, field: string, where: string) {
  const value = source[field] ?? false;
  if (typeof value !== "boolean")
    throw new BadRequestException(`${where}: ${field} must be true or false.`);
  return value;
}

/** Checks a page's structure and limits and returns it with only known fields. */
export function parseSalesPage(input: unknown): SalesPage {
  const page = record(input, "Page");
  const seo = record(page.seo ?? {}, "Page title");
  if (!Array.isArray(page.blocks))
    throw new BadRequestException("Page blocks must be a list.");
  if (page.blocks.length > MAX_BLOCKS)
    throw new BadRequestException(
      `A page can have at most ${MAX_BLOCKS} blocks.`,
    );
  const blocks = page.blocks.map((raw, index): Block => {
    const where = `Block ${index + 1}`;
    const b = record(raw, where);
    switch (b.type) {
      case "hero": {
        const image = b.image;
        if (!heroImages.includes(image as HeroBlock["image"]))
          throw new BadRequestException(
            `${where}: choose an image from the library.`,
          );
        return {
          type: "hero",
          image: image as HeroBlock["image"],
          decorative: flag(b, "decorative", where),
          alt: text(b, "alt", 200, where),
          tagline: text(b, "tagline", 200, where),
        };
      }
      case "text":
        return {
          type: "text",
          heading: text(b, "heading", 120, where),
          body: text(b, "body", 5000, where),
        };
      case "outcomes":
        return { type: "outcomes", heading: text(b, "heading", 120, where) };
      case "instructor":
        return {
          type: "instructor",
          heading: text(b, "heading", 120, where),
          name: text(b, "name", 120, where),
          role: text(b, "role", 160, where),
          bio: text(b, "bio", 2000, where),
        };
      case "testimonial":
        return {
          type: "testimonial",
          quote: text(b, "quote", 600, where),
          name: text(b, "name", 120, where),
          role: text(b, "role", 160, where),
          consent: flag(b, "consent", where),
          consentNote: text(b, "consentNote", 300, where),
        };
      case "faq": {
        const items = b.items ?? [];
        if (!Array.isArray(items) || items.length > MAX_FAQ_ITEMS)
          throw new BadRequestException(
            `${where}: list up to ${MAX_FAQ_ITEMS} questions.`,
          );
        return {
          type: "faq",
          heading: text(b, "heading", 120, where),
          items: items.map((item, i) => {
            const q = record(item, `${where}, question ${i + 1}`);
            return {
              question: text(q, "question", 200, `${where}, question ${i + 1}`),
              answer: text(q, "answer", 2000, `${where}, question ${i + 1}`),
            };
          }),
        };
      }
      default:
        throw new BadRequestException(`${where}: unknown block type.`);
    }
  });
  return {
    blocks,
    seo: { title: text(seo, "title", 70, "Page title") },
  };
}

/** What must be fixed before a draft can be published; empty when it is ready. */
export function publishProblems(page: SalesPage): string[] {
  const problems: string[] = [];
  if (!page.blocks.length) problems.push("Add at least one block.");
  const blank = (value: string) => !value.trim();
  page.blocks.forEach((b, index) => {
    const where = `Block ${index + 1} (${blockLabels[b.type]})`;
    const need = (value: string, what: string) => {
      if (blank(value)) problems.push(`${where}: add ${what}.`);
    };
    switch (b.type) {
      case "hero":
        if (index !== 0) problems.push(`${where}: move it to the top.`);
        if (!b.decorative) need(b.alt, "alternative text");
        if (b.decorative && b.alt.trim())
          problems.push(
            `${where}: remove the alternative text, or mark the image as informative.`,
          );
        break;
      case "text":
        need(b.body, "text");
        break;
      case "outcomes":
        need(b.heading, "a heading");
        break;
      case "instructor":
        need(b.name, "the instructor's name");
        need(b.bio, "a short biography");
        break;
      case "testimonial":
        need(b.quote, "the quote");
        need(b.name, "the person's name");
        if (!b.consent)
          problems.push(`${where}: confirm the person agreed to be quoted.`);
        break;
      case "faq":
        need(b.heading, "a heading");
        if (!b.items.length) problems.push(`${where}: add a question.`);
        b.items.forEach((item, i) => {
          if (blank(item.question) || blank(item.answer))
            problems.push(
              `${where}: question ${i + 1} needs both a question and an answer.`,
            );
        });
        break;
    }
  });
  if (page.blocks.filter((b) => b.type === "hero").length > 1)
    problems.push("Use only one hero image.");
  return problems;
}

/** The published page as learners receive it: consent records stay internal. */
export function publicSalesPage(page: SalesPage) {
  return {
    ...page,
    blocks: page.blocks.map((b) =>
      b.type === "testimonial"
        ? { type: b.type, quote: b.quote, name: b.name, role: b.role }
        : b,
    ),
  };
}
