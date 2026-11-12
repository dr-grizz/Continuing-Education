# Reusable repository-sync prompt

Copy the prompt below into a new chat. It applies to future syncs without depending on fixed branch names or PR numbers. Full procedure: [sync, merge and deployment runbook](repository-sync.md).

```text
Sync shared application changes between dr-grizz/Continuing-Education and cu-app-portal-repos/continuing-education in both directions.

Read each repo’s AGENTS.md and docs/repository-sync.md first. Inspect current branches, open PRs, and the previous sync record so you don’t repeat work. Continue a relevant existing integration when appropriate instead of creating duplicate branches or PRs.

Preserve each repo’s deployment settings, workflows, identities, secrets, startup behavior, and migration safeguards. Preserve existing local work. Use separate integration branches and review shared-file conflicts carefully.

Run the required builds, migration-upgrade tests, packaged smoke tests, and affected accessibility checks. Document source commits, changes, results, and remaining gaps.

Present the prepared changes and ask before committing or pushing. After approval, create cross-linked PRs into each repo’s main. Follow the runbook’s merge order. Do not merge, advance azure-demo, deploy, or change live databases/settings without separate authorization.
```
