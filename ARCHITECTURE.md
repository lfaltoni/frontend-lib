# fsdk-ts Architecture

## What This Library Is

fsdk-ts is the **React companion to foundation-sdk**. Where foundation-sdk provides backend services (auth, media, billing, reviews, etc.) as a Python library, fsdk-ts provides the corresponding React hooks, API clients, and TypeScript types for any frontend that consumes those services.

**Any app built on foundation-sdk should use fsdk-ts for its frontend.** It is not specific to any single product — it provides the primitives that every foundation-sdk consumer needs.

## What Goes in fsdk-ts vs. Consumer Apps

This is the most important architectural decision in the library.

### fsdk-ts owns (agnostic)

Code that maps directly to a **foundation-sdk domain** or is **universally useful infrastructure**:

- **Auth** — login, register, logout, password reset, Google SSO, session management
- **User/Profile** — profile CRUD, avatar upload
- **Media** — generic entity-based upload/gallery (any entity type, any entity ID)
- **Reviews** — polymorphic reviews (any `targetTable`/`targetId`)
- **Billing** — Stripe subscription management (decoupled via `initBillingApi()`)
- **Content** — pipeline rule management (CRUD, toggle, test, stats, sources, senders) for content ingestion filtering
- **HTTP clients** — `apiRequest` (CSRF-aware), `foundationRequest`, `ApiError`
- **Utilities** — structured logging, localStorage helpers, env config, pagination, SEO JSON-LD generators
- **Server utilities** — rate limiting, IP extraction
- **Email** — nodemailer wrapper for server-side email sending

**Rule of thumb:** if the code would work identically for a hotel booking app, a SaaS dashboard, and an activity marketplace, it belongs here.

### Consumer apps own (domain-specific)

Code that encodes **product-specific domain knowledge**:

- Domain models and types (e.g., `Experience`, `Booking`, `Slot`, `GiftCard`)
- API clients for product-specific endpoints (e.g., `/api/v1/experiences/`)
- Hooks that orchestrate product-specific workflows (e.g., `useBooking`, `useAvailability`)
- Product-specific utilities (e.g., currency with hardcoded AED base, experience JSON-LD)
- UI components

**Rule of thumb:** if a different product built on foundation-sdk would need different types, different endpoints, or different business logic, it belongs in the consumer app.

### Grey areas

Some things feel generic but carry hidden product assumptions:

| Feature | Verdict | Why |
|---------|---------|-----|
| Newsletter subscription | Consumer | The endpoint shape and fields are product-specific |
| Currency formatting | Consumer | Base currency and exchange rates are product-specific |
| Gift card scoping | Consumer | `'platform' \| 'provider' \| 'experience'` is a product hierarchy |
| Slot-based availability | Consumer | Not all products use time slots |

When in doubt, start in the consumer app. It's easy to promote code to fsdk-ts later; extracting code that leaked in is harder.

## Module Reference

### API Clients (`src/api/`)

Two base HTTP clients that all API modules build on:

| Client | File | Purpose | Auth |
|--------|------|---------|------|
| `apiRequest` | `client.ts` | Requests to the consumer app's backend (`:5000`) | CSRF token (auto-fetched) |
| `foundationRequest` | `foundation-client.ts` | Requests to foundation-sdk's backend (`:5001`) | `credentials: 'include'` (cookies) + JWT Bearer if token exists in localStorage |

Both read their base URLs from `utils/env.ts` (configurable via `window.__API_URL__` / `window.__FOUNDATION_URL__` or env vars).

**401 de-auth funnel.** Both base clients call `authStore.deauth()` (see below) when a response is `401` for any endpoint whose path does **not** start with `/api/auth/`. The `/api/auth/*` exclusion is deliberate: those endpoints legitimately 401 on bad credentials (e.g. a wrong-password typo) and must not wipe an existing session. This single funnel enforces account-disable / force-logout: the backend re-checks `active` per request, so a disabled user's JWT yields 401 on any protected endpoint → `deauth()` clears the stale session and notifies every `useAuth` instance → `useRequireAuth` redirects to login. The clients **only clear state**; they never navigate (navigation is owned by `useRequireAuth`, so a full-page `window.location.assign` does not fight the client-side router).

