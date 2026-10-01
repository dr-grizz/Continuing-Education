import type { Offering } from "./api";

const covers: Record<string, string> = {
  "10000000-0000-4000-8000-000000000001": "data-analysis",
  "10000000-0000-4000-8000-000000000002": "leadership",
  "10000000-0000-4000-8000-000000000003": "healthcare",
  "10000000-0000-4000-8000-000000000004": "biblical-study",
  "10000000-0000-4000-8000-000000000005": "workplace-technology",
};

const categoryCovers: Record<string, string> = {
  Technology: "workplace-technology",
  Leadership: "leadership",
  Healthcare: "healthcare",
  Ministry: "biblical-study",
};

// Local prototype covers; newly created courses use their category's photo.
export function courseImage(offering: Pick<Offering, "id" | "category">) {
  const cover =
    covers[offering.id] ??
    categoryCovers[offering.category] ??
    "workplace-technology";
  return `/course-images/${cover}-hd.jpg`;
}
