export type OfferingReadiness = {
  title: string;
  category: string;
  summary: string;
  description: string;
  format: string;
  price_cents: number | null;
  capacity: number | null;
  unlimited_seats?: boolean;
  course_type: string | null;
  start_date: string | Date | null;
  end_date: string | Date | null;
};
export function missingOfferingInfo(o: OfferingReadiness): string[] {
  const missing: string[] = [];
  const valid = (value: string, min: number, max: number) =>
    value.trim().length >= min && value.trim().length <= max;
  if (!valid(o.title, 3, 120)) missing.push("Course title (3–120 characters)");
  if (
    !["Technology", "Leadership", "Healthcare", "Ministry"].includes(o.category)
  )
    missing.push("Topic");
  if (!valid(o.summary, 10, 240))
    missing.push("Short summary (10–240 characters)");
  if (!valid(o.description, 20, 4000))
    missing.push("Description (20–4,000 characters)");
  if (!valid(o.format, 3, 100)) missing.push("Format");
  if (
    o.price_cents === null ||
    !Number.isInteger(o.price_cents) ||
    o.price_cents < 0 ||
    o.price_cents > 1000000
  )
    missing.push("Price");
  if (
    o.unlimited_seats
      ? o.capacity !== null
      : o.capacity === null ||
        !Number.isInteger(o.capacity) ||
        o.capacity < 1 ||
        o.capacity > 10000
  )
    missing.push("Seat capacity");
  if (!["cohort", "self_paced"].includes(o.course_type || ""))
    missing.push("Course type");
  if (o.course_type === "cohort") {
    if (!o.start_date) missing.push("Start date");
    if (!o.end_date) missing.push("End date");
    if (
      o.start_date &&
      o.end_date &&
      new Date(o.end_date) < new Date(o.start_date)
    )
      missing.push("End date on or after start date");
  }
  return missing;
}
