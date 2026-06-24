---
status: accepted
date: 2026-06-13
deciders: project team
---

# 8. Hand-rolled email + password auth with JWT sessions

## Context and Problem Statement

We need user authentication for a **small, invite-only set of internal users** —
provisioned by an admin, not the public. The auth requirements have been **scoped down**:
the previously anticipated **2FA via TOTP**, **passkeys (WebAuthn)**, and **public
self-sign-up** are no longer in scope. A security review concluded that, for this user
base and risk tier, **email + password over TLS with a signed session cookie** is sufficient.

That change undercuts the prior decision to use **Amazon Cognito**. Our whole local story
is that the *same* CDK stack deploys to **LocalStack Community** and stays offline and
hermetic ([ADR 0006](0006-localstack-dev-and-function-url-ssr.md),
[ADR 0007](0007-rest-api-gateway-front.md)). But Cognito is a **LocalStack paid-tier
feature**, which forced a hybrid: a dev-only `cognito-local` sidecar plus a real free-tier
pool. That machinery existed almost entirely to buy managed MFA/passkeys and a hosted UI —
and with those descoped, it is pure cost (a second container, two auth endpoints, a
documented `UserPool` stack exception).

With only email + password to support, how do we authenticate users and carry a session
while keeping the local loop **offline, free, and hermetic** and our dependency surface
minimal?

## Decision Drivers

- Auth for a **small, admin-provisioned internal user base** — no public self-sign-up.
- **No** second-factor or passkey requirement (descoped).
- Keep the local loop **offline, free, and hermetic** — one CDK stack, LocalStack Community
  only, no paid-tier gap, no dev-only sidecar.
- Minimise dependencies and supply-chain surface.
- Reuse what we already run: the DynamoDB user table.

## Considered Options

- **Keep Cognito + cognito-local hybrid** — managed IdP, but paid-tier locally, a second
  container, two endpoints, and a documented stack exception.
- **Third-party hosted IdP** (Auth0/Clerk/…) — managed flows, but a per-run cloud
  dependency that breaks the hermetic local loop.
- **Self-hosted IdP** (Keycloak) — full-featured, but a heavy extra service for a handful
  of users.
- **Hand-rolled email + password on DynamoDB** — store users in the existing table, hash
  with Node's built-in `scrypt`, carry the session in a signed cookie. No new service.

For the **session mechanism** specifically, two sub-options:

- **Opaque, server-side session records in DynamoDB** — a random token in the cookie, a
  `SESSION#<tokenHash>` item looked up on every request. Instantly revocable, but every
  authenticated request hits DynamoDB and we own a session table + TTL eviction.
- **Stateless signed JWT in the cookie** — an HS256 token the SSR Lambda verifies with a
  signing key; no per-request datastore read.

## Decision Outcome

**Hand-roll email + password auth backed by our existing DynamoDB table, with a stateless
JWT session cookie.** No managed auth service, no second container, no third-party IdP.

- **Users** are items in a dedicated DynamoDB `UserTable` (partition key `email`,
  lowercased), created by an admin or a dev seed step. There is no public self-sign-up.
- **Password hashing:** a 16-byte random per-user salt (`crypto.randomBytes`) and
  `crypto.scrypt(password, salt, 64)`, stored as a combined `salt:hash` hex string;
  verification with `crypto.timingSafeEqual`. No external hashing library.
- **Sessions:** on successful login the SSR Lambda issues an **HS256 JWT** (subject = email,
  `name` claim, 7-day expiry) via the **`jose`** library and sets it as an `HttpOnly`,
  `SameSite=Lax` cookie (`Secure` everywhere except local HTTP). Astro middleware verifies
  the token on each request and gates protected routes; logout clears the cookie.
- **Signing key:** an HS256 key **generated on deploy by CloudFormation into AWS Secrets
  Manager** (the `AuthSecret` CDK construct). It never lives in source or env files. The SSR
  Lambda is granted `secretsmanager:GetSecretValue`, fetches the key once per instance, and
  caches it. **Secrets Manager is in LocalStack Community**, so the local loop stays
  hermetic — no paid-tier gap, no sidecar.

