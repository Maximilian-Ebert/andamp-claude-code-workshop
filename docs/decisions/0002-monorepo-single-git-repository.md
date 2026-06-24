---
status: accepted
date: 2026-05-28
deciders: project team
---

# 2. Monorepo in a single git repository

## Context and Problem Statement

The project spans documentation, infrastructure (CDK), backend functions, and a
web frontend. How should these be organized across git repositories?

## Decision Drivers

- Ability to make atomic, cross-cutting changes (e.g. a function + its infra).
- Simplicity for a small team — one place to clone, review, and version.
- Shared conventions and a single history.

## Considered Options

- Single git repository (monorepo) containing all areas.
- Multiple repositories (polyrepo), one per area.
- Nested git repositories per area inside one directory.

## Decision Outcome

Chosen option: **single git repository (monorepo)**, with top-level folders
`docs/`, `web-app/`, `functions/`, and `infrastructure/`.

### Consequences

- Good, because cross-area changes land in one atomic commit / PR.
- Good, because there is one history and one place to clone and review.
- Neutral, because each area still manages its own dependencies and (for
  `functions/`) its own package manager; there is no repo-wide build orchestration yet.
- Operational note: the CDK and Astro scaffolders try to run `git init` in their
  subfolders. We initialize the root repository first so no nested `.git` repos
  are created.

## Pros and Cons of the Options

### Single repository (chosen)

- Good, because atomic cross-area changes and a unified history.
- Good, because lower overhead for a small team.
- Bad, because the repo grows; tooling must scope itself to subfolders.

### Multiple repositories (polyrepo)

- Good, because strong isolation and independent release cadence.
- Bad, because cross-area changes require coordinated PRs across repos.
- **Dropped.**

### Nested git repositories

- Bad, because submodule/nested-repo workflows are error-prone and confusing.
- **Dropped.**
