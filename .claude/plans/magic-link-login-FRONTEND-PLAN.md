# Magic-Link (Passwordless) Login — fsdk-ts (Frontend) Implementation Plan

**Skill path used:** `/fsdk-ts-plan` (repo-local skill, present in this session's catalog and
invoked via the Skill tool). Its Phase 1–6 checklist was followed in full; canonical patterns
were cross-checked against `src/api/auth.ts`, `src/hooks/auth/*` (esp. `usePasswordReset`,
`useGoogleLogin`, `useEmailVerification`, `useGoogleSignIn`), `src/api/foundation-client.ts`,
`src/utils/env.ts`, and `ARCHITECTURE.md`.

**Design baseline (IN-FLIGHT):** This plan is designed **on top of `feat/registration-modernize`**
(the current checked-out branch). It assumes as already-present: `User.email_verified?`, optional
names on `RegisterData`, `authApi.resendVerification()`, `useEmailVerification`, `useGoogleSignIn`,
and `EnvConfig.googleClientId?`. All of those were read live and this plan matches their idioms.

**Sibling backend plan:** A separate agent is planning the foundation-sdk backend. **No backend
plan file existed at planning time.** Every endpoint/shape below is drawn from the coordinator's
stated intended contract and is **provisional** — see the **"Backend Contract Assumptions"**
section, which must be reconciled with the backend plan's contract section BEFORE execution.

---

## Context

Add **passwordless "magic link" login** to fsdk-ts as an **additive, opt-in** alternative to the
existing password and Google paths. fsdk-ts ships **types + api-client method + hooks ONLY — no UI
components** (`ARCHITECTURE.md`: "UI components" are consumer-owned). The library exposes:

1. A **request** step — `authApi.requestMagicLink(email)` + `useMagicLink()` — that asks the
   backend to email a one-time login link. The endpoint is **enumeration-safe**: it always returns
   a generic success regardless of whether the email exists.
2. A **consume** step — `authApi.consumeMagicLink(token)` + `useConsumeMagicLink()` — that posts
   the token from the emailed link, establishes the cookie session like a normal login, and
   updates the shared reactive auth store so the whole app flips to authenticated.

Maps to the foundation-sdk **auth** domain (same domain as login/register/password-reset). No new
foundation-sdk domain; this is an **extension of the existing `auth` module** in both layers.

### Opt-in / additive posture (HARD CONSTRAINT 2)

