---
status: accepted
date: 2026-05-28
deciders: project team
---

# 1. Application stack: Astro on AWS

## Context and Problem Statement

We are starting the `time-tracking-app` project and need to choose the
application stack (web framework plus its supporting backend approach). The whole
company runs on AWS, so every option had to be deployable on AWS.

How should we build and host the application so that it is safe to operate,
stable, and maintainable by the developers we actually have?

## Decision Drivers

- **Security / supply-chain safety** — minimize exposure to compromised packages.
- **Stability / maturity** — avoid bleeding-edge tooling for a foundational choice.
- **Team expertise** — it must be buildable by developers available to this project.

## Considered Options

- Next.js with OpenNext (on AWS)
- Astro (on AWS)
- Angular with a Java/Kotlin backend (on AWS)

## Decision Outcome

Chosen option: **Astro (on AWS)**, because it best satisfies our primary driver —
safety — while remaining stable and approachable for the team.

### Consequences

- Good, because Astro ships minimal client-side JavaScript and has a smaller
  dependency / supply-chain surface than a full React meta-framework.
- Good, because it is stable and well-understood, avoiding bleeding-edge risk.
- Neutral, because heavy dynamic/interactive needs may later require adding an
  islands framework or pushing logic into Lambda functions (`functions/`).
- Bad, because we give up the larger ecosystem and built-in SSR conveniences of
  Next.js.

## Pros and Cons of the Options

### Next.js with OpenNext

- Good, because it is a full-featured React SSR framework with a large ecosystem.
- Bad, because OpenNext (the AWS deployment adapter) was judged too bleeding-edge
  and unstable for a foundational dependency.
- Bad, because recent supply-chain attacks in the JS/React ecosystem pushed the
  operational risk beyond our tolerance.
- **Dropped.**

### Astro (chosen)

- Good, because of safety: minimal shipped JS and a smaller supply-chain surface.
- Good, because it is stable and content-first, fitting our needs.
- Bad, because it is less suited to highly dynamic application UIs out of the box.
- **Picked.**

### Angular with a Java/Kotlin backend

- Good, because it is a robust, strongly-typed enterprise stack.
- Bad, because we have no developers with experience in this stack available for
  this project.
- **Dropped.**

## More Information

All three options were AWS-deployable by requirement; the company standardizes on
AWS. Dynamic/server-side needs are handled by `functions/` (see
[ADR 0004](0004-pnpm-workspace-and-path-aliases-for-functions.md)).
