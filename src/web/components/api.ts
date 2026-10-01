export type Offering = {
  id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  outcomes: string[];
  format: string;
  course_type: "cohort" | "self_paced";
  start_date: string | null;
  end_date: string | null;
  price_cents: number;
  capacity: number;
  seats_available: number;
  approval_required: boolean;
  published: boolean;
  version: number;
};
export type Learning = {
  id: string;
  offering_id: string;
  title: string;
  category: string;
  format: string;
  price_cents: number;
  course_type: "cohort" | "self_paced";
  start_date: string | null;
  end_date: string | null;
  status: string;
  stage?: string;
  operation_status?: string;
  reserved_until?: string;
  created_at?: string;
};
export async function api<T>(
  path: string,
  options: { role?: "learner" | "staff"; body?: unknown; key?: string } = {},
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: options.body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-prototype-role": options.role || "learner",
      ...(options.body
        ? { "Idempotency-Key": options.key || crypto.randomUUID() }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(". ")
        : data.message || "Request failed.",
    );
  return data;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const date = (value: string | null) =>
  value === null
    ? "Not scheduled"
    : new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

export const courseSchedule = (
  course: Pick<Offering, "course_type" | "start_date" | "end_date">,
) =>
  course.course_type === "self_paced"
    ? "Start anytime"
    : `${date(course.start_date)} – ${date(course.end_date)}`;
export const courseStart = (
  course: Pick<Offering, "course_type" | "start_date">,
) =>
  course.course_type === "self_paced"
    ? "Start anytime"
    : `Starts ${date(course.start_date)}`;
export const courseTypeLabel = (course: Pick<Offering, "course_type">) =>
  course.course_type === "self_paced" ? "Self-paced" : "Scheduled";

export const courseFormatLabel = (
  course: Pick<Offering, "course_type" | "format">,
) => {
  const format = course.format
    .split("·")
    .map((part) => part.trim())
    .filter(
      (part) =>
        !["self-paced", "learn on your own", "cohort", "scheduled"].includes(
          part.toLowerCase(),
        ),
    )
    .join(" · ");
  return [courseTypeLabel(course), format].filter(Boolean).join(" · ");
};