> **Caveat:** `apiRequest` (`:5000`, the consumer backend) now de-auths on **any** non-`/api/auth/` 401, not just foundation-auth failures. A consumer-backend endpoint that returns 401 for a non-session reason (e.g. a resource-level permission denial) will also force a global logout. Consumer backends should return 403 (not 401) for authorization failures that should not end the session.

Domain API modules:

| Module | File | Base Client | Endpoints |
|--------|------|-------------|-----------|
| `authApi` | `auth.ts` | `foundationRequest` | `/api/auth/*` (login, register, logout, password reset, Google) |
| `profileApi` | `profile.ts` | `foundationRequest` | `/api/users/profile` (get, update) |
| `mediaApi` | `media.ts` | direct fetch | `/api/media/*` (upload, gallery, delete, reorder, set primary) |
| `reviewsApi` | `reviews.ts` | `foundationRequest` | `/api/reviews/*` (CRUD, helpful votes, replies, flagging) |
| `billingApi` | `billing.ts` | configurable | Stripe subscriptions (checkout, portal, status) |
| `mfaApi` | `mfa.ts` | `foundationRequest` | `/api/mfa/*` (status, enroll, confirm, unenroll, challenge, verify) |
| `auditApi` | `audit.ts` | `foundationRequest` | `/api/admin/audit/*` (query, actor timeline, entity history) |
| `invitesApi` | `invites.ts` | `foundationRequest` | `/api/admin/invites/*` + `/api/invites/*` (CRUD, validate, consume) |
| `adminApi` | `admin.ts` | `foundationRequest` | `/api/admin/users/*` (list, detail, status, resend MFA) |
| `contentPipelineApi` | `content.ts` | `foundationRequest` | `/api/content/*` (pipeline rules CRUD, toggle, test, stats, sources, senders) |
| `sessionsApi` | `sessions.ts` | `foundationRequest` | `/api/sessions/*` (list, revoke one, revoke-all / log out everywhere) |

`billingApi` is special — it uses `initBillingApi(requestFn, urlPrefix)` so the consumer can configure which HTTP client and URL prefix to use. This is the pattern to follow for any module that might talk to different backends in different products.

#### Auth store (`auth-store.ts`)

| Module | File | Purpose |
|--------|------|---------|
| `authStore` | `auth-store.ts` | Module-level subscribable singleton — the **single reactive source of truth for auth state** across the app |

`authStore` holds `{ user, authResolved }` and is exposed to React via `useSyncExternalStore` (consumed by `useAuth`), **not** a React Context provider — so every call site observes the same state with no provider wiring. It imports only `storage`, `logging`, and the `User` type; it **must not** import the HTTP clients or `profileApi` (the clients import the store to funnel 401s, so importing them back would create a cycle — backend revalidation lives in the hook layer, not here).

| Method | Purpose |
|--------|---------|
| `getSnapshot()` | Current client snapshot (stable identity until a real change) |
| `getServerSnapshot()` | Constant frozen `{ user: null, authResolved: false }` for SSR — same object identity every call so `useSyncExternalStore` never loops |
| `subscribe(listener)` | Register a listener; returns an unsubscribe fn |
| `setUser(user)` | Authenticate / refresh the current user (does not touch `authResolved`) |
| `deauth()` | Force logout: clear stored user + JWT, set `user: null`, mark resolved, notify. Called by both HTTP clients on a protected-endpoint 401 and by `useAuth.logout()` |
| `markResolved()` | Mark auth state as definitively settled (revalidation finished) |

The initial client snapshot is seeded synchronously from `localStorage` (`authResolved: false`) so the first render already knows the optimistic auth state and guards don't flicker. `authResolved` flips `true` only after backend revalidation settles; until then `user` is the optimistic seed and must **not** be trusted to mean "definitively unauthenticated".

### React Hooks (`src/hooks/`)

