# Passwordless Email-First Signup (consume-or-create) — fsdk-ts (Frontend) Implementation Plan

**Skill path used:** `/fsdk-ts-plan` (repo-local skill, present in this session's catalog and invoked
via the Skill tool). Its Phase 1–6 checklist was followed in full. Canonical patterns were
cross-checked live against `src/api/auth.ts`, `src/hooks/auth/useMagicLink.ts`,
`src/hooks/auth/useConsumeMagicLink.ts`, `src/hooks/auth/usePasswordReset.ts`,
`src/hooks/auth/useGoogleLogin.ts`, `src/api/foundation-client.ts`, `src/types/auth.ts`,
`ARCHITECTURE.md`, and the three shipped magic-link test files in `src/__tests__/`.

**Design baseline (SHIPPED):** This plan sits on top of `main`, which already contains the shipped
magic-link surface: `authApi.requestMagicLink`/`authApi.consumeMagicLink`, `useMagicLink`,
`useConsumeMagicLink`, `MagicLinkRequestResult`/`MagicLinkRequestPayload`/`ConsumeMagicLinkPayload`
types, `useGoogleSignIn`, `useEmailVerification`, optional names on `RegisterData`, and
`User.email_verified?`. All were read live and this plan matches their idioms.

**Sibling backend plan:** A separate agent is planning the foundation-sdk backend
(`passwordless email-first signup` / consume-or-create) in parallel. **Every endpoint/shape below is
provisional** — drawn from the coordinator's stated intent, not a written backend contract. See the
**"Backend Contract Assumptions"** section, which MUST be reconciled with the backend plan's contract
section BEFORE execution.

---

## Context

Add **email-first passwordless SIGNUP** to fsdk-ts as an **additive, opt-in** capability: the user
types an email, the backend emails a one-time link, and clicking it **creates the account if the
email is new, or logs in the existing account** — no password, ever. fsdk-ts ships **types + api-client
method(s) + hook(s) ONLY — no UI components** (`ARCHITECTURE.md:38`: UI is consumer-owned).

This maps to the foundation-sdk **auth** domain (same domain as login/register/password-reset/magic-link).
It is **not a new domain** — it is an extension of the existing `auth` module in both layers. The
feature is essentially **"magic-link, but the consume step can also CREATE the account."** The two
observable steps for the frontend are identical in *shape* to magic-link:

1. **Request** — `POST { email }` → always a generic `200 { success, message }` (enumeration-safe).
2. **Consume** — `POST { token }` → the same `LoginResponse` envelope as `/login` (user + optional
   JWT), sets the cookie session, and (new vs magic-link) **creates the account first if the email is
   new**. The frontend cannot tell create from login — and by Constraint 3 it must not try.

### Opt-in / additive posture (Constraint 4)

fsdk-ts exposes *capabilities*, not a rendered form, so "opt-in" is satisfied structurally: an app
that wants email-first signup imports the new hook(s); an app that doesn't never imports them.
Password (`useLogin`), Google (`useGoogleSignIn`), and the **shipped magic-link hooks stay byte-for-byte
untouched** (Constraint 4 is a hard gate — see the reuse decision below for how this shapes the
design). No env flag, no gating, no init pattern (no per-consumer secret, unlike `useGoogleSignIn`'s
`googleClientId`).

---

## Reuse vs. new-sibling decision (Constraint 2) — **RECOMMENDATION**

**Decision: NEW SIBLINGS for the request half; REUSE the existing consume half if (and only if) the
backend exposes a single unified consume endpoint — otherwise a thin consume sibling.**

The request/consume *shapes* are identical to magic-link (`POST {email}` → generic 200; `POST {token}`
→ `LoginResponse` + cookie), which by Constraint 2 argues for reuse. But two facts pull the **request**
half toward a new sibling, and they win:

