# Sync, merge and deploy between the two repositories

This is the contributor and agent runbook for keeping shared application code aligned while running demo and beta independently. Keep this guide identical in both repositories. Repository-specific publishing guides retain ownership of their infrastructure details. The [October 29 integration record](repo-sync-2026-10-29.md) is historical evidence, not a substitute for checking current branches and workflows.

## Repositories and release branches

| Repository                                           | Branch          | Purpose and deployment effect                                                                                                                                               |
| ---------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dr-grizz/Continuing-Education` (original)           | `main`          | Canonical shared application development; runs CI, not demo deployment.                                                                                                     |
| Original                                             | `azure-demo`    | Demo release branch. A code push runs CI and can deploy to `cuce-demo` after the schema-approval gate. Documentation-only pushes are currently excluded by CI path filters. |
| `cu-app-portal-repos/continuing-education` (managed) | `main`          | Beta release branch. A push starts the Azure deployment workflow for `app-cuce-beta-cmvjnykp`, including documentation changes. CI is a separate workflow.                  |
| Either                                               | `codex/<topic>` | Review/integration branches. Ordinary branch pushes do not automatically deploy through the current release-branch triggers.                                                |

Preferred flow: shared features enter original `main`, then selected revisions are promoted separately to original `azure-demo` and managed `main`. Shared fixes developed in beta go back through a PR into original `main`. The two sites may intentionally run different revisions. Identical commit IDs or identical repository trees are not the goal.

These statements describe the workflows inspected on October 29, 2026. Recheck workflow triggers, manual dispatches and target identities before each release. A branch name alone is not an access-control boundary.

## What travels and what stays

| Shared application work                                                                                               | Repository-owned deployment work                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Application/server/UI code, credential domain, static assets and relevant tests.                                      | Azure app/resource targets, deployment identities, secrets, database connection values and private runtime storage.       |
| Reviewed Prisma schema and **new** migration files, plus dependencies and resources needed by the feature.            | Managed beta manifest, settings patch, credential-restoration code, pre-start migration wrapper and Azure release checks. |
| Portable packaging fixes, shared runtime helpers and manifest-generation hooks, adapted to each existing entry point. | Original demo workflow, OIDC identity, approved schema hash, operator migration process and demo startup command.         |
| Shared documentation and this runbook.                                                                                | Each repo's `AGENTS.md`, publishing records and environment-specific instructions. Merge relevant guidance deliberately.  |

Some files have both responsibilities: `package.json`/lockfiles, Next.js configuration, CI, migration/runtime guards, `scripts/package-demo.mjs`, `scripts/verify-demo.mjs` and startup helpers. Merge them line by line where needed. Retain managed `npm start` → `scripts/start-production.mjs` and original `npm start` → `scripts/start-demo.mjs`. Never take one side wholesale just because Git reports a conflict—or assume an automatic merge preserved behavior.

Never copy private `.env` files, database URLs, keys, tokens, signing material, learner data or deployment artifacts between repos. Do not reintroduce the original demo deployment job into managed beta. Preserve the exact public, database-independent `/api/health` contract and the portable dependency-link fix.

## 1. Establish scope and a recoverable workspace

1. Read the destination's `AGENTS.md`, this guide and its publishing guide. Verify repository identity with `git remote -v`, branch with `git branch --show-current`, and local state with `git status --short --branch`.
2. Confirm direction, selected source branch/commit and desired target. A request to sync code does not imply deploying both sites, copying live settings or moving both release branches.
3. Fetch each repo. Record full source and destination SHAs and the last integration's source range. Use the recorded import boundary as well as Git ancestry: a previous file-level backport or squash may not share merge ancestry. Do not replay already-imported changes or include a previous reverse sync again.
4. Preserve dirty work. Prefer a new worktree from the destination's fetched `origin/main`; do not reset, discard or automatically stash another contributor's files. A backup ref saves committed history only.
5. Create a distinct integration branch per destination and a backup ref for its baseline. Never prepare the sync directly on either release branch. Replace the date/topic and absolute path in this example before running it from the destination repository:

```sh
git fetch origin
git branch codex/before-sync-YYYY-MM-DD-topic origin/main
git worktree add -b codex/sync-YYYY-MM-DD-topic /absolute/path/to/new-sync-checkout origin/main
```

Remote conventions: managed `origin` (and optional `portal`) points to the managed repo; managed `upstream` points to `https://github.com/dr-grizz/Continuing-Education.git`. In the original repo, `origin` points to the original and an optional `beta` remote can point to `https://github.com/cu-app-portal-repos/continuing-education.git`. Inspect existing URLs before adding a missing remote; never overwrite a remote to make a command work. Remotes share history, not live environment settings.