| Hook | File | Purpose |
|------|------|---------|
| `useAuth()` | `auth/useAuth.ts` | Auth state: `user`, `isLoading`, `error`, `isAuthenticated`, `authResolved`, `login()`, `logout()`, `refreshUser()`, `clearError()`. Thin `useSyncExternalStore` wrapper over `authStore`; revalidates via `profileApi.getProfile` on mount + window-focus + visibilitychange (deduped by a module-level in-flight promise) |
| `useRequireAuth()` | `auth/useRequireAuth.ts` | Route guard: redirects to `envConfig.loginPath` (or calls `onUnauthenticated`) **once** auth resolves to unauthenticated; never fires during the optimistic phase. Returns `{ isAuthenticated, isLoading }` |
| `useLogin()` | `auth/useLogin.ts` | Login form: `login()`, `register()`, `isLoading`, `error` |
| `useRegister()` | `auth/useRegister.ts` | Registration form (delegates to `useLogin`) |
| `useGoogleLogin()` | `auth/useGoogleLogin.ts` | Google Identity Services: `googleLogin(credential)` |
| `usePasswordReset()` | `auth/usePasswordReset.ts` | Password reset flow: `requestReset()`, `confirmReset()` |
| `useUser()` | `account/useUser.ts` | User data: `loadUser()`, `updateUser()`, `clearUser()` |
| `useProfile()` | `account/useProfile.ts` | Profile data + updates |
| `useProfilePicture()` | `account/useProfilePicture.ts` | Avatar upload: `uploadProfilePicture()`, `handleFileSelect()` |
| `useAccount()` | `useAccount.ts` | Composite: combines useUser + useProfile + useProfilePicture |
| `useReviews()` | `reviews/useReviews.ts` | Reviews for any entity: CRUD, replies, helpful votes, pagination |
| `useBilling()` | `billing/useBilling.ts` | Subscription state + actions: `checkout()`, `manageSubscription()` |
| `useMfa()` | `mfa/useMfa.ts` | MFA enrollment + challenges: `beginEnrollment()`, `confirmEnrollment()`, `unenroll()`, `sendChallenge()`, `verifyChallenge()`. Auto-fetches status. |
| `useAudit()` | `audit/useAudit.ts` | Audit log queries: `query()`, `getActorTimeline()`, `getEntityHistory()`. Manual trigger. |
| `useInvites()` | `invites/useInvites.ts` | Platform invite management: `create()`, `listAll()`, `listPending()`, `revoke()`, `validate()`, `consume()`. Manual trigger. |
| `useAdmin()` | `admin/useAdmin.ts` | Admin user management: `listUsers()`, `getUserDetail()`, `setAccountStatus()`, `resendMfa()`. Manual trigger. |
| `useContentPipeline()` | `content/useContentPipeline.ts` | Content pipeline rule management: `listRules()`, `createRule()`, `updateRule()`, `deleteRule()`, `toggleRule()`, `testRules()`, `getStats()`, `getSources()`, `getSenders()`. Manual trigger. |
| `useSessions()` | `sessions/useSessions.ts` | Active session / device management: `sessions`, `isLoading`, `error`, `clearError()`, `refresh()`, `revoke(sid)`, `revokeAll(req?)`. Auto-fetches on mount; refetches after revoke / revokeAll. |

### Type Definitions (`src/types/`)

| File | Key Exports | Maps to |
|------|-------------|---------|
| `auth.ts` | `User`, `AuthState`, `LoginCredentials`, `RegisterData` | foundation-sdk `users` domain |
| `api.ts` | `PaginatedResponse<T>` | Generic pagination envelope |
| `filters.ts` | `FilterOption`, `ActiveFilters`, `CheckboxFilterOption`, `PriceRangeFilterOption`, `SelectNumberFilterOption` | Generic UI filter schema |
| `media.ts` | `MediaItem`, `MediaUploadResponse` | foundation-sdk `media` domain |
| `review.ts` | `Review`, `ReviewListResponse`, `ReviewStatsResponse`, `CreateReviewRequest`, etc. | foundation-sdk `reviews` domain |
| `billing.ts` | `Subscription`, `BillingSummary`, `AvailablePlan`, `BillingApi`, `PlanTier` | foundation-sdk `billing` domain |
| `mfa.ts` | `MfaStatusResponse`, `MfaResultResponse`, `MfaEnrollRequest`, `MfaCodeRequest` | foundation-sdk `mfa` domain |
| `audit.ts` | `AuditEntry`, `AuditPageResponse`, `AuditQueryParams`, `AuditPaginationMeta` | foundation-sdk `audit` domain |
| `invite.ts` | `PlatformInvite`, `InviteListResponse`, `InviteValidateResponse`, `InviteCreateRequest` | foundation-sdk `invites` domain |
| `admin.ts` | `AdminUser`, `AdminUserDetail`, `AdminUserListResponse`, `AdminUserListParams` | foundation-sdk `admin` domain |
| `content.ts` | `PipelineRuleType`, `FrequencyCapScope`, `ContentPipelineRule`, `CreatePipelineRuleRequest`, `UpdatePipelineRuleRequest`, `TestPipelineRuleParams`, `TestPipelineRuleResponse`, `ContentStats`, `KnownSender`, `ContentSendersResponse` | foundation-sdk `content` domain |
| `validation.ts` | `ValidationResult` | foundation-sdk `email/validation.py` + `phone_verification/service.py` |
| `session.ts` | `Session`, `SessionListResponse`, `RevokeAllRequest`, `SessionMessageResponse` | foundation-sdk `sessions` domain |

