## Agent skills

### Issue tracker

Issues and specs are tracked in this private repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

### Review and testing

Accessibility checks are required for UI changes. Follow the review/test checklist in `README.md`, verify the affected workflows, and report checks performed and any remaining accessibility gaps. Automated scans do not replace keyboard and screen-reader review. Do not create GitHub issues unless the user explicitly asks.

## Shared-code synchronization

This original repository owns the demo deployment. Preserve its existing Azure demo workflow, target, OIDC identity, schema-approval gate and `npm start` command. Shared application code is synchronized with the CU Launch beta repository; use a review branch and test the combined changes. Do not import the beta settings patch, credential-restoration scripts, startup-migration wrapper or CU Launch manifest. Ask before committing or pushing. Follow `docs/repository-sync.md` before imports/backports, PRs or release promotion. The dated `docs/repo-sync-2026-10-29.md` is historical evidence only.
