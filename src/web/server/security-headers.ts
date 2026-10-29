export const baselineSecurityHeaders = {
  "Content-Security-Policy":
    "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export const credentialSecurityHeaders = {
  ...baselineSecurityHeaders,
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

// Host-only: do not opt unrelated subdomains into HSTS or request preloading.
export const hostedHsts = "max-age=31536000";

export function privateResponsePath(path: string) {
  return /^\/(api|staff|learning|settings|sign-in|setup|system-info)(\/|$)/i.test(
    path,
  );
}

export function responseSecurityHeaders(path: string) {
  const normalized = path.toLowerCase();
  if (
    normalized === "/credential-tools" ||
    normalized.startsWith("/credential-tools/")
  )
    return credentialSecurityHeaders;
  // Do not let the common policy weaken auth routes' no-referrer response.
  return privateResponsePath(path)
    ? { ...baselineSecurityHeaders, "Referrer-Policy": "no-referrer" }
    : baselineSecurityHeaders;
}