## 2. Integrate in the correct direction

### Original → managed beta

Fetch the approved original ref through `upstream`. Review its commits and changed files before starting a merge. In a clean integration worktree, an uncommitted merge allows inspection and conflict resolution before the owner approves the commit:

```sh
git fetch upstream main
git log --oneline HEAD..upstream/main
git merge --no-commit --no-ff upstream/main
```

Resolve deployment/shared-file conflicts against the managed baseline. Retain beta-only features as well as original additions. Inspect the complete resulting diff against the recorded destination baseline, including files merged automatically. Preserve the upstream merge parent when the integration uses a merge; prefer a GitHub merge commit for this PR so future imports retain ancestry. If repository policy requires squashing, record the complete imported source range explicitly.

### Managed beta → original

Review beta commits since the last recorded backport and identify the shared fixes with their dependencies. Backport shared-only commits with `git cherry-pick --no-commit` after reviewing their content. For mixed application/deployment commits, prepare a three-way patch limited to reviewed shared changes, or merge the needed hunks manually. Record source SHAs and excluded deployment changes. Do not merge the whole managed branch into original `main` and try to clean up infrastructure afterward. Do not overwrite whole application directories from another checkout.

Preserve original's demo workflow and schema-approval gate. Shared setup/System Info code can exist in original without enabling setup on demo: setup remains limited to its explicitly configured beta profile. Adding beta capabilities to code is not authorization to activate their environment settings.

### When syncing both ways

First combine original improvements with beta's shared fixes in an integration worktree. Backport only the missing shared changes into a separate original integration branch. Compare intended shared files in both prepared trees; investigate differences rather than forcing whole-repo equality. Build/package each repository separately because startup commands and deployment packaging differ. Coordinate the two PRs and record any ordering dependency; do not claim remote repos are synced while changes remain local or unmerged.

Prefer landing the original-repo shared-code PR first, then fetching that resulting original `main` commit into the beta integration branch before its final review. Resolve any overlap, record the new source SHA and rerun affected checks. This gives later imports a clear shared baseline. If an urgent beta fix must ship first, record that exception and complete its original-repo backport afterward; do not silently make beta the long-term development source.

## 3. Reconcile migrations without rewriting history

- Inventory complete migration directory names and checksums in both histories. Never edit, rename, renumber or remove an already-applied migration to make the sequences look tidy.
- Distinct existing names such as `025_bootstrap_setup` and `025_individual_progress_cohorts` can coexist; matching numeric prefixes do not make them duplicates. They still need dependency/order and upgrade testing. Choose collision-free names for future migrations before either environment applies them.
- Test fresh installation, repeat startup and upgrades from **both** pre-sync histories. Verify existing records and applied migration IDs/checksums/timestamps are unchanged, and compare final schema with Prisma. Existing migration tests include the October 29 histories; adapt fixtures as the baselines evolve.
- A destructive or incompatible migration needs a reviewed rollout/backup plan before release. Code rollback does not undo schema changes. Do not reset a database or alter recorded checksums to pass CI.

## 4. Validate each prepared repository

Use Node 24, Docker for disposable PostgreSQL, and compatible Python 3.12 with the pinned `badge-service/certificate-renderer/requirements.txt`. Local domain tests also inspect PDFs with `pypdf`; use an existing test runtime with it installed. Set `DEMO_PYTHON_DIRECTORY` to the prepared portable runtime before packaging. Never point test commands at either live database.

Run in each destination with an isolated synthetic local environment:

```sh
npm ci
npm run typecheck
npm run test:migrations
npm run test:bootstrap
npm run test:hosting
npm run test:security
npm run format:check
git diff --check
npm run build
```

Also run tests relevant to the imported features, including authentication, progress and credential integration where affected. Package and exercise **each** real release:

| Destination   | Package verification                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed beta  | `python3 -m unittest discover -s tests -p 'azure_beta_settings_test.py'`, then `npm run package:azure`, `npm run check:release`, `npm run test:release`. |
| Original/demo | `npm run package:demo`, then `npm run verify:demo` and `npm run verify:demo -- --badges`; run `node --test tests/release-links.test.mjs`.                |

Packagers refuse existing demo output and beta packaging recreates its fixed generated `release/` directory. Preserve any needed generated artifacts before a rerun; never delete arbitrary paths or private credential data. Smoke tests share fixed local ports, so run the two packaged verifiers sequentially. Copying release symlinks must preserve relative targets; tests must not accidentally resolve dependencies back into the build checkout.

