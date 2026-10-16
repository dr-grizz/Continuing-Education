// Course covers may be public/signed Canvas file URLs or external HTTPS images.
// Never put OAuth credentials in browser image requests. Images are loaded by
// the browser directly, not fetched through the server's image optimizer.
export function safeCourseImageUrl(
  value: unknown,
  origin?: string,
): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    return null;
  try {
    const url = new URL(value, origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !url.hostname.includes(".") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.startsWith("[") ||
      /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname) ||
      [...url.searchParams.keys()].some((key) =>
        ["access_token", "refresh_token", "client_secret"].includes(
          key.toLowerCase(),
        ),
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
