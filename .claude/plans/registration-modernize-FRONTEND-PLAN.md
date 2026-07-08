# Registration Modernization — fsdk-ts (Frontend) Implementation Plan

**Skill path used:** `/fsdk-ts-plan` (repo-local skill, invoked via the Skill tool; it
loaded after the first file-touch and was followed in full). Canonical patterns cross-checked
against `src/api/auth.ts`, `src/hooks/auth/*`, `ARCHITECTURE.md`, and the foundation-sdk auth /
social_auth blueprints + `serialize_user`.

**Sibling backend plan:** `foundation-sdk/.claude/plans/registration-modernize-BACKEND-PLAN.md`
was **not present** at planning time. All backend-contract assumptions below are drawn from
reading the live backend and are flagged in **"Backend Contract Items to Confirm."**

---

## Context

Modernize the registration/sign-in surface in fsdk-ts to mirror the backend deltas:
(1) first/last name become **optional** on register; (2) **"Continue with Google"** becomes a
first-class, default-available path (the `POST /api/auth/google` endpoint already exists);
(3) the user object surfaces **`email_verified`** so consumers can show a non-blocking
"verify your email" banner and trigger a resend.

**Important — much of this already exists.** The Google API method (`authApi.googleLogin`),
the `useGoogleLogin` hook, and `useRegister` are all already implemented. The real deltas are
narrower than the brief implies: type relaxation, a headless GIS-loader hook, an env-config
field, an `email_verified` field (+ a `toUser` propagation fix), and a resend method + hook.

---

## Agnosticism Assessment

| Planned export | Verdict | Rationale |
|---|---|---|
| `RegisterData` names optional | Agnostic | Any consumer's signup form may omit names |
| `User.email_verified` | Agnostic | Every foundation-sdk consumer has email verification |
| `authApi.resendVerification()` | Agnostic | Foundation endpoint, same shape for all consumers |
| `authApi.googleLogin()` (exists) | Agnostic | Foundation `/api/auth/google`, same for all |
| `useEmailVerification` hook | Agnostic | Derives state from shared `useAuth`; no product logic |
| `useGoogleSignIn` (new headless GIS hook) | Agnostic | Loads Google Identity Services script + wires callback → `googleLogin`; no product UI |
| `googleClientId` in `EnvConfig` | Agnostic, **init pattern** | Per-consumer value, injected via `initEnv()` like `apiUrl` |
| **`<GoogleSignInButton>` React component** | **Consumer-only — DO NOT build here** | `ARCHITECTURE.md` line 38 lists "UI components" as consumer-owned. See boundary decision below |

### Google button: component-vs-hook boundary decision (the key call)

**Decision: fsdk-ts ships a headless hook (`useGoogleSignIn`), NOT a `<GoogleSignInButton>`
component.** The consumer renders the button.

Why the hook and not a component:
- `ARCHITECTURE.md` explicitly puts "UI components" on the consumer side (line 38). fsdk-ts is
  types/clients/hooks; its only React surface is infra (`ToastProvider`, `DevPanel`), not
  product chrome.
- Google Identity Services (GIS) **renders its own button** via
  `google.accounts.id.renderButton(el, options)` into a DOM node the consumer owns. The
  "button" is not a React component you author — it is Google's. So a wrapper component would
  add almost no value while dragging GIS DOM/script side-effects into fsdk-ts's render layer.
- The genuinely reusable, boilerplate-heavy part is: inject the GIS `<script>` once, call
  `google.accounts.id.initialize({ client_id, callback })`, and forward `response.credential`
  to `authApi.googleLogin`. That is agnostic infra and belongs in a hook.

**Tradeoff (state it for Leo):** a tiny `<GoogleSignInButton>` wrapper would be more turnkey
for consumers (one import, no ref wiring). The cost is breaking the no-product-UI boundary and
owning GIS render/styling props in the lib. The hook keeps the boundary clean at the price of
each consumer writing ~5 lines (a `ref` div + a `useEffect` calling `renderButton(ref)`), which
the hook itself provides as a bound `renderButton` helper. Recommend the hook.