1. **The request MUST target a different backend endpoint.** Magic-link's request
   (`POST /api/auth/magic/request`) is **login-only** — it emails a link *only to existing users* and
   never creates. Email-first signup's request is **consume-or-create** — it emails a link to *any*
   address and provisions on consume. These are two deliberately-distinct opt-in behaviors (if they
   were the same endpoint, there'd be no separate feature). `authApi.requestMagicLink` hardcodes the
   `/api/auth/magic/request` path, so it cannot be reused verbatim for the create-capable endpoint.
2. **Constraint 4 forbids touching the shipped magic-link hooks/methods.** Adding a `mode`/`create`
   flag to `requestMagicLink`/`useMagicLink` to switch endpoints *is* touching them (behavior +
   signature change) and is explicitly disallowed. So extension-in-place is off the table for the
   request half.
3. **Naming/semantic clarity.** `useMagicLink` is named for *login*. A consumer building an
   email-first *signup* entry point wants a clearly-named hook. An enumeration-safe name that reveals
   neither "signup" nor "login" is best (the user genuinely doesn't know which will happen) — hence
   **`requestSignInLink` / `useEmailSignIn`** ("sign in" = the neutral umbrella for create-or-login).

**Consume half — reuse if the backend unifies, else thin sibling.** The consume step is
*behavior-identical* to magic-link: `POST {token}` → `User` → funnel into `useAuth().login(user)`. A
token is a token; whether it provisions a new account or logs in an existing one is a **backend**
decision keyed on the token record, invisible to the client. Therefore:

- **PREFERRED (recommend the backend adopt this): a single unified consume endpoint**
  (`POST /api/auth/magic/consume` handles both login-tokens and signup-tokens). Then fsdk-ts **reuses
  `authApi.consumeMagicLink` + `useConsumeMagicLink` verbatim** — zero new consume code. The consumer's
  callback page is literally the same component regardless of which link was clicked. This is the
  strongest reuse story and directly honors Constraint 2 ("favor reuse if the consume shapes are the
  same" — here they are *identical*).
- **FALLBACK (only if the backend insists on a separate consume URL):** add
  `authApi.consumeSignInLink(token)` + `useConsumeEmailSignIn()` as near-verbatim siblings of the
  magic-link consume pair, differing only in the endpoint path. Same state machine, same
  `useAuth().login` funnel.

**Net new surface (primary recommendation, unified consume):**
`authApi.requestSignInLink` + `useEmailSignIn` **only** — consume is reused. This is the minimal,
DRYest footprint that still gives the feature its own clearly-named request entry point.

> This decision is the single biggest item to reconcile with the backend plan: **is consume one
> endpoint or two?** If one → build only the request sibling. If two → also build the consume sibling.
> The plan below specifies both so the implementing agent can execute either branch once the contract
> is fixed.

### Request vs consume: mirror the two-hook split

The shipped magic-link surface deliberately uses **two hooks** (request on the login/signup page with
no `useAuth` dependency; consume on the email-callback page, which touches `useAuth`). This plan mirrors
that split exactly rather than bundling into one `useEmailFirstAuth` umbrella hook — same rationale the
magic-link plan gave: bundling would force the request-only page to pull in `useAuth` and would muddy
two independent state machines. (`useEmailFirstAuth` was considered and rejected for this reason.)

---

## Agnosticism Assessment (Phase 3A — the primary gate)

| Planned export | Verdict | Rationale |
|---|---|---|
| `authApi.requestSignInLink(email)` | Agnostic | Foundation `/api/auth/*`, identical shape for every consumer; no product data. Enumeration-safe generic envelope. |
| `authApi.consumeSignInLink(token)` *(fallback only)* | Agnostic | Foundation consume endpoint; returns the same `User` every consumer already uses. Only built if backend consume is separate. |
| `useEmailSignIn()` (request hook) | Agnostic | Request state machine over `authApi.requestSignInLink`; no product workflow. Copy of `useMagicLink`. |
| `useConsumeEmailSignIn()` *(fallback only)* | Agnostic | Consume + `useAuth().login`; identical to `useConsumeMagicLink`. Only built if backend consume is separate. |
| Reuse: `authApi.consumeMagicLink` / `useConsumeMagicLink` *(preferred)* | Agnostic (already shipped) | Reused verbatim when the backend unifies consume — no new code. |
| Optional neutral type aliases (`SignInLinkRequestResult` etc.) | Agnostic | Generic `{ success, message }` / string payloads; may simply reuse the shipped `MagicLinkRequestResult`. |
| **A signup form / callback-page component** | **Consumer-only — DO NOT build here** | `ARCHITECTURE.md`: UI components are consumer-owned. The email-entry form and `/auth/…?token=` callback page are consumer chrome. |

No hardcoded product values, no product-specific endpoints, no init pattern (no per-consumer secret).
Everything is cleanly agnostic — same posture as magic-link.

---

## Work Packages

> Paths relative to `fsdk-ts/`. WP2b/WP3b (the consume sibling) are **conditional** — build them only
> if the backend ships a *separate* consume endpoint (see the reuse decision + Backend Contract
> Assumptions). Under the preferred unified-consume contract, skip WP2b/WP3b and reuse the shipped
> magic-link consume pair.

### WP1 — Types (`src/types/auth.ts`)

The request/consume response shapes are **identical** to magic-link, so the shipped types already
cover them:

- **Request response** → reuse **`MagicLinkRequestResult`** (`{ success: boolean; message: string }`,
  already exported). The enumeration-safe generic envelope is the same.
- **Consume response** → reuse **`User`** via the existing `AuthResponse<User>` envelope
  (`login`/`google`/`consumeMagicLink` all use it). **No new consume type.**

**Decision (recommend the cheaper option, flag for reviewer):** Do NOT add duplicate types. Reuse
`MagicLinkRequestResult` and (if consume is a sibling) the same envelope. *Optionally*, for
vocabulary clarity, add thin **type aliases** in a new `// --- Passwordless email-first signup ---`
section:

```ts
// Email-first passwordless signup (consume-or-create). Shapes are identical to
// magic-link; these aliases exist only so consumers can name the sign-in flow.
export type SignInLinkRequestResult = MagicLinkRequestResult;   // { success, message }
export interface SignInLinkRequestPayload { email: string; }     // == MagicLinkRequestPayload
export interface ConsumeSignInLinkPayload { token: string; }     // == ConsumeMagicLinkPayload
```

Recommend adding the aliases (cheap, self-documenting, exported via the existing
`src/types/index.ts → export * from './auth'` — **no barrel edit**). Flag if the reviewer prefers zero
new type names and strict reuse of the magic-link ones.

### WP2 — API Client: request (`src/api/auth.ts`)

Add **one** method to the existing `authApi` object. Use **`foundationRequest`** (foundation
`/api/auth/*`, JWT Bearer + `credentials: 'include'` — the client every sibling uses).

**`requestSignInLink(email: string): Promise<SignInLinkRequestResult>`**
- Copy `requestMagicLink` almost verbatim (body-ful `POST { email }`, returns the message envelope).
  Endpoint (provisional): `POST /api/auth/signin/request` (or whatever the backend names the
  create-capable request endpoint — **NOT** `/api/auth/magic/request`, which is login-only).
- Enumeration-safe: resolves a generic success even for a brand-new email; the client does **no**
  special-casing and exposes nothing that reveals whether the account existed (Constraint 3).
- Log `info` before/after via the existing `auth-api` module logger. Never log anything beyond the
  email already in the request (matches `requestMagicLink`/`requestPasswordReset`).

### WP2b — API Client: consume *(CONDITIONAL — only if backend consume is separate)*

**`consumeSignInLink(token: string): Promise<User>`**
- Model on `consumeMagicLink` exactly: `POST /api/auth/signin/consume` (provisional), body `{ token }`,
  response `AuthResponse<User>`. Guard `if (!response.user) throw`. If `response.token` present,
  `storage.setToken(response.token)` (same cross-service JWT handling as login/google/magic).
- Return `response.user`. Log `info` with `userId` on success. **Never log the raw token.**
- **If the backend unifies consume: DO NOT build this.** Reuse `authApi.consumeMagicLink`.

**401 skip (verified against `src/api/foundation-client.ts:57`):** both endpoints start with
`/api/auth/`, and the client's global 401 interceptor **skips `authStore.deauth()`** for any path
under `/api/auth/` (`response.status === 401 && !endpoint.startsWith('/api/auth/')`). This is the
desired behavior — an expired/used sign-in token yielding 401 on consume must **not** wipe an existing
logged-in session. **No client change; note it so nobody "fixes" the skip.** `surfaceToast(data)` still
fires so a backend error message reaches the toast surface automatically.

### WP3 — Hook: request (`src/hooks/auth/useEmailSignIn.ts`) — **NEW FILE**

A near-verbatim copy of `useMagicLink` (Constraint 1 — mirror the idiom). Same state machine:
`isSending` / `sent` / `error` / `reset`. **No `useAuth` dependency** (request never authenticates).

```ts
interface UseEmailSignInReturn {
  request: (email: string) => Promise<void>;
  isSending: boolean;
  // True after a successful (enumeration-safe) request. Does NOT imply the email
  // existed OR that an account was created — the two are indistinguishable here.
  sent: boolean;
  error: string | null;
  reset: () => void;   // clears sent + error to re-arm the form
}
```

- `const logger = getLogger('useEmailSignIn');`
- `request(email)`: `setIsSending(true); setError(null); setSent(false);` →
  `await authApi.requestSignInLink(email)` → `setSent(true)` → `finally setIsSending(false)`. On catch:
  set `error` from `err.message`, `logger.error`, **rethrow** (matches every sibling hook's rethrow
  contract).
- `reset()`: `setSent(false); setError(null)`.
- **Constraint 3 (enumeration-safety) is structural here:** the hook has exactly one success state
  (`sent`) for both new and returning users. It receives no existence signal from the api and MUST NOT
  add one. There is no "account created" vs "logged in" branch anywhere in the request hook.

### WP3b — Hook: consume (`src/hooks/auth/useConsumeEmailSignIn.ts`) — **NEW FILE, CONDITIONAL**

*Only if WP2b is built (separate backend consume endpoint).* A near-verbatim copy of
`useConsumeMagicLink`. Same state machine + the `useAuth().login` funnel.

```ts
interface UseConsumeEmailSignInReturn {
  consume: (token: string) => Promise<User>;
  isConsuming: boolean;
  consumed: boolean;         // true once the session is established
  user: User | null;         // the logged-in/created user (also in the shared authStore)
  error: string | null;      // e.g. "This link has expired"
  clearError: () => void;
}
```

- `const logger = getLogger('useConsumeEmailSignIn');`
- `const { login: authLogin } = useAuth();`
- `consume(token)`: `setIsConsuming(true); setError(null);` →
  `const user = await authApi.consumeSignInLink(token)` → `authLogin(user)` (sets store + storage +
  `markResolved`, flipping every mounted `useAuth` to authenticated with no full-page reload) →
  `setUser(user); setConsumed(true)` → return `user`. On catch: set `error`, log, **rethrow**.
  `finally setIsConsuming(false)`. `useCallback` deps `[authLogin]` (matches `useConsumeMagicLink`).
- **If the backend unifies consume: DO NOT build this.** The consumer's callback page uses the shipped
  `useConsumeMagicLink` unchanged.

### WP4 — Barrel Exports

- **`src/hooks/auth/index.ts`** — append (consume line only if WP3b is built):
  ```ts
  export * from './useEmailSignIn';
  export * from './useConsumeEmailSignIn';   // only if WP3b built
  ```
- **Types** — new aliases (WP1) auto-export via the existing `src/types/index.ts → export * from './auth'`.
  **No edit needed.**
- **API** — `authApi` is already exported via `src/api/index.ts → export * from './auth'`; adding methods
  to the existing object needs **no barrel change.**
- **Top-level** — `src/index.ts → export * from './hooks' → src/hooks/index.ts → export * from './auth'`.
  The chain already carries the new hooks. **No `src/index.ts` edit.**
- **No `package.json` `exports` change** — no new subpath; reachable from the main `'fsdk-ts'` import.
- **Collision check (grepped, clean):** `requestSignInLink`, `consumeSignInLink`, `useEmailSignIn`,
  `useConsumeEmailSignIn`, `SignInLinkRequestResult`, `SignInLinkRequestPayload`,
  `ConsumeSignInLinkPayload` — **none collide** with any existing export (verified via
  `grep -rn` over `src/`). Re-grep at execution before adding.

### WP5 — Package Exports

**None.** No new subpath export; everything is reachable from the main `'fsdk-ts'` import.

### WP6 — Convention Updates

**None.** No new pattern is introduced — request reuses the `useMagicLink`/`usePasswordReset`
state-machine shape; consume (sibling or reused) reuses the `useConsumeMagicLink`/`useGoogleLogin` →
`useAuth().login` funnel. No `ARCHITECTURE.md` convention change, no skill-checklist gap. (Doc *table*
updates are WP7, not a convention change.)

### WP7 — Cross-Layer / Doc Updates (post-implementation)

- **Run `/fsdk-ts-update-docs`** after code lands: it adds `requestSignInLink` (+ `consumeSignInLink`
  if built) and `useEmailSignIn` (+ `useConsumeEmailSignIn` if built) to the `ARCHITECTURE.md`
  auth-module tables and re-checks type-backend parity against the foundation-sdk auth serializer.
- **foundation-sdk `auth` DOMAIN.md** cross-reference: add the new fsdk-ts hook(s) + api method(s) to
  its "fsdk-ts module" section, **once the backend endpoints exist**. Coordinate with the backend agent
  so this lands with the backend plan, not before endpoints are real.
- **No consumer wiring change** required to adopt — an app just imports the new hook(s). (Contrast with
  `useGoogleSignIn`, which needs `initEnv({ googleClientId })`.)

---

## Cross-Cutting Concerns Summary

### Type-Backend Parity
| Type | Backend Source | Field Convention | Notes |
|------|---------------|------------------|-------|
| `SignInLinkRequestResult` (= `MagicLinkRequestResult`) | signin-request response | `{ success, message }` (agnostic) | Same generic enumeration-safe envelope as magic-link/password-reset. Reconcile field names with the backend plan. |
| consume → `User` | signin-consume response `user` (or reused magic consume) | `snake_case` (existing `User`) | Reuses `AuthResponse<User>` + the shared `serialize_user`. **Must be the SAME user shape `/login` returns** — including `email_verified`. |

### HTTP Client Usage
| API Method | Client | Auth | Endpoint (provisional) |
|-----------|--------|------|------------------------|
| `requestSignInLink` | `foundationRequest` | none needed (public) | `POST /api/auth/signin/request` body `{ email }` |
| `consumeSignInLink` *(fallback)* | `foundationRequest` | sets cookie + JWT on success | `POST /api/auth/signin/consume` body `{ token }` |
| *reuse* `consumeMagicLink` *(preferred)* | `foundationRequest` | sets cookie + JWT on success | `POST /api/auth/magic/consume` body `{ token }` |

### Logging Points
| File | Logger Context | Key Log Points |
|------|----------------|----------------|
| `src/api/auth.ts` (additions) | `auth-api` (existing module logger) | info before/after each method; error via thrown message; **never log token** |
| `src/hooks/auth/useEmailSignIn.ts` | `useEmailSignIn` | info on `sent`; error on failure |
| `src/hooks/auth/useConsumeEmailSignIn.ts` *(fallback)* | `useConsumeEmailSignIn` | info with `userId` on `consumed`; error on failure |

### Error Handling
Both api methods let `foundationRequest` parse + throw the backend message (it already does
`data.message || data.error || HTTP status`). Hooks catch, set `error`, log, rethrow — the exact
sibling contract. Consume's expired/invalid/used-token 401 surfaces as a normal thrown message and
does **not** deauth (WP2b note; verified `foundation-client.ts:57`). No domain-specific error state is
needed beyond a single `error: string` — and Constraint 3 forbids any error that reveals account
existence.

---

## Files to Modify
| File | WP | Changes |
|------|----|---------|
| `src/types/auth.ts` | WP1 | Add `SignInLinkRequestResult`/`SignInLinkRequestPayload`/`ConsumeSignInLinkPayload` aliases (or reuse magic-link types) |
| `src/api/auth.ts` | WP2 (+WP2b) | Add `requestSignInLink` (and `consumeSignInLink` if consume is separate) |
| `src/hooks/auth/useEmailSignIn.ts` | WP3 | **New file** — request state machine (copy of `useMagicLink`) |
| `src/hooks/auth/useConsumeEmailSignIn.ts` | WP3b | **New file, conditional** — consume + `useAuth().login` (copy of `useConsumeMagicLink`) |
| `src/hooks/auth/index.ts` | WP4 | One `export *` line (two if WP3b built) |
| `src/__tests__/signInLink.api.test.ts` | Tests | **New** — api client unit tests |
| `src/__tests__/useEmailSignIn.test.ts` | Tests | **New** — request hook state machine |
| `src/__tests__/useConsumeEmailSignIn.test.tsx` | Tests | **New, conditional** — consume hook + store update (skip if reusing magic consume) |

## Files to Read Before Implementation
- `ARCHITECTURE.md` (agnosticism boundary — UI components are consumer-owned)
- `src/api/auth.ts` (mirror `requestMagicLink` + `consumeMagicLink` exactly)
- `src/hooks/auth/useMagicLink.ts` (the request hook to copy)
- `src/hooks/auth/useConsumeMagicLink.ts` (the consume hook to copy / reuse)
- `src/hooks/auth/useGoogleLogin.ts` (the `useAuth().login` funnel precedent)
- `src/api/foundation-client.ts` (the `/api/auth/` 401-skip discriminator at line 57 — do NOT break it)
- `src/types/auth.ts` (existing `MagicLinkRequestResult` + payload aliases to reuse)
- The three shipped magic-link tests — `src/__tests__/magicLink.api.test.ts`,
  `src/__tests__/useMagicLink.test.ts`, `src/__tests__/useConsumeMagicLink.test.tsx` — copy their style
- The **backend plan's contract section** (reconcile every item in "Backend Contract Assumptions",
  especially *unified vs. separate consume endpoint*)
- foundation-sdk auth blueprint + `serialize_user` (confirm the consume `user` shape == `/login`'s)

## Implementation Order
1. Reconcile the Backend Contract Assumptions — **decide unified vs. separate consume** (determines
   whether WP2b/WP3b are built).
2. Types (`src/types/auth.ts`) — no dependencies.
3. API client method(s) (`src/api/auth.ts`) — depends on types.
4. Hook(s) (`useEmailSignIn`, then `useConsumeEmailSignIn` if applicable) — depend on api + `useAuth`.
5. Barrel export line(s) (`src/hooks/auth/index.ts`).
6. Tests.
7. Build + test gate: `npm run build` then `npm test`.

---

## Gate Impact & Tests

### Gate commands
- **`npm run build`** — `tsc --build tsconfig.json && tsc --build tsconfig.cjs.json` (ESM + CJS). Must
  pass with zero errors; strict TS. New aliases + hook(s) are additive and should not perturb existing
  declarations.
- **`npm test`** — `vitest run`. Existing suite (incl. the three magic-link tests) must stay green; add
  the new files below.

### Tests to add (match existing style — `vitest` + `@testing-library/react`; model on the magic-link tests)
1. **`src/__tests__/signInLink.api.test.ts`** — model on `src/__tests__/magicLink.api.test.ts`
   (`mockFetchOnce`/`globalThis.fetch = vi.fn()`; mock `../api/response-toast`):
   - `requestSignInLink` POSTs `{ email }` to the signin-request path and returns the `{ success, message }`
     envelope; **resolves generically for an unknown/new email** (enumeration-safe — the create case
     must look identical to the login case).
   - *(if WP2b)* `consumeSignInLink` POSTs `{ token }`, returns `response.user`, and calls
     `storage.setToken` when `response.token` is present.
   - *(if WP2b)* `consumeSignInLink` **throws** the missing-user guard when `response.user` is absent.
   - *(if WP2b)* a **401 on consume does NOT clear storage** (asserts the `/api/auth/` skip — mirror the
     magic-link api test's 401 case).
2. **`src/__tests__/useEmailSignIn.test.ts`** — model on `src/__tests__/useMagicLink.test.ts`;
   `renderHook(() => useEmailSignIn())`, mock `../api/auth`:
   - Happy path: `isSending` toggles true→false around `request`; `sent` becomes true.
   - Failure: `error` set from the thrown message; `sent` stays false; the promise rejects.
   - `reset()` clears `sent` and `error`.
   - **Enumeration-safety assertion:** a request for a brand-new email and a request for an existing
     email both land in the exact same `sent === true` state (the hook exposes no distinguishing field).
3. **`src/__tests__/useConsumeEmailSignIn.test.tsx`** *(conditional — skip if reusing
   `useConsumeMagicLink`)* — model on `src/__tests__/useConsumeMagicLink.test.tsx`; mock `../api/auth`
   and `../api/profile`; assert the **shared store update**:
   - Happy path: `consume(token)` resolves the `User`, sets `consumed`/`user`, and a co-mounted
     `useAuth()` reports `isAuthenticated === true` (proves `authLogin` funneled into the store).
   - Failure (expired token): `error` set, `consumed` false, rejection propagates, and a co-mounted
     `useAuth()` is **not** authenticated / not deauthed.

### Negative-requirement note (Phase 3H)
Email-first signup does not *gate* access on state, so a full enforcement matrix is out of scope. The
security-shaped requirements to assert:
- **A consume failure (invalid/expired/used token) must not authenticate and must not corrupt an
  existing session** — covered by the consume failure test + the 401-no-deauth api test.
- **Enumeration-safety is not leaked by the frontend** — the request hook/api expose no field that
  distinguishes create-from-login or exists-from-not (asserted by the "both paths → same `sent` state"
  test). The backend owns the actual guarantee; the frontend test only proves the client adds no leak.

---

## Backend Contract Assumptions (RECONCILE with the backend plan BEFORE execution)

Every item is **provisional** — from the coordinator's stated intent, not a written backend contract.
Confirm each against the backend plan's contract section. **Item 2 is load-bearing** (it decides whether
WP2b/WP3b exist).

1. **Request endpoint (create-capable, distinct from login-only magic):**
   `POST /api/auth/signin/request` (path TBD), body `{ email }`, **enumeration-safe** → always
   `200 { success, message }` whether the email exists or not, and it **sends a link to any address**
   (creating on consume). *Confirm exact path, method, body key `email`, response field names, and that
   this is a SEPARATE endpoint from `/api/auth/magic/request` (which is login-only and must stay so).*
2. **⭐ Consume: ONE unified endpoint or TWO?** — *the pivotal question.*
   - **PREFERRED:** a single `POST /api/auth/magic/consume` handles both login-tokens and
     signup-tokens (the token record decides create-vs-login). → fsdk-ts **reuses**
     `authApi.consumeMagicLink` + `useConsumeMagicLink`; **WP2b/WP3b are not built.**
   - **ALTERNATIVE:** a separate `POST /api/auth/signin/consume`. → fsdk-ts **builds** `consumeSignInLink`
     + `useConsumeEmailSignIn` (WP2b/WP3b). *Confirm which, and the exact path.*
3. **Consume is a body-ful POST** (`{ token }`) that returns `{ success, user, token? }` (the same
   `AuthResponse<User>` envelope as `/login`) **and** sets the session cookie — **not** a GET
   self-redirect link. This is required for the hook approach. If the backend instead ships a
   GET-redirect link (cookie set server-side, browser lands on the SPA already authed), the consume
   hook/method collapses to "the app's landing route calls `useAuth().refreshUser()`" and only the
   request half ships. *Confirm POST-with-body vs GET-redirect.*
4. **The emailed link targets a consumer FRONTEND route** (e.g. `https://app/auth/signin?token=…`), NOT
   a backend URL — the frontend extracts the token and POSTs it. *Confirm who owns the link target and
   the query-param name `token`.*
5. **Consume returns the SAME `User` shape as `/login`/`/register`** (shared `serialize_user`), including
   `email_verified`. Because consume can CREATE, confirm a freshly-created user serializes identically
   to an existing one (e.g. `first_login_at`, `registration_order`, `email_verified` are all present /
   `allow_none` as the existing `User` type expects). *Confirm the serializer is shared and the
   just-created user is fully populated.*
6. **Token transport:** opaque string in the POST body (not header, not path segment). *Confirm.*
7. **Failure semantics:** invalid/expired/already-used token → non-2xx with a `message`/`error` the
   frontend surfaces. A 401 is acceptable (it will NOT deauth, per the `/api/auth/` skip). *Confirm the
   status code and that the path is under `/api/auth/` so the skip applies.*
8. **JWT issuance:** does consume return a `token` in the body (like `/login`/`/google`) for
   cross-service auth, or cookie-only? The client handles both (`if (response.token) storage.setToken`).
   *Confirm.*
9. **Enumeration-safety on the create path:** requesting a link for a *new* email must return the exact
   same generic `200` as for an existing email (no "account created" signal, no different status). This
   is a backend guarantee the frontend depends on for Constraint 3. *Confirm.*

---

## Backwards Compatibility
Fully additive. No existing type shape, hook signature, or api behavior changes; the shipped magic-link,
password, and Google paths are untouched (Constraint 4). Existing consumers (rihla-web, fsdk-starter)
need **zero** changes — they opt in by importing the new hook(s). No `package.json`/subpath change, no
init-pattern wiring.

## Verification
- `npm run build` passes (ESM + CJS).
- `npm test` green, including the new test files and the untouched magic-link tests.
- A consumer can `import { useEmailSignIn, authApi } from 'fsdk-ts'` (and
  `useConsumeEmailSignIn` if built).
- Consume `User` shape verified against the foundation-sdk auth serializer (WP7 doc pass), including a
  freshly-created user.

## Self-Audit (after implementation)
- New pattern introduced? **No** — reuses the magic-link request + consume precedents verbatim.
- Skill checklist gap revealed? **No.**
- foundation-sdk auth `DOMAIN.md` needs the fsdk-ts cross-reference updated (WP7).
- Confirm the unified-vs-separate consume decision (Backend Contract item 2) was reconciled and the
  conditional WPs (WP2b/WP3b) were built or skipped accordingly, with any contract drift folded back
  into WP1/WP2 before merge.