### Utilities (`src/utils/`)

| File | Key Exports | Purpose |
|------|-------------|---------|
| `logging.ts` | `getLogger(context)`, `FrontendLogger` | Structured logging with levels, localStorage export, `window.getFrontendLogs()` |
| `storage.ts` | `storage` object | User + JWT token persistence in localStorage |
| `env.ts` | `getEnvConfig()`, `envConfig` | Base URLs for API and Foundation backends (configurable via window globals or env vars) |
| `pagination.ts` | `computePaginationPages()`, `computeTotalPages()` | Pagination UI logic (page numbers with gaps) |
| `seo.ts` | `generateOrganizationJsonLd()`, `generateBreadcrumbJsonLd()`, `generateArticleJsonLd()`, `generateFAQJsonLd()` | Schema.org JSON-LD generators (no framework dependency) |
| `validation.ts` | `validateEmail()`, `normalizeEmail()`, `validatePhone()`, `normalizePhone()` | Email and phone validation/normalization — mirrors foundation-sdk backend logic |

### Toast Notifications (`src/toast/`)

React context-based toast notification system. Mirrors Bookease-pro's production toast tiers and timing (4 types, 3 severity tiers, hover-pause, dismissable). This is the first React component and context provider in fsdk-ts.

| File | Key Exports | Purpose |
|------|-------------|---------|
| `types.ts` | `ToastType`, `ToastTier`, `ToastOptions`, `UseToastReturn` | Toast type definitions |
| `ToastProvider.tsx` | `ToastProvider`, `showToast`, `showToastSuccess`, `showToastError`, `showToastWarning`, `showToastInfo` | Context provider + rendering + module-level access for API interceptors |
| `useToast.ts` | `useToast()` | Hook returning `{ show, success, error, warning, info }` |
| `index.ts` | barrel | Re-exports all public API |

**Tier configuration:**

| Type | Tier | Duration | Dismissable | Hover Pause |
|------|------|----------|-------------|-------------|
| error | critical | 15s | yes | yes |
| success | standard | 8s | yes | yes |
| warning | standard | 10s | yes | yes |
| info | transient | 5s | no | no |

**Consumer setup:** Wrap app root with `<ToastProvider>`, use `useToast()` in components, use `showToast()` / `showToastError()` etc. from API interceptors (non-component code). Override styling via CSS custom properties (`--fsdk-toast-success-color`, `--fsdk-toast-radius`, etc.).

### Server Modules (`src/server/`)

Server-only code, never bundled into client builds:

| File | Key Exports | Purpose |
|------|-------------|---------|
| `rate-limit.ts` | `createRateLimiter(options)`, `getClientIp(request)` | Sliding-window rate limiting for Next.js API routes |

### Email Module (`src/email/`)

Server-only email sending:

| File | Key Exports | Purpose |
|------|-------------|---------|
| `email-service.ts` | `sendEmail(options)` | Nodemailer wrapper, reads SMTP config from env vars at runtime |
| `types.ts` | `EmailOptions`, `SmtpConfig` | Type definitions for email configuration |

## Package Exports

The library uses conditional exports in `package.json` to support tree-shaking and server/client separation:

| Import Path | What You Get | Environment |
|-------------|-------------|-------------|
| `fsdk-ts` | Everything (hooks, API clients, types, utils) | Client |
| `fsdk-ts/types` | Type definitions only | Any |
| `fsdk-ts/utils/pagination` | Pagination utilities only | Any |
| `fsdk-ts/seo` | SEO JSON-LD generators | Any |
| `fsdk-ts/email` | Email service | Server only |
| `fsdk-ts/server` | Rate limiting | Server only |