**"Surfaced by default when `googleClientId` is configured":** fsdk-ts exposes the config gate,
not the rendering. `useGoogleSignIn()` reads `getEnvConfig().googleClientId`; when it is unset
it returns `{ available: false }` and no-ops. The consumer conditions its button on
`available`. So "default on" = "the consumer that injects a `googleClientId` gets a working
button with zero extra wiring beyond a ref"; a consumer with no client id renders nothing.

---

## Work Packages

### WP1 — Types (`src/types/auth.ts`)

1. **Names optional on register.** Change `RegisterData`:
   ```ts
   export interface RegisterData extends LoginCredentials {
     first_name?: string;   // was required
     last_name?: string;    // was required
   }
   ```
2. **`email_verified` on `User`.** Add:
   ```ts
   export interface User {
     ...
     email_verified?: boolean;   // mirrors serialize_user() once backend adds it
   }
   ```
   Keep it **optional** (`?`) so the lib stays backwards-compatible with a backend that has not
   yet shipped the field (older/other consumers). `undefined` ⇒ "unknown", treated as
   "don't show the banner" (see WP3 semantics).
3. **Name-nullability check (contract-dependent).** `User.first_name`/`last_name` are currently
   non-null `string`. If the backend can now return `null`/absent names for name-less
   registrations, widen to `first_name?: string` / `last_name?: string`. **Blocked on backend
   confirmation** (see contract items) — do NOT widen speculatively; empty-string `''` needs no
   type change.

Follows the existing plain-interface style in `src/types/auth.ts` (snake_case, mirrors
`UserResponseSchema` / `serialize_user`).

### WP2 — API client (`src/api/auth.ts`)

All methods use `foundationRequest` (JWT Bearer) — these are `/api/auth/*` foundation
endpoints. Logger context stays `'auth-api'`.

1. **`register`** — **no signature change needed.** It already accepts `RegisterData` and
   `JSON.stringify`s it; with names now optional the omitted keys simply aren't sent. Verify the
   backend treats absent `first_name`/`last_name` as "not provided" (contract item).
2. **`googleLogin`** — **already exists** (lines 96–114), posts `{ credential }` to
   `/api/auth/google`, stores the JWT, returns `User`. No change. (Confirm it maps
   `email_verified` through — it returns `response.user` verbatim, so it will, once the backend
   serializes it.)
3. **NEW `resendVerification`** — resend the verification email for the current user:
   ```ts
   resendVerification: async (): Promise<{ success: boolean; message: string }> => {
     logger.info('Requesting verification email resend');
     const response = await foundationRequest<{ success: boolean; message: string }>(
       '/api/auth/resend-verification', { method: 'POST' }
     );
     logger.info('Verification email resend requested');
     return response;
   }
   ```
   Shape mirrors `requestPasswordReset` (message response, no body). **Endpoint path + whether it
   is body-less/current_user-scoped vs. takes `{ email }` is a contract item — see below (the
   resend endpoint does NOT exist in the backend today).**
4. **OPTIONAL `verifyEmail(token)`** — the backend has `POST /api/auth/verify-email/<token>`.
   If consumers want to confirm the emailed link in-app (vs. the backend rendering a page), add:
   ```ts
   verifyEmail: async (token: string): Promise<{ success: boolean; message: string }> =>
     foundationRequest(`/api/auth/verify-email/${encodeURIComponent(token)}`, { method: 'POST' })
   ```
   Include only if the confirm-link is handled client-side (Leo decision).

### WP3 — Hooks

#### WP3a — `src/hooks/auth/useEmailVerification.ts` (NEW)

Headless, non-blocking verify-email UX state. Derives `email_verified` from the shared
`useAuth` user (so it stays in sync with revalidation) and owns only the resend action + a
dismiss flag.