Magic-link is **never the only option and never auto-forced.** fsdk-ts exposes *capabilities*, not
a rendered login form — so "opt-in" is naturally satisfied: an app that wants magic-link imports
`useMagicLink`/`useConsumeMagicLink` and renders an entry point; an app that doesn't simply never
imports them. Password login (`useLogin`) and Google (`useGoogleSignIn`) remain the primary paths
and are untouched. There is **no env flag and no gating** — unlike `useGoogleSignIn` (which self-
gates on `googleClientId` because it must load Google's script), magic-link needs no per-consumer
secret, so it is always available to import but never rendered unless the app chooses to. This
mirrors how `usePasswordReset` is "available but the app decides whether to surface a Forgot-
password link."

---

## Agnosticism Assessment (Phase 3A — the primary gate)

| Planned export | Verdict | Rationale |
|---|---|---|
| `authApi.requestMagicLink(email)` | Agnostic | Foundation `/api/auth/request-magic-link`, identical shape for every consumer; no product data |
| `authApi.consumeMagicLink(token)` | Agnostic | Foundation consume endpoint; returns the same `User` every consumer already uses |
| `MagicLinkRequestResult` / payload types | Agnostic | Generic `{ success, message }` + a token/email string; no product fields |
| `useMagicLink()` hook | Agnostic | Request state machine over `authApi.requestMagicLink`; no product workflow |
| `useConsumeMagicLink()` hook | Agnostic | Consume + `useAuth().login(user)`; identical to how `useGoogleLogin` funnels into the shared store |
| **A `<MagicLinkForm>` / callback-page component** | **Consumer-only — DO NOT build here** | `ARCHITECTURE.md` puts UI components on the consumer side. The request form and the `/auth/magic-link` callback page are consumer chrome. |

No hardcoded product values, no product-specific endpoints, no init pattern needed (no per-consumer
secret, unlike `googleClientId`). Everything is cleanly agnostic.

---

## Consume-token approach: **hook + api method** (RECOMMENDED), not a bare page

The prompt asks whether consuming the token is a **page-level concern** (the app just navigates the
browser to a backend URL that sets the cookie and redirects) versus a **hook** (`useConsumeMagicLink`
that POSTs the token and refreshes the user). 

**Recommendation: the hook + api-method approach.** The emailed link points at a **consumer-owned
frontend route** (e.g. `/auth/magic-link?token=…`); that page extracts the token and calls
`useConsumeMagicLink().consume(token)`, which POSTs `{ token }` to the consume endpoint and, on
success, calls `useAuth().login(user)`.

**Why (justification):**

1. **It mirrors the codebase's only existing token-in-URL precedent.** `usePasswordReset.confirmReset(token, …)` + `authApi.confirmPasswordReset(token)` already handle a
   token-in-URL flow via a **consumer page that calls an api method** — not by pointing the browser
   at a backend GET. Magic-link consume is the same shape (token from URL → POST → outcome), so it
   should follow the same pattern for consistency.
2. **Consume establishes a session, so the SPA's reactive `authStore` must be updated in-process.**
   `useGoogleLogin` already demonstrates the required move: on success it calls `authLogin(user)`
   (`useAuth().login`), which sets the store + storage and calls `markResolved()`, so **every
   mounted `useAuth` flips to authenticated with no full-page reload.** `useConsumeMagicLink` does
   exactly this. The pure "browser hits a backend URL that sets the cookie then 302s to the SPA"
   alternative works, but the SPA then mounts cold and only discovers the session via `useAuth`'s
   mount revalidation (`getProfile`) — a second round-trip, and fsdk-ts is left with **no consume
   primitive at all** (nothing to test, nothing to export), which fails the brief's request for a
   client/hook against the contract.
3. **Consume can legitimately fail (expired / already-used / invalid token), and the hook exposes
   that as first-class state** the callback page renders ("This link has expired — request a new
   one."). The backend-redirect alternative has to smuggle failure into a redirect query param,
   which is clumsier and untestable in the library.
4. **Testability:** a hook state machine (`isConsuming` / `consumed` / `user` / `error`) is unit-
   testable with `renderHook`, exactly like the existing `useAuth.mount` tests.

**Tradeoff to state for Leo / the backend agent:** this recommendation REQUIRES the consume
endpoint to be a **body-ful POST** (`POST /api/auth/consume-magic-link`, body `{ token }`) that
returns the user JSON **and** sets the session cookie — NOT only a GET link that self-redirects. It
also requires the emailed link to target a **frontend** route the consumer owns, with the token as
a query param, rather than a backend URL. Both are backend/product-contract items flagged below. If
the backend team instead insists on a GET-redirect link (cookie set server-side, browser lands on
the SPA already authenticated), then fsdk-ts ships **only** the request half (`requestMagicLink` +
`useMagicLink`) and the consume half collapses to "the app's landing route calls
`useAuth().refreshUser()`" — no consume api-method/hook needed. **Recommend the POST approach;
fall back only if the backend cannot support it.**

### Request vs consume: two hooks, not one

Unlike `usePasswordReset` (which bundles request+confirm because both are password-page concerns),
magic-link's two steps live on **different pages** (request on the login page; consume on the email
callback page) and have **different dependencies** (consume touches `useAuth`; request does not). So
this plan ships **two hooks** — `useMagicLink` (request) and `useConsumeMagicLink` (consume) — for a
clean separation of concerns. *(Alternative considered: a single `useMagicLink` exposing both
`request` and `consume`, mirroring `usePasswordReset`. Rejected because it forces the request-only
login page to pull in `useAuth`, and muddies the two independent state machines.)*

---

## Work Packages

### WP1 — Types (`src/types/auth.ts`)

Mirror the codebase idiom: existing auth methods take primitives (`email: string`, `token: string`)
and return either inline `{ success: boolean; message: string }` (password-reset) or `User`
(login/google). To satisfy the brief's "request/response types" while matching that idiom, add
**named response types** and keep method args as primitives:

```ts
// Enumeration-safe request response: always a generic success, never reveals
// whether the email exists. Same shape as requestPasswordReset's inline return.
export interface MagicLinkRequestResult {
  success: boolean;
  message: string;
}

// Optional payload aliases (documentation + exportability). Methods may take the
// primitive directly like their siblings; these exist so consumers can type forms.
export interface MagicLinkRequestPayload {
  email: string;
}
export interface ConsumeMagicLinkPayload {
  token: string;
}
```

- **Consume returns `User`** — reuse the existing `User` type and the `AuthResponse<User>` envelope
  already used by `login`/`googleLogin`. **No new consume-response type needed.**
- Decision to confirm at execution: whether to keep the named `MagicLinkRequestResult` or reuse the
  inline `{ success; message }` like `requestPasswordReset`/`resendVerification` do verbatim. Naming
  it is slightly more consumer-friendly and export-visible; the inline form is the strict local
  idiom. **Recommend the named type** (cheap, exported via the barrel, documents the enumeration-
  safe contract). Flag if the reviewer prefers strict inline parity.

### WP2 — API Client (`src/api/auth.ts`)

Add two methods to the existing `authApi` object. Use **`foundationRequest`** (foundation `/api/auth/*`
endpoints, JWT Bearer + `credentials: 'include'` cookie) — the same client every sibling uses.

1. **`requestMagicLink(email: string): Promise<MagicLinkRequestResult>`**
   - Copy `requestPasswordReset` almost verbatim (body-ful POST `{ email }`, returns the message
     envelope). Endpoint: `POST /api/auth/request-magic-link`.
   - Log `info` before/after. **Never** log anything that reveals account existence beyond the email
     already in the request (matches `requestPasswordReset`, which logs `{ email }`).
   - It is enumeration-safe on the backend, so it resolves success even for unknown emails; the
     client does no special-casing.

2. **`consumeMagicLink(token: string): Promise<User>`**
   - Model on `googleLogin`/`login`: `POST /api/auth/consume-magic-link`, body `{ token }`,
     response `AuthResponse<User>`. Guard `if (!response.user) throw`. If `response.token` present,
     `storage.setToken(response.token)` (same cross-service JWT handling as login/google).
   - Return `response.user`. Log `info` with `userId` on success (never log the raw token).

- **401 footgun (verified against `foundation-client.ts`):** both endpoints start with `/api/auth/`,
  so the foundation-client's global 401 interceptor **correctly SKIPS `authStore.deauth()`** for
  them (line ~57: `!endpoint.startsWith('/api/auth/')`). This is the desired behavior: an
  expired/used magic-link token yielding 401 on consume must **not** wipe an existing logged-in
  session. No client change needed — just note it so no one "fixes" the skip. `surfaceToast(data)`
  still fires, so a backend error message reaches the toast surface automatically.

### WP3 — Hook: request (`src/hooks/auth/useMagicLink.ts`)

Model directly on `usePasswordReset`'s `requestReset` half + `useEmailVerification`'s naming. State
machine per the brief: `isSending` / `sent` / `error` / `reset`.

```ts
interface UseMagicLinkReturn {
  request: (email: string) => Promise<void>;
  isSending: boolean;
  sent: boolean;            // true after a successful (enumeration-safe) request
  error: string | null;
  reset: () => void;        // clears sent + error (re-arm the form)
}
```

- `const logger = getLogger('useMagicLink');`
- `request(email)`: `setIsSending(true); setError(null); setSent(false);` → `await authApi.requestMagicLink(email)` → `setSent(true)` → `finally setIsSending(false)`. On catch: set `error` from `err.message`, log `error`, rethrow (matches every sibling hook's rethrow contract).
- `reset()`: `setSent(false); setError(null)` (analogous to `clearError`/`clearSuccess`, combined).
- **No `useAuth` dependency** — request never authenticates.

### WP4 — Hook: consume (`src/hooks/auth/useConsumeMagicLink.ts`)

Model on `useGoogleLogin` (it is the exact precedent: exchange an opaque credential/token → `User`
→ push into the shared auth store).

```ts
interface UseConsumeMagicLinkReturn {
  consume: (token: string) => Promise<User>;
  isConsuming: boolean;
  consumed: boolean;        // true after the session is established
  user: User | null;        // the logged-in user (also in the shared authStore)
  error: string | null;     // e.g. "This link has expired"
  clearError: () => void;
}
```

- `const logger = getLogger('useConsumeMagicLink');`
- `const { login: authLogin } = useAuth();`
- `consume(token)`: `setIsConsuming(true); setError(null);` → `const user = await authApi.consumeMagicLink(token)` → `authLogin(user)` (sets store + storage + `markResolved`, flipping all `useAuth` instances) → `setUser(user); setConsumed(true)` → return `user`. On catch: set `error`, log, rethrow. `finally setIsConsuming(false)`. `useCallback` deps: `[authLogin]` (matches `useGoogleLogin`).
- The consumer's callback page renders around this: read `token` from the URL, call `consume(token)`
  in a `useEffect`, show spinner on `isConsuming`, redirect on `consumed`, show retry on `error`.

### WP5 — Barrel Exports

- **`src/hooks/auth/index.ts`** — append:
  ```ts
  export * from './useMagicLink';
  export * from './useConsumeMagicLink';
  ```
- **Types** — `MagicLinkRequestResult` / payload types are auto-exported: `src/types/index.ts`
  already does `export * from './auth'`. **No edit needed.**
- **API** — `authApi` is already exported via `src/api/index.ts` → `export * from './auth'`; adding
  methods to the existing object needs **no barrel change.**
- **Top-level** — `src/index.ts` → `export * from './hooks'` → `src/hooks/index.ts` → `export * from './auth'`. Chain already carries the new hooks. **No `src/index.ts` edit.**
- **No `package.json` `exports` change** — no new subpath; everything is reachable from the main
  `'fsdk-ts'` import.
- **Collision check:** `useMagicLink`, `useConsumeMagicLink`, `MagicLinkRequestResult`,
  `MagicLinkRequestPayload`, `ConsumeMagicLinkPayload` — none collide with existing exports (grep
  before adding to confirm).

### WP6 — Convention Updates

**None.** No new pattern is introduced — request reuses the `usePasswordReset` state-machine shape;
consume reuses the `useGoogleLogin` → `useAuth().login` funnel. No ARCHITECTURE.md convention change,
no skill-checklist gap. (Documentation table updates are WP7, not a convention change.)

### WP7 — Cross-Layer / Doc Updates (post-implementation)

- **Run `/fsdk-ts-update-docs`** after code lands: it updates the `ARCHITECTURE.md` auth-module
  table (add `requestMagicLink`/`consumeMagicLink`, `useMagicLink`/`useConsumeMagicLink`) and checks
  type-backend parity against the foundation-sdk auth blueprint/serializer.
- **foundation-sdk `auth` DOMAIN.md** cross-reference: add the two fsdk-ts hooks + api methods to
  its "fsdk-ts module" section, once the backend endpoints exist. (Coordinate with the backend
  agent so this lands with the backend plan, not before endpoints are real.)
- **No consumer wiring change required** to adopt: an app just imports the hooks. (Contrast with
  `useGoogleSignIn`, which needed `initEnv({ googleClientId })`. Magic-link needs nothing.)

---

## Cross-Cutting Concerns Summary

### Type-Backend Parity
| Type | Backend Source | Field Convention | Notes |
|------|---------------|------------------|-------|
| `MagicLinkRequestResult` | request-magic-link response | snake/agnostic (`success`, `message`) | Same envelope as password-reset; reconcile field names with backend plan |
| consume → `User` | consume-magic-link response `user` | `snake_case` (existing `User`) | Reuses `AuthResponse<User>` + `serialize_user`; must match the SAME user shape login returns |

### HTTP Client Usage
| API Method | Client | Auth | Endpoint (provisional) |
|-----------|--------|------|------------------------|
| `requestMagicLink` | `foundationRequest` | none needed (public) | `POST /api/auth/request-magic-link` body `{ email }` |
| `consumeMagicLink` | `foundationRequest` | sets cookie + JWT on success | `POST /api/auth/consume-magic-link` body `{ token }` |

### Logging Points
| File | Logger Context | Key Log Points |
|------|----------------|----------------|
| `src/api/auth.ts` (additions) | `auth-api` (existing module logger) | info before/after each method; error via thrown message; **never log token** |
| `src/hooks/auth/useMagicLink.ts` | `useMagicLink` | info on `sent`; error on failure |
| `src/hooks/auth/useConsumeMagicLink.ts` | `useConsumeMagicLink` | info with `userId` on `consumed`; error on failure |

### Error Handling
- Both api methods let `foundationRequest` parse + throw the backend message (it already does
  `data.message || data.error || HTTP status`). Hooks catch, set `error`, log, rethrow — the exact
  sibling contract. Consume's expired/invalid-token 401 surfaces as a normal thrown message and does
  **not** deauth (WP2 note).

---

## Files to Modify
| File | WP | Changes |
|------|----|---------|
| `src/types/auth.ts` | WP1 | Add `MagicLinkRequestResult`, `MagicLinkRequestPayload`, `ConsumeMagicLinkPayload` |
| `src/api/auth.ts` | WP2 | Add `requestMagicLink`, `consumeMagicLink` to `authApi` |
| `src/hooks/auth/useMagicLink.ts` | WP3 | **New file** — request state machine |
| `src/hooks/auth/useConsumeMagicLink.ts` | WP4 | **New file** — consume + `useAuth().login` |
| `src/hooks/auth/index.ts` | WP5 | Two `export *` lines |
| `src/__tests__/magicLink.api.test.ts` | Tests | **New** — api client unit tests |
| `src/__tests__/useMagicLink.test.ts` | Tests | **New** — request hook state machine |
| `src/__tests__/useConsumeMagicLink.test.tsx` | Tests | **New** — consume hook + store update |

## Files to Read Before Implementation
- `ARCHITECTURE.md` (agnosticism boundary — UI components are consumer-owned)
- `src/api/auth.ts` (mirror `requestPasswordReset` + `googleLogin` exactly)
- `src/hooks/auth/usePasswordReset.ts` (request state-machine shape)
- `src/hooks/auth/useGoogleLogin.ts` (consume → `useAuth().login` funnel)
- `src/hooks/auth/useEmailVerification.ts` (naming idiom: `isResending`/`resent`)
- `src/api/foundation-client.ts` (the `/api/auth/` 401-skip discriminator — do NOT break it)
- `src/utils/env.ts` (confirms NO init-pattern/config is needed for magic-link)
- The **backend plan's contract section** (reconcile every item in "Backend Contract Assumptions")
- foundation-sdk auth blueprint + `serialize_user` (confirm the consume `user` shape == login's)

## Implementation Order
1. Types (`src/types/auth.ts`) — no dependencies
2. API client methods (`src/api/auth.ts`) — depends on types
3. Hooks (`useMagicLink`, then `useConsumeMagicLink`) — depend on api + `useAuth`
4. Barrel export lines (`src/hooks/auth/index.ts`)
5. Tests
6. Build + test gate: `npm run build` then `npm test`

---

## Gate Impact & Tests

### Gate commands
- **`npm run build`** — `tsc --build tsconfig.json && tsc --build tsconfig.cjs.json` (ESM + CJS).
  Must pass with zero errors; strict TS. New named types + two hooks are additive and should not
  perturb existing declarations.
- **`npm test`** — `vitest run`. Existing suite must stay green; add the three new files below.

### Tests to add (match existing style — `vitest` + `@testing-library/react`)
1. **`src/__tests__/magicLink.api.test.ts`** — model on `foundation-client.401.test.ts`'s
   `mockFetchOnce`/`globalThis.fetch = vi.fn()` style and mock `../api/response-toast`:
   - `requestMagicLink` POSTs `{ email }` to `/api/auth/request-magic-link` and returns the
     `{ success, message }` envelope; resolves generically for an unknown email (enumeration-safe).
   - `consumeMagicLink` POSTs `{ token }`, returns `response.user`, and calls `storage.setToken`
     when `response.token` is present.
   - `consumeMagicLink` **throws** when `response.user` is missing (missing-user guard).
   - A **401 on consume does NOT clear storage** (asserts the `/api/auth/` skip — mirror test (b)
     in `foundation-client.401.test.ts`).
2. **`src/__tests__/useMagicLink.test.ts`** — `renderHook(() => useMagicLink())`, mock `../api/auth`:
   - Happy path: `isSending` toggles true→false around `request`; `sent` becomes true.
   - Failure: `error` is set from the thrown message; `sent` stays false; the promise rejects.
   - `reset()` clears `sent` and `error`.
3. **`src/__tests__/useConsumeMagicLink.test.tsx`** — model on `useAuth.mount.test.ts`; mock
   `../api/auth` and assert the **shared store update**:
   - Happy path: `consume(token)` resolves the `User`, sets `consumed`/`user`, and a co-mounted
     `useAuth()` reports `isAuthenticated === true` (proves `authLogin` funneled into the store).
   - Failure (expired token): `error` set, `consumed` false, rejection propagates, and a co-mounted
     `useAuth()` is **not** authenticated / not deauthed.

### Negative-requirement note (Phase 3H)
Magic-link does not *gate* access on state, so a full enforcement matrix is out of scope. The one
security-shaped requirement to assert: **a consume failure (invalid/expired/used token) must not
authenticate and must not corrupt an existing session** — covered by the consume failure tests and
the 401-no-deauth api test above. Enumeration-safety is a backend guarantee; the frontend test only
asserts it resolves generically (it cannot prove the backend doesn't leak).

---

## Backend Contract Assumptions (RECONCILE with the backend plan BEFORE execution)

Every item here is **provisional** and taken from the coordinator's stated intent, not a written
backend contract. Confirm each against the backend plan's contract section:

1. **Request endpoint:** `POST /api/auth/request-magic-link`, body `{ email }`, **enumeration-safe**
   → always `200 { success, message }` regardless of whether the email exists. *(Confirm exact
   path, method, body key `email`, and response field names.)*
2. **Consume endpoint is a body-ful POST:** `POST /api/auth/consume-magic-link`, body `{ token }`,
   returning `{ success, user, token? }` (same `AuthResponse<User>` envelope as `login`) **and**
   setting the session cookie. **This is the load-bearing assumption for the recommended hook
   approach** (WP4). If the backend instead ships a **GET self-redirect link** (cookie set server-
   side, browser lands on the SPA), the consume api-method/hook is dropped and the app's landing
   route calls `useAuth().refreshUser()` instead. *(Confirm: POST-with-body vs GET-redirect.)*
3. **The emailed link targets a consumer FRONTEND route** (e.g. `https://app/auth/magic-link?token=…`),
   NOT a backend URL — the frontend extracts the token and POSTs it. *(Confirm who owns the link
   target and the query-param name `token`.)*
4. **Consume returns the SAME `User` shape as `login`/`register`** (via `serialize_user`), including
   `email_verified` from the registration-modernize branch. *(Confirm the serializer is shared.)*
5. **Token transport:** token is an opaque string passed in the POST body (not a header, not a path
   segment). *(Confirm.)*
6. **Failure semantics:** invalid/expired/already-used token → non-2xx with a `message`/`error` the
   frontend surfaces. A 401 is acceptable (it will NOT deauth, per the `/api/auth/` skip). *(Confirm
   the status code and that it's under `/api/auth/` so the skip applies.)*
7. **JWT issuance:** does consume return a `token` in the body (like `login`/`google`) for cross-
   service auth, or cookie-only? The client handles both (`if (response.token) storage.setToken`).
   *(Confirm.)*

---

## Backwards Compatibility
Fully additive. No existing type shape, hook signature, or api behavior changes. Existing consumers
(rihla-web, fsdk-starter) need **zero** changes; they opt in by importing the new hooks. No
`package.json`/subpath change, no init-pattern wiring.

## Verification
- `npm run build` passes (ESM + CJS).
- `npm test` green, including the three new test files.
- A consumer can `import { useMagicLink, useConsumeMagicLink, authApi } from 'fsdk-ts'`.
- Consume `User` shape verified against the foundation-sdk auth serializer (WP7 doc pass).

## Self-Audit (after implementation)
- New pattern introduced? **No** — reuses password-reset + google-login precedents.
- Skill checklist gap revealed? **No.**
- foundation-sdk auth `DOMAIN.md` needs the fsdk-ts cross-reference updated (WP7).
- Confirm every "Backend Contract Assumptions" item was reconciled and any drift folded back into
  WP1/WP2 before merge.
