import { safeCourseImageUrl } from "../domain/course-images";

export type CanvasCourse = {
  id: string;
  account_id: string;
  name: string;
  course_code: string;
  workflow_state: string;
  start_at: string | null;
  end_at: string | null;
  url: string;
  image_url?: string | null;
};
export class CanvasReadError extends Error {
  constructor(
    public readonly code:
      "authorization" | "permission" | "unavailable" | "invalid",
  ) {
    super(
      {
        authorization:
          "Canvas authorization expired or was revoked. Sign in again.",
        permission:
          "Your Canvas account cannot read the selected subaccount. Check Canvas permissions and developer-key scopes.",
        unavailable:
          "Canvas could not complete the course read. The previous preview was retained.",
        invalid:
          "Canvas returned an incomplete or unexpected course response. The previous preview was retained.",
      }[code],
    );
  }
}
export function canvasId(value: unknown): string {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new CanvasReadError("invalid");
  if (
    !(typeof value === "string" || typeof value === "number") ||
    !/^[1-9][0-9]{0,19}$/.test(String(value))
  )
    throw new CanvasReadError("invalid");
  return String(value);
}
export class CanvasCourseClient {
  constructor(
    private readonly origin: string,
    private readonly userAgent: string,
    private readonly token: (forceRefresh: boolean) => Promise<string>,
    private readonly signal: AbortSignal,
    private readonly request: typeof fetch = fetch,
    private readonly delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  private destination(value: string, path: string) {
    const url = new URL(value, this.origin);
    if (
      url.origin !== this.origin ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== path
    )
      throw new CanvasReadError("invalid");
    return url;
  }
  private async read(url: URL) {
    let refreshed = false;
    let forceNextRefresh = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      this.signal.throwIfAborted();
      let response: Response;
      try {
        const accessToken = await this.token(forceNextRefresh);
        forceNextRefresh = false;
        response = await this.request(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": this.userAgent,
            Accept: "application/json",
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([this.signal, AbortSignal.timeout(10_000)]),
        });
      } catch (error) {
        if (error instanceof CanvasReadError) throw error;
        if (attempt === 3 || this.signal.aborted)
          throw new CanvasReadError("unavailable");
        await this.delay(500 * (attempt + 1));
        continue;
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        forceNextRefresh = true;
        await response.body?.cancel();
        continue;
      }
      // Canvas may report throttling as a 403 with this specific error body.
      let body = "";
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > 8_000_000) {
              await reader.cancel();
              throw new CanvasReadError("invalid");
            }
            chunks.push(part.value);
          }
        } catch (error) {
          if (error instanceof CanvasReadError) throw error;
          throw new CanvasReadError("unavailable");
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      const throttled =
        response.status === 429 ||
        (response.status === 403 &&
          /RateLimitExceeded|rate limit exceeded/i.test(body));
      if (throttled || [502, 503, 504].includes(response.status)) {
        if (attempt === 3) throw new CanvasReadError("unavailable");
        const retry = Number(response.headers.get("retry-after"));
        await this.delay(
          Math.min(
            10_000,
            Math.max(
              500 * (attempt + 1),
              Number.isFinite(retry) ? retry * 1000 : 0,
            ),
          ),
        );
        continue;
      }
      if (response.status === 401) throw new CanvasReadError("authorization");
      if (response.status === 403 || response.status === 404)
        throw new CanvasReadError("permission");
      if (!response.ok) throw new CanvasReadError("unavailable");
      let data: any;
      try {
        data = JSON.parse(body);
      } catch {
        throw new CanvasReadError("invalid");
      }
      return { data, link: response.headers.get("link") || "" };
    }
    throw new CanvasReadError("unavailable");
  }
  private async *pages(
    path: string,
    query: Record<string, string> = {},
    pageLimit = 1000,
  ): AsyncGenerator<any> {
    let next: URL | null = this.destination(path, path);
    next.search = new URLSearchParams({ per_page: "100", ...query }).toString();
    const visited = new Set<string>();
    while (next) {
      // Retain requested fields and publication filtering on every page.
      for (const [key, value] of Object.entries(query))
        next.searchParams.set(key, value);
      if (visited.has(next.href) || visited.size >= pageLimit)
        throw new CanvasReadError("invalid");
      visited.add(next.href);
      const { data, link } = await this.read(next);
      if (!Array.isArray(data)) throw new CanvasReadError("invalid");
      for (const value of data) yield value;
      const relations = [
        ...link.matchAll(/<([^>]+)>\s*;\s*rel="?([^";,]+)"?/g),
      ];
      const target = relations.find((match) =>
        match[2].trim().split(/\s+/).includes("next"),
      )?.[1];
      if (/\bnext\b/i.test(link) && !target)
        throw new CanvasReadError("invalid");
      next = target ? this.destination(target, path) : null;
    }
  }
  async lookupStaff(accountId: string, email: string) {
    const matches = new Map<
      string,
      { id: string; name: string; email: string | null; login: string | null }
    >();
    let rows = 0;
    for await (const user of this.pages(
      `/api/v1/accounts/${canvasId(accountId)}/users`,
      { search_term: email, sort: "id", order: "asc" },
      10,
    )) {
      if (++rows > 1000) throw new CanvasReadError("invalid");
      const normalize = (value: unknown) =>
        typeof value === "string" ? value.trim().toLowerCase() : "";
      if (
        normalize(user?.email) !== email &&
        normalize(user?.login_id) !== email
      )
        continue;
      const id = canvasId(user.id);
      if (
        typeof user.name !== "string" ||
        !user.name.trim() ||
        user.name.length > 200
      )
        throw new CanvasReadError("invalid");
      matches.set(id, {
        id,
        name: user.name.trim(),
        email: typeof user.email === "string" ? user.email.slice(0, 254) : null,
        login:
          typeof user.login_id === "string"
            ? user.login_id.slice(0, 254)
            : null,
      });
    }
    return [...matches.values()];
  }
  async discover(accountId: string, nested: boolean): Promise<CanvasCourse[]> {
    const accountPath = `/api/v1/accounts/${canvasId(accountId)}`;
    const account = (
      await this.read(this.destination(accountPath, accountPath))
    ).data;
    if (canvasId(account?.id) !== accountId)
      throw new CanvasReadError("invalid");
    const allowed = new Set([accountId]);
    // Account course listings include descendants. Verify each distinct account's
    // ancestry using the already-authorized account-details endpoint.
    const parents = new Map<string, string | null>();
    const verifyDescendant = async (id: string) => {
      const visited = new Set<string>();
      let current: string | null = id;
      while (current && !allowed.has(current)) {
        if (
          visited.has(current) ||
          visited.size >= 100 ||
          parents.size >= 10000
        )
          throw new CanvasReadError("invalid");
        visited.add(current);
        if (!parents.has(current)) {
          const path = `/api/v1/accounts/${current}`;
          const child = (await this.read(this.destination(path, path))).data;
          if (canvasId(child?.id) !== current)
            throw new CanvasReadError("invalid");
          parents.set(
            current,
            child.parent_account_id == null
              ? null
              : canvasId(child.parent_account_id),
          );
        }
        current = parents.get(current)!;
      }
      if (!current) throw new CanvasReadError("invalid");
      for (const verified of visited) allowed.add(verified);
    };
    const courses = new Map<string, CanvasCourse>();
    for await (const course of this.pages(`${accountPath}/courses`, {
      published: "true",
      "include[]": "course_image",
    })) {
      const actualAccount = canvasId(course.account_id);
      // The account endpoint can include descendants. Direct-only reads filter them.
      if (!allowed.has(actualAccount)) {
        if (!nested) continue;
        await verifyDescendant(actualAccount);
      }
      const id = canvasId(course.id);
      if (
        typeof course.name !== "string" ||
        !course.name.trim() ||
        typeof course.workflow_state !== "string"
      )
        throw new CanvasReadError("invalid");
      // Published concluded courses remain visible for staff review.
      if (!["available", "completed"].includes(course.workflow_state))
        throw new CanvasReadError("invalid");
      const date = (value: unknown) => {
        if (value == null) return null;
        if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
          throw new CanvasReadError("invalid");
        return value;
      };
      const result = {
        id,
        account_id: actualAccount,
        name: course.name.slice(0, 1000),
        course_code:
          typeof course.course_code === "string"
            ? course.course_code.slice(0, 1000)
            : "",
        workflow_state: course.workflow_state,
        start_at: date(course.start_at),
        end_at: date(course.end_at),
        url: `${this.origin}/courses/${id}`,
        image_url: safeCourseImageUrl(course.image_download_url, this.origin),
      };
      if (
        courses.has(id) &&
        JSON.stringify(courses.get(id)) !== JSON.stringify(result)
      )
        throw new CanvasReadError("invalid");
      courses.set(id, result);
      if (courses.size > 10000) throw new CanvasReadError("invalid");
    }
    return [...courses.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }
}
