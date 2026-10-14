export const canvasCourseTimeZone = "America/New_York";
export type CanvasCourseFilters = {
  title: string;
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
  status: string;
};
export const emptyCanvasCourseFilters: CanvasCourseFilters = {
  title: "",
  startFrom: "",
  startTo: "",
  endFrom: "",
  endTo: "",
  status: "all",
};
export function canvasCourseDay(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: canvasCourseTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}
export function canvasCourseDate(value: string | null): string {
  const day = canvasCourseDay(value);
  return day
    ? `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`
    : "Not set";
}
export function parseCanvasCourseFilters(
  input: Record<string, unknown>,
): CanvasCourseFilters {
  const result = { ...emptyCanvasCourseFilters };
  for (const key of Object.keys(result) as (keyof CanvasCourseFilters)[]) {
    const value = input[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || value.length > 200)
      throw new Error("Invalid course filter.");
    result[key] = value.trim();
  }
  if (!["all", "published", "unpublished", "concluded"].includes(result.status))
    throw new Error("Invalid publish status.");
  for (const key of ["startFrom", "startTo", "endFrom", "endTo"] as const) {
    const value = result[key];
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new Error("Invalid date filter.");
  }
  if (
    (result.startFrom && result.startTo && result.startFrom > result.startTo) ||
    (result.endFrom && result.endTo && result.endFrom > result.endTo)
  )
    throw new Error("The from date must be on or before the to date.");
  return result;
}
export function filterCanvasCourses<
  T extends {
    name: string;
    start_at: string | null;
    end_at: string | null;
    workflow_state: string;
  },
>(courses: T[], filters: CanvasCourseFilters): T[] {
  const keywords = filters.title
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const inRange = (value: string | null, from: string, to: string) => {
    if (!from && !to) return true;
    const day = canvasCourseDay(value);
    return Boolean(day && (!from || day >= from) && (!to || day <= to));
  };
  return courses.filter(
    (course) =>
      keywords.every((word) =>
        course.name.toLocaleLowerCase().includes(word),
      ) &&
      inRange(course.start_at, filters.startFrom, filters.startTo) &&
      inRange(course.end_at, filters.endFrom, filters.endTo) &&
      (filters.status === "all" ||
        (filters.status === "published" &&
          course.workflow_state === "available") ||
        (filters.status === "concluded" &&
          course.workflow_state === "completed") ||
        (filters.status === "unpublished" &&
          ["unpublished", "created", "claimed"].includes(
            course.workflow_state,
          ))),
  );
}