## Conventions

### Adding a new foundation-sdk domain to fsdk-ts

When foundation-sdk adds a new domain (e.g., `foundation/notifications/`), fsdk-ts should get:

1. **Types** in `src/types/<domain>.ts` — mirrors the domain's models
2. **API client** in `src/api/<domain>.ts` — wraps the domain's HTTP endpoints
3. **Hook** in `src/hooks/<domain>/use<Domain>.ts` — React state management for the domain
4. **Barrel exports** — add re-exports to `types/index.ts`, `api/index.ts`, `hooks/index.ts`

Follow existing patterns — read `api/reviews.ts` and `hooks/reviews/useReviews.ts` as the canonical example of a well-structured domain module.

### Error handling

- API clients throw `ApiError` for non-2xx responses
- Hooks catch `ApiError` and expose `error` state
- Consumer components read `error` from hooks, never catch API errors directly

### Logging

Every API client and hook uses `getLogger(context)`:
```typescript
const logger = getLogger('moduleName')
logger.info('Action completed', { entityId: '123' })
```

Logs are stored in localStorage and can be exported via `window.getFrontendLogs()` for debugging.

## Environment Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` or `window.__API_URL__` | `http://localhost:5000` | Consumer app backend (used by `apiRequest`) |
| `NEXT_PUBLIC_FOUNDATION_URL` or `window.__FOUNDATION_URL__` | `http://localhost:5001` | Foundation SDK backend (used by `foundationRequest`) |
| `window.__LOGIN_PATH__` | `/login` | Route the app is sent to after a forced (401) logout — used by `useRequireAuth`'s default redirect. Override if login is mounted at a non-default path |

Defaults are dev-mode convenience values. Consumer apps override these via environment variables or window globals.

## Consumer Integration Notes

Architectural patterns that consumer apps need to be aware of when integrating fsdk-ts with a foundation-sdk backend.

### Auth State: Shared Store, No Provider

Auth state lives in a module-level singleton (`authStore`, `src/api/auth-store.ts`) exposed to React via `useSyncExternalStore`. **There is no Context provider to mount** — every `useAuth()` call site observes the exact same state, so components can never disagree about whether the user is authenticated. `login`/`logout`/`refreshUser` mutate the shared store; an HTTP-client 401 de-auths it (see the 401 de-auth funnel under API Clients).

The store seeds `user` synchronously from localStorage on first render (optimistic), then revalidates against the backend (`profileApi.getProfile`) on mount and on window focus / visibility change, deduped to at most one in-flight request. The `authResolved` flag is `false` until that revalidation settles.

**Two-flag contract for guards:**
- `authResolved === false` → still resolving; treat as **loading**, render a loader, do **not** redirect. `user` is only the optimistic seed and must not be read as "definitively unauthenticated".
- `authResolved === true && !isAuthenticated` → definitively logged out; safe to redirect.

**Protecting routes:** wrap protected pages/layouts with a guard that calls `useRequireAuth()`. It gates the redirect on `authResolved` (never kicks a valid user on first paint, never acts during the optimistic phase) and fires the redirect at most once. By default it does a full-page `window.location.assign(envConfig.loginPath)`; pass `onUnauthenticated` to use client-side navigation (e.g. Next.js `router.push`) instead:

```tsx
function ProtectedLayout({ children }) {
  const router = useRouter();
  const { isLoading } = useRequireAuth({ onUnauthenticated: () => router.push('/login') });
  if (isLoading) return <Spinner />;        // authResolved === false
  return children;                          // resolved + authenticated
}
```

If you see flash-redirects after login, verify that `login()` is called (which sets the store and marks it resolved) before navigation, and that the guard reads `authResolved` rather than acting on the optimistic `user` value.

### SSR / getServerSnapshot

`authStore.getServerSnapshot()` returns a frozen, constant `{ user: null, authResolved: false }`. On the server every user renders as unresolved-and-unauthenticated, which keeps server and first client render consistent (no hydration mismatch) and means `useRequireAuth` reports `isLoading` (not "unauthenticated") on the server — protected content stays gated until the client resolves auth. Because the object identity is constant, `useSyncExternalStore` never enters an infinite loop during SSR.

