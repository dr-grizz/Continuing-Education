# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`CONTEXT-MAP.md`** at the repo root if it exists.
- **`docs/adr/`** for decisions touching the area being changed.

If these files don't exist, proceed silently. The `/domain-modeling` skill creates them lazily as terms and decisions are resolved.

## File structure

This repository uses the single-context layout:

/
├── CONTEXT.md
├── docs/adr/
└── src/

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md`. If a needed concept is absent, reconsider whether it belongs or note the gap for `/domain-modeling`.

## Flag ADR conflicts

Surface any conflict with an existing ADR explicitly instead of silently overriding it.
