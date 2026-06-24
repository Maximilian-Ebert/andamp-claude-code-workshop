# Code style

Conventions for writing and editing code in this repo. Prefer **prescriptive rules with examples** over prose. When you change how we write code, update this file.

> Formatting (quotes, semicolons, spacing, line width) is owned by Prettier and ESLint — this guide covers what tooling can't enforce: structure, naming, and patterns.

## Principles

- **Match the surrounding file** before applying a rule here — local consistency wins.
- **Code is self-describing; comments only warn.** See [Comments](#comments).
- **One step per line; breathe between steps.** See [Nesting](#nesting) and [Whitespace](#whitespace).
- **Make illegal states unrepresentable.** Lean on the type system instead of runtime checks.

## Comments

Write code that explains itself through names and structure. Do **not** narrate what the code does.

A comment is only justified when it **warns** the reader of something the code cannot show: a non-obvious gotcha, an ordering constraint, a workaround for an external bug, a deliberate-looking-wrong choice.

```ts
// ✗ avoid — restates the code
// loop over users and deactivate them
for (const u of users) deactivate(u);

// ✗ avoid — section headers, narration, "what" comments
// build the payload
const payload = { id, ts };

// ✓ prefer — no comment; the names carry the meaning
for (const user of users) deactivate(user);

// ✓ prefer — warns about something the code can't reveal
// Stripe sends events out of order; ignore any older than the last seen.
if (event.createdAt < lastSeenAt) return;

// ✓ prefer — warns about a constraint that looks safe to change but isn't
// Must run before initDb(): the pool reads these env vars at import time.
loadEnv();
```

If you feel the urge to explain *what* a block does, rename or extract it instead of commenting.

## Nesting

Don't nest function calls. Bind each step to a named `const` and pass it on. The names document the data flow and the code reads top-to-bottom.

```ts
// ✗ avoid — reads inside-out, intermediate values are nameless
return formatRows(sortByDate(filterActive(await fetchSessions(userId))));

// ✓ prefer — one step per line, each value named
const sessions = await fetchSessions(userId);
const active = filterActive(sessions);
const ordered = sortByDate(active);
return formatRows(ordered);
```

The same applies to arguments: pull a nested call out into a `const` rather than calling it in place.

```ts
// ✗ avoid
sendReceipt(buildReceipt(getOrder(orderId), getCustomer(customerId)));

// ✓ prefer
const order = getOrder(orderId);
const customer = getCustomer(customerId);
const receipt = buildReceipt(order, customer);
sendReceipt(receipt);
```

## Whitespace

Break long blocks into paragraphs with blank lines. Group lines that form one logical step, and separate steps with a single empty line — the same way you'd paragraph prose. Don't write a 30-line wall with no breaks.

Good places for a blank line: between setup and work, before a `return`, around a loop or branch, between logical phases.

```ts
// ✗ avoid — one unbroken wall
async function checkout(cartId: CartId) {
  const cart = await getCart(cartId);
  const items = cart.items.filter((i) => i.inStock);
  const subtotal = items.reduce((n, i) => n + i.price, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const order = await createOrder({ cartId, items, total });
  await charge(order);
  await sendReceipt(order);
  return order;
}

// ✓ prefer — paragraphs separate the phases
async function checkout(cartId: CartId) {
  const cart = await getCart(cartId);
  const items = cart.items.filter((i) => i.inStock);

  const subtotal = items.reduce((n, i) => n + i.price, 0);
  const total = subtotal + subtotal * TAX_RATE;

  const order = await createOrder({ cartId, items, total });

  await charge(order);
  await sendReceipt(order);

  return order;
}
```

## TypeScript

- ESM only — use `import`/`export`, never `require`. Include the `.js` extension in relative imports where the toolchain requires it.
- Prefer `type` aliases for data shapes; reserve `interface` for things that are extended/implemented.
- No `any`. Reach for `unknown` + narrowing, or a precise type.
- Use the workspace path aliases (`@lib`, `@data`) instead of deep relative paths.

```ts
// ✗ avoid — stringly-typed, throws for control flow, deep relative import
import { getUser } from '../../../shared/data/users';
function load(id: any) {
  if (!id) throw 'no id';
  return getUser(id);
}

// ✓ prefer — typed, explicit absence, alias import
import { getUser } from '@data/users';
function load(id: UserId): Promise<User | null> {
  return getUser(id);
}
```

## Naming

| Kind | Convention | Example |
| --- | --- | --- |
| Files (TS) | kebab-case | `user-session.ts` |
| Types / classes | PascalCase | `UserSession` |
| Functions / variables | camelCase | `getActiveSession` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Booleans | `is`/`has`/`should` prefix | `isExpired` |

## Error handling

- Validate at the boundary (handler input, request params); trust types inside.
- Don't swallow errors — handle, or let them propagate with context.

```ts
// ✗ avoid — silent failure hides the cause
try { await save(x); } catch { /* ignore */ }

// ✓ prefer — add context, rethrow
try {
  await save(x);
} catch (err) {
  throw new Error(`failed to save session ${x.id}`, { cause: err });
}
```

## Async

- `async`/`await` over raw `.then()` chains.
- Parallelize independent awaits with `Promise.all` rather than awaiting in sequence.

## Lambda handlers (`functions/`)

- Type the handler with the matching `aws-lambda` type (e.g. `APIGatewayProxyHandlerV2`) — don't hand-type `event`/`result`.
- Keep handlers **thin**: parse/validate input, call into `@lib`/`@data`, shape the response. Business logic lives in `shared`, not the handler.
- Resolve constants that don't change per-invocation at module scope so they're computed once on cold start.
- Read env vars through a small accessor that throws if missing (see `shared/data` `tableName()`), not inline `process.env.X!`.

```ts
// ✗ avoid — untyped, logic inline, non-null assertion on env
export const handler = async (event: any) => {
  const id = JSON.parse(event.body).userId;
  const r = await dynamoDocClient().send(/* ...inline query... */);
  return { statusCode: 200, body: JSON.stringify(r.Item) };
};

// ✓ prefer — typed, delegates to the data layer, thin
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { findUser } from '@data';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const email = event.queryStringParameters?.email;
  if (!email) return { statusCode: 400, body: 'email required' };

  const user = await findUser(email);
  if (!user) return { statusCode: 404, body: 'not found' };

  return { statusCode: 200, body: JSON.stringify(user) };
};
```

## Astro / web-app

- **Validate input at the boundary with Actions.** Mutations go through `defineAction` with a `zod` input schema; throw `ActionError` with a `code` for expected failures. Don't validate again deeper in.
- **Auth and redirects live in `middleware.ts`**, not in page frontmatter. Read the session once, put the user on `context.locals`, guard protected prefixes there.
- **`@lib` and `@data` are server-only.** Import them in actions, middleware, and page frontmatter — never in client-side `<script>` or anything that ships to the browser.
- **Components are presentational.** Style with Tailwind + daisyUI utility classes. Leave frontmatter empty when a component takes no props; keep data fetching in pages/actions, not components.

```ts
// ✗ avoid — no input validation, generic thrown error
export const login = defineAction({
  handler: async ({ email, password }, { cookies }) => {
    const user = await findUser(email);
    if (!user) throw new Error('nope');
    // ...
  },
});

// ✓ prefer — zod at the boundary, typed ActionError
export const login = defineAction({
  accept: 'form',
  input: z.object({
    email: z.email('Enter a valid email address.').trim(),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
  }),
  handler: async ({ email, password }, { cookies }) => {
    const user = await findUser(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ActionError({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' });
    }
    // ...
  },
});
```

## Infrastructure (CDK)

- **One construct per file** under `component/`, named in PascalCase after what it provisions (`UserTable`, `AstroServer`).
- Props are a `readonly` interface named `<Construct>Props`. Expose the created resource as a `readonly` field so other constructs can wire to it.
- **Drive environment differences off props, not globals.** Pass an `isLocal` (or similar) flag in and branch on it — don't read `process.env`/`NODE_ENV` inside a construct.
- Use namespace imports for CDK modules (`import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'`).

```ts
// ✓ prefer — readonly props, exposed resource, env difference via prop
export interface UserTableProps {
  readonly isLocal: boolean;
}

export class UserTable extends Construct {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: UserTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.isLocal ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });
  }
}
```