### JWT Bearer Auth vs Flask-Login Sessions

`foundationRequest` sends both `credentials: 'include'` (so browser cookies are attached) and a JWT Bearer token if one exists in localStorage. This means it works for two auth strategies without any configuration:

- **Same-origin apps** (e.g., blogmachine — frontend served by or proxied to the same backend): Cookies are sent automatically. No JWT needed. `foundationRequest` works out of the box.
- **Cross-origin apps** (e.g., frontend on `:3000`, backend on `:5001`): Session cookies won't survive `SameSite` policies (requires HTTPS in dev). The JWT Bearer token handles auth instead.

For cross-origin setups, foundation-sdk blueprints use Flask-Login's `@login_required` which checks session cookies. Consumer apps must bridge JWT tokens to Flask-Login sessions. foundation-sdk provides a one-liner for this:

```python
from foundation.auth.jwt import configure_jwt_session_bridge
configure_jwt_session_bridge(app)  # after login_manager.init_app(app)
```

This installs a `before_request` hook that decodes the JWT and calls `login_user()`, so all `@login_required` decorators work transparently. Same-origin apps don't need this — cookies handle everything.

### Optional Domains and 404s

foundation-sdk domains like MFA, billing, and tenancy are opt-in. When not configured, their blueprints are not registered, so endpoints return 404. Frontend code using hooks for optional domains (`useMfa`, `useBilling`) should handle 404 responses gracefully — display a "not configured" message rather than a generic error.

### Media Gallery 404 on Empty

The media blueprint returns 404 when no media exists for an entity, rather than 200 with an empty array. Frontend code calling `mediaApi.getGallery()` should catch 404 and treat it as an empty gallery.

### User vs Profile: What's Editable

The `User` model (`first_name`, `last_name`, `email`, `platform_role`) is set at registration and not editable by the user through the profile API. The `PUT /api/users/profile` endpoint only updates `profile_data` — a flexible JSON blob stored on `UserProfile` (e.g., bio, phone, preferences).

**Consumer apps must treat User fields as read-only on the profile page.** Display `first_name`, `last_name`, and `email` as static text. Use `updateProfile()` from `useAccount` to save editable `profile_data` fields.

The `updateUser()` function on `useUser` is a **local state setter only** — it writes to localStorage but does not call any API. It exists for internal use (e.g., `useAuth.login()` storing the user after login). Do not use it for profile editing — changes will appear to save but will be lost on page reload.

**Correct pattern for profile pages:**
```tsx
const { user, profile, updateProfile } = useAccount()

// Display user fields as read-only
<p>{user?.first_name} {user?.last_name}</p>
<p>{user?.email}</p>

// Edit profile_data fields
await updateProfile({ ...profile, bio, phone })
```

## Headless Data Table Infrastructure (`src/table/`)

