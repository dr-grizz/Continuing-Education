import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Keep the tested pilot editors as isolated documents inside the native portal
// workspace. Rebuild these public assets after changing pilot UI source.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pilot = path.join(root, "badge-service");
const out = path.join(root, "src/web/public/credential-tools");
mkdirSync(out, { recursive: true });
const names = [
  "issuer",
  "publishing",
  "awards",
  "certificates",
  "issuances",
  "my-badges",
  "skills",
];
const links = {
  issuer: "/staff/badges",
  publishing: "/staff/badge-publishing",
  awards: "/staff/badge-awards",
  certificates: "/staff/certificates",
  issuances: "/staff/badge-issuances",
  "my-badges": "/badges",
};
for (const name of names) {
  let html = readFileSync(path.join(pilot, "public", `${name}.html`), "utf8");
  html = html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/, "");
  html = html.replace(
    /(src|href)="\/([a-z-]+\.(?:css|js))"/g,
    '$1="/credential-tools/$2"',
  );
  html = html.replaceAll('data-mode="preview"', 'data-mode="portal"');
  html = html.replaceAll('data-api="/api/', 'data-api="/api/badges/');
  html = html.replace(
    /href="\/(issuer|publishing|awards|certificates|issuances|my-badges)([?"/])/g,
    (_m, key, suffix) => `href="${links[key]}${suffix === "/" ? "" : suffix}"`,
  );
  html = html.replace(
    'href="http://127.0.0.1:9400/my-badges/"',
    'href="/sign-in"',
  );
  html = html.replace(
    "</head>",
    '<link rel="stylesheet" href="/credential-tools/portal-theme.css"><script defer src="/credential-tools/portal-frame.js"></script></head>',
  );
  writeFileSync(path.join(out, `${name}.html`), html);
}
for (const file of [
  "issuer.js",
  "skills-ui.js",
  "skills-explorer.js",
  "skills.css",
  "onet-in-it.svg",
  "issuer.css",
  "publishing.js",
  "publishing.css",
  "issuances.js",
  "issuances.css",
  "badge-artwork.js",
  "awards.js",
  "awards.css",
  "certificates.js",
  "certificate-email.js",
  "distribution.js",
  "distribution.css",
  "certificates.css",
  "my-badges.js",
  "my-badges.css",
]) {
  const shared =
    /^(awards|certificates|certificate-email|distribution|my-badges)\./.test(
      file,
    );
  let contents = readFileSync(
    path.join(pilot, shared ? "portal-bridge/assets" : "public", file),
    "utf8",
  );
  if (file.endsWith(".css"))
    contents = contents.replaceAll(
      "url('/issuer.css')",
      "url('/credential-tools/issuer.css')",
    );
  if (file.endsWith(".js")) {
    contents = contents.replaceAll(
      "'/badge-artwork.js'",
      "'/credential-tools/badge-artwork.js'",
    );
    contents = contents.replaceAll(
      "/skills-ui.js",
      "/credential-tools/skills-ui.js",
    );
    contents = contents.replaceAll(
      "/onet-in-it.svg",
      "/credential-tools/onet-in-it.svg",
    );
    contents = contents.replaceAll("/api/", "/api/badges/");
    for (const [key, value] of Object.entries(links))
      contents = contents
        .replaceAll(`'/${key}?`, `'${value}?`)
        .replaceAll(`'/${key}'`, `'${value}'`);
    // Staff do not impersonate a learner by changing a query parameter.
    contents = contents.replace(
      "actions,result,previewLink,",
      "actions,result,",
    );
  }
  writeFileSync(path.join(out, file), contents);
}
console.log(
  "Credential workspaces and public skills explorer rebuilt from source.",
);
for (const file of [
  "certificate-download.html",
  "certificate-download.js",
  "claim.html",
  "claim.js",
]) {
  writeFileSync(
    path.join(out, file),
    readFileSync(path.join(pilot, "public", file), "utf8"),
  );
}