```ts
interface UseEmailVerificationReturn {
  emailVerified: boolean | undefined;   // from useAuth().user?.email_verified
  needsVerification: boolean;            // user present && email_verified === false && !dismissed
  resend: () => Promise<void>;
  isResending: boolean;
  resent: boolean;                       // true after a successful resend (show "sent!")
  error: string | null;
  dismiss: () => void;                   // consumer's "X" on the banner (session-local)
}
```
- `needsVerification` is **false when `email_verified` is `undefined`** (unknown ⇒ don't nag) and
  false when the user is unauthenticated. Only `email_verified === false` triggers it.
- `resend()` calls `authApi.resendVerification()`; sets `resent`, clears on next call.
- `dismiss()` is in-memory (per mount); no persistence in fsdk-ts (consumer may persist).
- Logger: `getLogger('useEmailVerification')`; `info` on resend success, `error` on failure.
- **No banner UI** — the consumer renders the banner and calls `resend`/`dismiss`. Matches the
  toast/table pattern (fsdk-ts owns state; consumer owns markup).

#### WP3b — `src/hooks/auth/useGoogleSignIn.ts` (NEW, headless GIS loader)

Composes the GIS script load + init + credential forwarding, on top of the existing
`useGoogleLogin` (which owns the `googleLogin(credential)` → auth-state update). This hook is
the "render a working Google button by default" primitive.

```ts
interface UseGoogleSignInReturn {
  available: boolean;                 // getEnvConfig().googleClientId is set AND script loaded
  isReady: boolean;                   // GIS script loaded + initialize() called
  renderButton: (el: HTMLElement | null, options?: GsiButtonOptions) => void;
  prompt: () => void;                 // optional One Tap trigger
  isLoading: boolean;                 // from useGoogleLogin (credential exchange in flight)
  error: string | null;              // from useGoogleLogin
}
```
Behavior:
- Reads `getEnvConfig().googleClientId`. If unset → `{ available: false }`, all methods no-op.
- On mount (client-only; guard `typeof window`), injects `https://accounts.google.com/gsi/client`
  **once** (module-level singleton promise, like the visibility-listener install guard in
  `useAuth`), then calls `google.accounts.id.initialize({ client_id, callback })`.
- `callback` receives `{ credential }` and calls the existing `useGoogleLogin().googleLogin(credential)`.
- `renderButton(el, options)` calls `google.accounts.id.renderButton(el, options)` once ready.
- Logger: `getLogger('useGoogleSignIn')`.
- **New dependency check:** do NOT add `@react-oauth/google` or any npm dep — load GIS via a raw
  `<script>` injection. Add a minimal ambient type for the GIS surface (WP1-adjacent, see WP5).

Note: `useGoogleLogin` (existing) is kept and still exported for consumers that own their own
script loading. `useGoogleSignIn` is the batteries-included wrapper.

#### WP3c — `src/hooks/auth/useAuth.ts` — **propagate `email_verified` (REQUIRED, easy to miss)**

`toUser()` (lines 38–47) **hand-copies a whitelist of fields** and currently drops anything not
listed. It runs on every revalidation and `refreshUser`. If `email_verified` is not added here,
the field will be present right after register/login but **silently disappear on the first
background revalidation** — a real bug. Add it:
```ts
function toUser(fresh: User): User {
  return { ...existing fields..., email_verified: fresh.email_verified };
}
```
This is the single most bug-prone spot in the change. No other `useAuth` change needed.

### WP4 — Env config (`src/utils/env.ts`)

Add the Google client id to `EnvConfig` (optional; injected via `initEnv`, live-read via
`getEnvConfig`, exactly like `apiUrl`):
```ts
export interface EnvConfig {
  apiUrl: string;
  foundationUrl: string;
  loginPath: string;
  googleClientId?: string;   // set to enable "Continue with Google"; unset ⇒ hidden
}
```
Default stays unset (fsdk-ts holds no product defaults). Consumer calls
`initEnv({ googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID })`.

### WP5 — Ambient GIS types (`src/types/google.ts`, NEW — optional but recommended)

Minimal `window.google.accounts.id` typings (`initialize`, `renderButton`, `prompt`,
`CredentialResponse`, `GsiButtonOptions`) so `useGoogleSignIn` type-checks without `@types/google.accounts`
(avoids a new devDep; keep it to the surface we use). Export the public option/response types
(`GsiButtonOptions`) via the types barrel so consumers can type their `renderButton` options.

### WP6 — Barrel exports

- `src/hooks/auth/index.ts` — add:
  ```ts
  export * from './useEmailVerification';
  export * from './useGoogleSignIn';
  ```
  (`useGoogleLogin`, `useRegister`, `useAuth` already exported.)
- `src/types/index.ts` — already `export * from './auth'` (covers the new `User`/`RegisterData`
  shape automatically). Add `export * from './google';` **only if** WP5 file is created.
- `src/api/index.ts` — no change (`export * from './auth'` already covers `resendVerification`/
  `verifyEmail` added to the `authApi` object).
- `src/hooks/index.ts` — no change (`export * from './auth'` already re-exports the auth barrel).
- `package.json` `exports` — no change (all reachable via the main `fsdk-ts` entry; no new
  subpath needed).

### WP7 — Cross-layer / docs

- `ARCHITECTURE.md` — add `useEmailVerification` and `useGoogleSignIn` to the hooks table
  (~line 114 region) and note `googleClientId` in the env-config section (~line 244). Run
  `/fsdk-ts-update-docs` after implementation.
- foundation-sdk `foundation/auth/DOMAIN.md` / `foundation/social_auth/DOMAIN.md` — add an
  "fsdk-ts module" cross-reference if they list frontend counterparts (verify during impl).

---

## Cross-Cutting Concerns Summary

### Type-Backend Parity
| Type | Backend Source | Field Convention | Notes |
|---|---|---|---|
| `RegisterData` | `RegistrationRequestSchema` (auth blueprint) | snake_case | names optional pending backend relaxing `required=True, min=1` |
| `User.email_verified` | `serialize_user()` / `UserResponseSchema` (`foundation/auth/schemas.py`) | snake_case | **not present in backend yet** — REG-BACKEND-PLAN must add it |
| `authApi.googleLogin` resp | `LoginResponseSchema` (social_auth) | snake_case | `{ success, message, user, token, is_first_login }` — matches existing |
| resend response | (endpoint TBD) | snake_case | mirror `MessageResponseSchema` `{ success, message }` |

### HTTP Client Usage
| API Method | Client | Auth | Endpoint |
|---|---|---|---|
| `register` | `foundationRequest` | JWT | `POST /api/auth/register` |
| `googleLogin` (exists) | `foundationRequest` | JWT | `POST /api/auth/google` |
| `resendVerification` (new) | `foundationRequest` | JWT (current_user) | `POST /api/auth/resend-verification` *(TBD)* |
| `verifyEmail` (optional) | `foundationRequest` | JWT | `POST /api/auth/verify-email/<token>` |

### Logging Points
| File | Logger Context | Key Log Points |
|---|---|---|
| `src/api/auth.ts` | `auth-api` (exists) | info before/after resend; error in catch |
| `src/hooks/auth/useEmailVerification.ts` | `useEmailVerification` | info on resend success; error on failure |
| `src/hooks/auth/useGoogleSignIn.ts` | `useGoogleSignIn` | info on script load + init; error on load/init failure |

Never log the Google `credential` token or email addresses.

---

## Files to Modify / Create
| File | WP | Change |
|---|---|---|
| `src/types/auth.ts` | WP1 | names optional on `RegisterData`; add `User.email_verified` |
| `src/api/auth.ts` | WP2 | add `resendVerification` (+ optional `verifyEmail`) |
| `src/hooks/auth/useEmailVerification.ts` | WP3a | NEW hook |
| `src/hooks/auth/useGoogleSignIn.ts` | WP3b | NEW headless GIS hook |
| `src/hooks/auth/useAuth.ts` | WP3c | add `email_verified` to `toUser()` |
| `src/utils/env.ts` | WP4 | add `googleClientId?` to `EnvConfig` |
| `src/types/google.ts` | WP5 | NEW ambient GIS types (optional) |
| `src/hooks/auth/index.ts` | WP6 | export the two new hooks |
| `src/types/index.ts` | WP6 | export `./google` (only if WP5 created) |
| `ARCHITECTURE.md` | WP7 | hooks table + env-config note |

## Files to Read Before Implementation
- `ARCHITECTURE.md` (boundary rules, hooks table, env-config §, 401 funnel)
- `src/api/auth.ts`, `src/hooks/auth/useAuth.ts`, `src/hooks/auth/useGoogleLogin.ts`,
  `src/hooks/auth/useRegister.ts` (existing patterns to match)
- `src/utils/env.ts` (init pattern)
- `foundation-sdk/foundation/auth/schemas.py` (`serialize_user`, `UserResponseSchema`)
- `foundation-sdk/foundation/auth/api/smorest_auth_blueprint.py` (register/verify-email)
- `foundation-sdk/foundation/social_auth/api/smorest_social_auth_blueprint.py` (google shape)
- **`foundation-sdk/.claude/plans/registration-modernize-BACKEND-PLAN.md`** when it lands

## Implementation Order
1. `src/types/auth.ts` (+ `src/types/google.ts`) — no deps
2. `src/utils/env.ts` — no deps
3. `src/api/auth.ts` — depends on types
4. `src/hooks/auth/useAuth.ts` `toUser` fix — depends on types
5. `src/hooks/auth/useEmailVerification.ts`, `useGoogleSignIn.ts` — depend on api + env + useAuth
6. Barrels
7. `npm run build` (ESM + CJS) — mandatory

## Backwards Compatibility
Fully additive. `RegisterData` names go from required→optional (widening, non-breaking for
existing forms that still pass them). `User.email_verified` is optional. No hook signatures
change; no existing export is removed. Consumers opt into Google by injecting `googleClientId`.

## Verification
- `npm run build` passes (both ESM and CJS) — the minimum bar.
- `npm test` (`vitest run`) still green; existing auth-store / useAuth tests unaffected by the
  additive `toUser` field. Add a small test asserting `toUser` preserves `email_verified`.
- A consumer can `import { useEmailVerification, useGoogleSignIn } from 'fsdk-ts'` and build.
- Types match backend once REG-BACKEND-PLAN adds `email_verified` to `serialize_user`.

## Backend Contract Items to Confirm (send to REG-BACKEND-PLAN)
1. **`email_verified` is NOT surfaced today.** `UserResponseSchema` and `serialize_user`
   (`foundation/auth/schemas.py`) do not include it. Confirm REG-BACKEND-PLAN adds it to BOTH
   (schema + serializer are the "add a field to both" pair called out in the file's docstring).
2. **Resend-verification endpoint does NOT exist.** The backend only has
   `POST /api/auth/verify-email/<token>` (confirm) — there is no resend route. fsdk-ts's
   `resendVerification()` needs one. Confirm: exact path (`/api/auth/resend-verification`?),
   whether it is **current_user-scoped and body-less** (preferred — JWT/session identifies the
   user) or takes `{ email }`, and the response shape (assumed `{ success, message }`).
3. **Register name-nullability.** After making names optional, does a name-less user serialize
   `first_name`/`last_name` as `''` (empty string) or `null`/absent? This decides whether
   `User.first_name`/`last_name` must widen to optional (WP1 item 3). Empty string ⇒ no type
   change; null/absent ⇒ widen.
4. **Register still returns `token` + auto-establishes a session?** (Confirm the existing
   `RegistrationResponseSchema { success, message, user, token }` contract is unchanged — the
   `useRegister` auto-login flow depends on it.)

## Self-Audit (post-implementation)
- New pattern? `useGoogleSignIn` introduces a **third-party-script-loader hook** pattern (GIS).
  If future domains need script injection, promote a shared `useExternalScript` util to
  `src/utils/` and document in `ARCHITECTURE.md`.
- Skill gap? If script-loading hooks become common, add a "3rd-party script side-effects"
  concern to `/fsdk-ts-plan`.
- foundation-sdk `DOMAIN.md` cross-refs for auth/social_auth updated to name these hooks.
