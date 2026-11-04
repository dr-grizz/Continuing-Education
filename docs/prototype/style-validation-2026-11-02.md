# CU website style alignment — November 2, 2026

Scope: shared MUI theme, header, catalog introduction, and credential interface chrome. Existing workflows, CE logo asset, issued credentials, deployment target, and settings are preserved. This is local validation; nothing has been committed, pushed, or deployed.

## Reference and implementation

Inspected the live CU brand page HTML, its [site CSS](https://www.cedarville.edu/ResourcePackages/culayoutv9/assets/dist/css/cedarville-main.min.css?20260901), and its [Adobe font stylesheet](https://use.typekit.net/mdz4tlh.css). The live website uses Proxima Nova for interface text and FF More Web Pro for editorial text, despite the brand guide naming Minion/Myriad. The owner directed the app to match the website after confirming CU font-use approval.

- Load the existing CU Adobe web project through `/brand/typography.css`; no font files are copied or self-hosted. System fallbacks remain available. Continued font delivery depends on the CU-managed Adobe project.
- Use official brand HEX blue #003A63 and gold #FDB813 rather than the provisional palette. Preserve readable dark-mode action colors and semantic status roles.
- Apply bold uppercase page headings, squared buttons with stronger outlined borders, compact surface corners, uppercase primary navigation, and increased logo/header spacing.
- Keep the header blue in dark mode with MUI's `enableColorOnDark` option; visual inspection identified the framework's default dark AppBar override.
- Credential documents receive the same font stylesheet through their build script. Their CSP permits Adobe stylesheet/font hosts explicitly; scripts, connections, framing, form actions, and other restrictions retain their previous boundaries.
- No changes to badge SVG artwork, certificate rendering, frozen awards, or credential data.

## Validation

- `npm run typecheck`: passed.
- `npm run format:check`: passed.
- `npm run build`: passed using bundled Node 24.
- `npm run test:security`: passed.
- `npm run test:hosting`: passed.
- `npm run test:a11y -- --config=/tmp/cu-ce-style.playwright.config.ts --project=light --project=dark --project=phone --grep 'T01 offering visibility|CU learner OAuth|Canvas course connector|Canvas staff sign-in|portal offering image editor'`: 84 passed (28 per layout). The temporary config retained repository settings but disabled database cleanup because only API-mocked groups were selected and no database records were created. This suite ran before the final dark-header option; a rebuilt-browser review and targeted dark-mode rerun cover that correction.
- After the final dark-header correction: production rebuild and format check passed, 4 targeted dark-mode OAuth/accessibility tests passed, and the additional desktop/dark/320px browser checks passed again with an explicit #003A63 header-color assertion in every scheme.
- Browser font inspection: Proxima Nova regular, bold, extra bold and FF More regular loaded successfully from Adobe, with no font request failures.
- Additional Playwright/axe review of a synthetic populated catalog at desktop light, desktop dark, and 320px light: no WCAG A/AA violations in the selected rules; no horizontal page overflow; skip link first in keyboard order and main focus target verified; phone menu opens by keyboard and Escape returns focus; text resizing/spacing, forced-color header treatment, and reduced-motion behavior checked.
- Credential issuer document loaded the Adobe font successfully under its CSP; no browser CSP violations observed.

## Remaining review

Docker Desktop was stopped. Database-backed registration/payment/credential issuance checks were not run; API-mocked browser checks do not establish backend behavior. Firefox, WebKit, live-provider authentication, hosted Azure validation, human screen-reader review, and a full application-wide accessibility audit remain unperformed for this style change. Logo asset provenance and formal Creative Services artwork review remain open. The screenshots use synthetic course data, not a live catalog.

## Transfer to the original demo checkout

At the owner's request, the 17 paths changed in this chat were moved to the original `dr-grizz/Continuing-Education` checkout on branch `azure-demo` (base `fe244dab80df82e62f77fc44fd512c69be5c697b`). Only the reviewed patch was applied, preserving demo-specific code, including its version/revision footer. No beta deployment configuration was imported. The beta checkout was restored to its pre-chat source state, preserving older October 29 documentation and editor settings. Both repository HEADs are unchanged.

Post-transfer checks in the demo checkout: build, typecheck, formatting, security and hosting tests passed; 12 API-mocked OAuth/accessibility checks passed across light/dark/phone. The additional populated-catalog axe, font delivery, keyboard, 320px reflow, text resizing, reduced motion, forced-color and credential CSP checks passed there too. The first standalone typecheck overlapped a build clearing generated Next types; rerunning after the completed build passed. The restored beta production build also passed. Remaining human screen-reader, database-backed and hosted checks above still apply. Nothing was committed, pushed or deployed.

## Owner-supplied Adobe project update

Later on November 2, the owner supplied `https://use.typekit.net/gei7qvn.css`. This supersedes the initial font-project choice above. The shared font loader now uses this embed, Myriad Pro (`myriad-pro`) for the interface, and Minion Pro (`minion-pro`) for the catalog introduction. App and credential headings use the supplied bold weight (700), replacing the previous 800 request. The existing Adobe CSP allowlist supports the new project without changes.

Validation for this update: formatting, type checking, security tests, and `git diff --check` passed. Browser checks confirmed that regular/bold Myriad Pro and regular Minion Pro actually load from Adobe in desktop light, desktop dark, and 320px phone layouts and in the credential issuer document. Catalog axe scans, keyboard skip navigation, phone menu focus return, narrow-screen reflow, 200% text with increased spacing, forced-color header treatment, and reduced-motion checks passed. The issuer document showed no font/style CSP violations. The phone screenshot was visually reviewed. Twelve API-mocked learner OAuth/accessibility tests passed across light, dark, and phone layouts using the existing temporary configuration with database cleanup disabled.

No production build, human screen-reader review, database-backed workflow, cross-browser or hosted deployment checks were performed for this font replacement. Changes remain local, uncommitted and undeployed.

## Course-image background correction

At the owner's request, `CourseCard` image containers now use the shared Cedarville blue (`brand.navy`, #003A63). Card bodies retain their original light/dark surfaces and text/control styling. Photos remain unchanged; the white CE fallback logo sits on the new blue. The initial whole-card treatment was reversed before completing this change.

Formatting and diff checks passed. Browser assertions confirmed blue image backgrounds and unchanged body surfaces in list/grid, desktop light/dark and 320px phone layouts. With a synthetic open offering, axe scans, visible keyboard link focus, skip navigation, phone menu focus return, reflow, enlarged text/spacing, reduced motion and forced-color checks passed. The desktop grid screenshot was visually reviewed. A synthetic closed/approval-required offering produced a color-contrast finding with the original card styling; that status combination needs a separate review. Human screen-reader and full workflow review remain open. The 12 learner OAuth/accessibility tests passed before the image-only correction, not after it. No deployment was performed.

## Pull-request preparation

Final `npm run build`, `npm run format:check`, `npm run test:security`, `npm run test:hosting`, and `git diff --check` passed on `codex/style-update`. The production build includes the final owner-supplied fonts and image-only blue backgrounds. Build ran with the available Node 22.22.3; the repository declares Node 24+ as its supported runtime. This supersedes the earlier statement that no production build was performed for the font replacement. Prior scoped browser results and remaining manual/accessibility gaps above still apply. Changes are being committed and proposed to `main`; this does not deploy or merge them.

After incorporating current `origin/main`, generated credential-page conflicts were resolved by rebuilding from the merged source. The skills explorer now receives the shared font loader too. Production build, formatting, security/hosting tests, diff checks, all 12 scoped learner OAuth/accessibility tests and the list/grid image-background/browser checks passed again on the merged tree. Remaining review gaps noted above still apply.