Server-side table hooks powered by [TanStack Table](https://tanstack.com/table) (peer dependency, optional).

**Architecture:**

```
@tanstack/react-table (peer dep — headless engine)
    ↑
useServerTable<T> (generic hook — pagination, filters, sorting, expansion, loading/error)
    ↑
Domain wrappers (useAuditTable, future: useAdminUsersTable, etc.)
    ↑
Consumer app (renders columns using whatever UI library it wants)
```

**What fsdk-ts provides:**
- `useServerTable<T>` — generic hook wrapping TanStack Table for server-side data
- `useAuditTable()` — audit domain wrapper with default columns and `auditApi.query` fetch adapter
- `auditColumns` — individual column definitions, cherry-pickable for custom layouts
- `extractAuditChanges(entry)` — pure utility to parse `extra_data.changes` into `{field, before, after}[]`
- Re-exports of key TanStack types: `ColumnDef`, `SortingState`, `flexRender`, `createColumnHelper`, etc.

**What consumer apps provide:**
- All rendering — table markup, cell components, filter UI, pagination controls, styling
- Product-specific table hooks following the same pattern (e.g., `useJobListingsTable()`)
- Choice of UI library (shadcn, raw HTML, anything)

### useServerTable<T> API

```typescript
const { table, isLoading, error, clearError, total, refetch, filters, setFilter, clearFilters, hasActiveFilters } =
  useServerTable<MyRow>({
    fetchFn: async (params) => {
      // params: { page (1-based), pageSize, sorting, filters }
      const res = await myApi.list({ page: params.page, per_page: params.pageSize, ...params.filters });
      return { data: res.items, total: res.total, pageCount: Math.ceil(res.total / params.pageSize) };
    },
    columns: myColumns,
    initialPageSize: 25,
    enableSorting: true,    // opt-in, default false
    enableExpanding: true,  // opt-in, default false
    getRowCanExpand: (row) => !!row.original.details,
  });
```

### useAuditTable() API

```typescript
// Default — uses auditApi.query (foundationRequest)
const { table, isLoading, setFilter } = useAuditTable();

// Monolithic apps — pass own fetch function
const { table } = useAuditTable({
  fetchFn: (params) => myApiRequest(`/admin/audit/?page=${params.page}&per_page=${params.per_page}`),
});

// Custom columns
const { table } = useAuditTable({
  columns: [auditColumns.time, auditColumns.action, myCustomColumn],
});
```

### Adding a new domain table wrapper

Follow the `useAuditTable` pattern:

1. Create `src/table/use<Domain>Table.ts`
2. Define default columns via `createColumnHelper<MyEntity>()`
3. Write a fetch adapter that maps `ServerTableFetchParams` to your domain's API
4. Call `useServerTable<MyEntity>()` with the adapter and columns
5. Export from `src/table/index.ts`

### Design decisions

- **Page numbers are 1-based** in `ServerTableFetchParams` — the hook converts from TanStack's 0-based `pageIndex` internally. Domain adapters receive natural page numbers.
- **Filters are a plain `Record<string, unknown>`** — simpler than TanStack's `ColumnFiltersState` and matches how backend APIs accept filter params.
- **`@tanstack/react-table` is an optional peer dep** — consumers that don't use table hooks don't need it installed.
- **Stale request protection** via `useRef` counter — prevents race conditions when pagination/filters change rapidly.
- **`fetchFn` is stored in a ref** — prevents infinite re-fetch loops when the function reference changes.

| File | Purpose |
|------|---------|
| `src/table/types.ts` | Generic types + TanStack re-exports |
| `src/table/useServerTable.ts` | Generic hook |
| `src/table/useAuditTable.ts` | Audit domain wrapper + `auditColumns` |
| `src/table/audit-utils.ts` | `extractAuditChanges()` pure utility |
| `src/table/index.ts` | Barrel exports |

## Migration Complete (2026-03-31)

The following Rihla-specific modules were extracted to the Rihla consumer app (`rihla-web/frontend/chisfis-nextjs/src/lib/`). They now import agnostic utilities (logging, HTTP clients, `ApiError`) from fsdk-ts.

| Moved Module | Now at `src/lib/` | Why it's product-specific |
|--------|-------------|--------------------------|
| `types/experience.ts` | `types/experience.ts` | Experience listing model |
| `types/booking.ts` | `types/booking.ts` | Reservation tied to experience handles |
| `types/slot.ts` | `types/slot.ts` | Time-slot availability |
| `types/giftcard.ts` | `types/giftcard.ts` | Gift card scoping |
| `api/experiences.ts` | `api/experiences.ts` | Experience-specific endpoints |
| `api/booking.ts` | `api/booking.ts` | Booking flow endpoints |
| `api/slots.ts` | `api/slots.ts` | Slot availability endpoints |
| `api/giftcards.ts` | `api/giftcards.ts` | Gift card endpoints |
| `api/communications.ts` | `api/communications.ts` | Newsletter/host registration |
| `hooks/*/useAvailability.ts` | `hooks/useAvailability.ts` | Slot-based availability |
| `hooks/*/useBooking.ts` | `hooks/useBooking.ts` | Booking workflow |
| `hooks/*/useMyBookings.ts` | `hooks/useMyBookings.ts` | User's bookings list |
| `hooks/*/useGiftCard.ts` | `hooks/useGiftCard.ts` | Gift card operations |
| `hooks/*/useCurrency.tsx` | `hooks/useCurrency.tsx` | AED-based currency provider |
| `utils/currency.ts` | `utils/currency.ts` | Hardcoded AED base + GCC exchange rates |
| `seo.ts` (`generateExperienceJsonLd`) | `utils/seo-experience.ts` | Uses experience types |
