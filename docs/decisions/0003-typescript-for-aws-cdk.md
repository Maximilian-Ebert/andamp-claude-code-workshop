---
status: accepted
date: 2026-05-28
deciders: project team
---

# 3. TypeScript for the AWS CDK app

## Context and Problem Statement

The AWS CDK supports several languages. We need to pick one for the
`infrastructure/` app. Which language gives us the best fit across the monorepo?

## Decision Drivers

- Unify tooling/language with the rest of the repo where possible.
- Maturity of the CDK ecosystem and examples in the chosen language.
- Low friction for contributors already working in the repo.

## Considered Options

- TypeScript
- Python

## Decision Outcome

Chosen option: **TypeScript**, because it aligns infrastructure with the
TypeScript web app and TypeScript Lambda functions, giving one primary language
across the repo.

### Consequences

- Good, because infra, functions, and web all share TypeScript — easier context-switching.
- Good, because CDK's TypeScript ecosystem and docs are first-class.
- Neutral, because if functions later adopt Python (e.g. for ML/data-processing
  workloads), the CDK app can stay TypeScript regardless.
- Operational note: keep the local `aws-cdk` CLI and `aws-cdk-lib` versions
  compatible — a CLI older than the library causes a cloud-assembly schema
  mismatch on `cdk synth`.

## Pros and Cons of the Options

### TypeScript (chosen)

- Good, because it matches the web app and functions languages.
- Good, because it has the most mature CDK tooling and examples.
- Bad, because none significant for our context.

### Python

- Good, because it would match the language if Lambda functions become Python-heavy.
- Bad, because it would introduce a second language for infrastructure vs. the
  TypeScript web app and functions chosen so far.
- **Dropped.**
