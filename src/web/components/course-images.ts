import { safeCourseImageUrl } from "../../domain/course-images";

export const CU_CE_IMAGE = "/brand/cedarville-continuing-education-white.png";

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

// Imported courses use their Canvas cover, independently of portal category.
// Keep the existing photos for manually created and seeded prototype offerings.
export function courseImage(offering: {
  id: string;
  category: string;
  imported_from_canvas?: boolean;
  canvas_image_url?: string | null;
  image_override?: boolean;
  image_media_id?: string | null;
}) {
  if (offering.image_override) {
    const mediaId = offering.image_media_id;
    return mediaId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        mediaId,
      )
      ? `/media/${mediaId}`
      : CU_CE_IMAGE;
  }
  const source = safeCourseImageUrl(offering.canvas_image_url);
  if (source) return source;
  if (offering.imported_from_canvas) return CU_CE_IMAGE;
  const cover =
    covers[offering.id] ??
    categoryCovers[offering.category] ??
    "workplace-technology";
  return `/course-images/${cover}-hd.jpg`;
}