For UI changes, run affected accessibility tests, keyboard/focus/reflow checks and manual screen-reader review under the README checklist. Report every gap rather than treating automated scans as certification. Clean up only the disposable databases, containers and services created for the validation; preserve review worktrees until their changes are safely saved.

## 5. Review, commit, push and create PRs

Before committing, present the scope, deployment-file adaptations, test results, migration implications and remaining gaps. **Agents must obtain the owner's approval before commits or pushes.** Approval to commit/push integration branches does not authorize merging PRs, advancing `azure-demo`, modifying live settings or applying live migrations.

After approval, commit intended files only and push the named integration branch to that repository's `origin`. Create one PR per destination, each targeting its own `main`. Verify repository/base/head explicitly and follow any PR template. Attach created PRs to the Codex chat when working in Codex.

Each PR should state:

- Source and destination repositories, baseline SHAs, imported source range and direction.
- The application behavior gained, deployment-owned files retained and any shared-file adaptation.
- New migrations, compatibility/rollout requirements, tests actually run and remaining live/accessibility checks.
- The related PR in the other repo, any merge order dependency and the deployment effect of merging this PR.

Wait for remote checks on each PR. Re-fetch destination `main` before merging; integrate and revalidate material changes rather than force-pushing over other work. Confirm branch protections/required reviews in GitHub; this guide does not configure them. Obtain separate authorization for the concrete merge/release action.

## 6. Release beta and demo separately

### Beta release

1. Merge the approved managed PR into managed `main` only when beta deployment is authorized. This push starts deployment, including for documentation changes. A manual dispatch is also a deployment action.
2. Follow the intended commit's **Deploy to Azure App Service** run and its separate CI run. Deployment currently performs its own package/settings/smoke gates; it does not wait for the separate CI workflow. Arrange review/CI completion before merge.
3. Retain Node/portable Python builds, serialized deployment, secret restoration/readback, nonsecret settings rollback and pre-start migration checks. Pending beta migrations apply inside Azure before services start; no GitHub connection to the live database is needed.
4. Verify the live revision, public health and affected workflows from an authorized network/session. Type `/system-info` for migration/table results. Do not enable/reopen setup for diagnostics; use existing authorized access. Health alone does not establish database readiness.

### Demo release

1. Merge the approved original PR into original `main`. This alone does not deploy demo.
2. Select the exact tested original revision for demo. Review its difference from current `azure-demo` and prepare a separate promotion PR into `azure-demo` (or an explicitly authorized branch advance). Do not sync from managed beta directly into this deployment branch.
3. Before promotion, review migration differences and the original guide at `docs/hosting/azure-demo-cd.md`. An authorized operator backs up the demo database, applies compatible migrations using the approved direct connection and verifies recorded names/checksums. Then attest the reviewed migration set with `AZURE_DEMO_SCHEMA_HASH`. Computing/updating that hash does not itself migrate or verify a database; never change it merely to bypass a failure. Coordinate any incompatible migration with the running demo code.
4. Obtain promotion/deployment authorization, then merge/advance `azure-demo`. A qualifying push runs CI and the branch-bound demo deploy job. It retains the original demo target, identity, F1 constraint and prebuilt runtime; no beta settings/secrets are copied.
5. Verify the intended deployment SHA and affected flows on the allowed network. If System Info is unavailable in demo's auth/profile, use its established authenticated SCM revision/startup checks and read-only database verification; do not enable beta setup or weaken audience access just to inspect it.

The beta and demo databases, credentials and persistent signing/encryption files remain separate. Their live schema state must be verified independently. Neither environment's successful deployment proves the other is ready.

## 7. Close out or recover

Record PR links, merge SHAs, workflow URLs, deployed revisions, migration verification, checks performed and outstanding follow-up in the integration record. Identify partial outcomes precisely: local preparation, pushed branch, open PR, merged code and verified deployment are different states. Update both copies of this runbook if the process changes.

On failure, stop promotion to the other site and inspect the failing stage. `runtime_load` is a module/runtime failure, not proof that migrations need rerunning. Use safe in-app diagnostics and private runtime logs; never paste credentials or full settings into reports. For an authorized rollback, choose a retained known-good artifact/revision and review compatibility with the current schema first. Preserve signing keys, `AUTH_SECRET`, database values and runtime storage. Beta's nonsecret settings rollback artifact lasts seven days; original demo release artifacts currently last fourteen days. Retain important recovery artifacts privately before expiry.

If abandoning an uncommitted merge, `git merge --abort` is appropriate only in the isolated integration worktree after preserving any new review work. Never reset a shared checkout or discard another contributor's edits. Keep incomplete work recoverable and state the exact remaining action.