We chose **JWT over opaque server-side sessions**: for a single SSR backend reading its own
table, statelessness removes a per-request DynamoDB read and a session table to maintain.
We chose the **`jose`** library over hand-rolling HS256 so that signature, algorithm, and
expiry checks are handled by audited code rather than by us.

## Consequences

- Good, because the local loop is **fully hermetic** — one LocalStack Community container,
  no paid-tier gap, no dev-only sidecar, no second auth endpoint. The `cognito-local`
  sidecar, the `Auth`/Cognito construct, and `@aws-sdk/client-cognito-identity-provider`
  are removed.
- Good, because sessions are **stateless** — verification is local to the Lambda, with no
  per-request datastore round-trip and no session table to evict.
- Good, because the **signing key is managed, not handled** — generated and stored by
  CDK + Secrets Manager, never in source, rotatable without code changes.
- Bad/accepted, because JWT sessions are **not individually revocable before expiry**. A
  stolen or stale token stays valid until it expires. Mitigated by the narrow scope
  (internal, invite-only), the `HttpOnly`/`Secure` cookie, and the bounded 7-day lifetime;
  a global revocation, if ever needed, is a key rotation.
- Bad/accepted, because we now own **password-handling security** (policy, rate-limiting,
  reset flows, fixation/expiry) rather than delegating to a managed IdP. Mitigated by the
  narrow scope and standard primitives (`scrypt`, timing-safe compare, `HttpOnly` cookies).
- Bad/accepted, because we add **one runtime dependency, `jose`** — a deliberate exception
  to our zero-dependency lean, taken because crypto correctness is worth not hand-rolling.
  `@aws-sdk/client-secrets-manager` is provided by the Lambda runtime.
- Bad/accepted, because there is **no MFA, no passkeys, no hosted UI, no social login**. If
  any of those return, revisit via a new ADR (likely back to Cognito or a hosted IdP).

## Pros and Cons of the Options

### Keep Cognito + cognito-local hybrid

- Good, because auth is a managed, AWS-native IdP and the path to MFA/passkeys stays open.
- Bad, because it is paid-tier in LocalStack, needs a dev-only sidecar and two auth
  endpoints, and keeps a documented `UserPool` exception — all to buy capabilities we no
  longer require.

### Third-party hosted IdP (Auth0/Clerk/…)

- Good, because the flows (sign-in, reset, MFA) are managed and well-tested.
- Bad, because it makes the local loop **non-hermetic** and adds a vendor for a handful of
  internal users.

### Self-hosted IdP (Keycloak)

- Good, because it is full-featured and can run locally in a container.
- Bad, because it is a **heavy extra service** to run, secure, and operate.

### Opaque server-side sessions vs. JWT

- Server-side sessions are **instantly revocable** but cost a DynamoDB read per request and
  a session table with TTL eviction to own.
- JWT is **stateless and cheap to verify** but **not revocable before expiry**; it needs a
  signing key, which Secrets Manager + CDK now manage for us. For one internal backend, the
  simplicity won.

## More Information

This **replaces the project's earlier decision** to use Amazon Cognito emulated with
`cognito-local`, and the interim sketch of opaque DynamoDB session records. The
`cognito-local` sidecar, the `Auth` construct, the `cognito-*` Makefile seed targets, and
the shared `cognitoClient` are removed; `@aws-sdk/client-cognito-identity-provider` is
dropped. The session signing key is introduced as the `AuthSecret` CDK construct
(Secrets Manager), surfaced as the `JwtSecretArn` stack output and the `JWT_SECRET_ARN`
Lambda env var.

Builds on [ADR 0006](0006-localstack-dev-and-function-url-ssr.md) (LocalStack + `cdklocal`)
and [ADR 0007](0007-rest-api-gateway-front.md) (the REST API front). See
[Local architecture](../architecture/local-emulation.md). References:
[Node `crypto.scrypt`](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback),
[`jose`](https://github.com/panva/jose),
[AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html),
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Still open: the password-reset / invite flow, login rate-limiting, and the dev user-seed
step are implementation items, not settled here.
