---
description: Write a detailed implementation plan for a fsdk-ts feature. Ensures cross-cutting concerns (agnosticism, type-backend parity, logging, error handling, barrel exports, multi-layer impact) are evaluated from the start. Detects emergent concerns and checks impact on foundation-sdk and consumer apps. Produces a plan specific enough for a zero-context agent to implement.
---

# /fsdk-ts-plan — fsdk-ts Implementation Planning

## User Input

```text
$ARGUMENTS
```

You **MUST** read the user input carefully — it describes the feature, change, or domain module to plan.

---

## Phase 1: Understand the Request

Before touching any code, answer:

1. **What is this feature?** Summarize in 1-2 sentences.
2. **What foundation-sdk domain does this map to?** (e.g., mfa, audit, invites, teams, notifications). If none, what backend does it consume?
3. **Is this a new domain module, an extension of an existing module, or infrastructure/utility work?**
4. **What are the key entities/models?** List them with their fields.
5. **What API endpoints does the backend expose for this?** List with HTTP methods and paths.
6. **What React state management does the consumer need?** (CRUD, loading, error, pagination, auto-fetch vs manual?)
7. **Does this introduce new dependencies?** Check `package.json` — new deps need justification.
8. **Does this change any public API surface?** (new exports, changed hook signatures, changed type shapes)

Write this summary out before proceeding.

## Phase 2: Read the Living References

Read these files to understand current conventions. The plan must follow existing patterns exactly.

### Required reads

```bash
# 1. Architecture doc — the authoritative reference for what goes where
cat ARCHITECTURE.md

# 2. Canonical API client example — reviews is the best-structured one
cat src/api/reviews.ts

# 3. Canonical hook example
cat src/hooks/reviews/useReviews.ts

# 4. Canonical type definitions
cat src/types/review.ts

# 5. HTTP clients — understand apiRequest vs foundationRequest
cat src/api/client.ts
cat src/api/foundation-client.ts

# 6. Current barrel exports — what's already exported
cat src/api/index.ts
cat src/hooks/index.ts
cat src/types/index.ts

# 7. Package exports — subpath exports in package.json
grep -A 30 '"exports"' package.json

# 8. Logging convention
cat src/utils/logging.ts
```

### Conditional reads

```bash
# If the domain uses a decoupled initialization pattern (like billing)
cat src/api/billing.ts  # initBillingApi() pattern

# If the corresponding foundation-sdk domain exists — read its backend shapes
cat ../foundation-sdk/foundation/<domain>/DOMAIN.md
cat ../foundation-sdk/foundation/<domain>/api/schemas.py       # Marshmallow schemas = response shapes
cat ../foundation-sdk/foundation/<domain>/api/smorest_<domain>_blueprint.py  # Serialization logic

# If the feature involves auth/session
cat src/hooks/auth/useAuth.ts
cat src/api/auth.ts

# If extending an existing fsdk-ts module
cat src/types/<existing>.ts
cat src/api/<existing>.ts
cat src/hooks/<existing>/use<Existing>.ts
```

## Phase 3: Cross-Cutting Concern Checklist

For every feature, systematically evaluate each concern. Document your answers in the plan.

### 3A. Agnosticism — The Primary Gate

This is the most critical check. Everything in fsdk-ts must be product-agnostic.

Answer these questions:

1. **Would a different product (hotel app, SaaS dashboard, marketplace) need the exact same types?**
   - If no → types belong in the consumer app's `src/lib/types/`
   - If yes but some fields are product-specific → split: generic fields here, product fields in consumer

2. **Would a different product call the same endpoints with the same shapes?**
   - If no → API client belongs in consumer
   - If yes but the base URL varies by product → use `initBillingApi()` decoupled pattern

3. **Does the code have hardcoded product-specific values?** (currencies, categories, scopes, domain-specific enums)
   - If yes → code belongs in consumer
   - If partially → extract config, pass via init pattern

4. **Does the hook manage product-specific workflow?** (booking flow, checkout steps, availability checks)
   - If yes → hook belongs in consumer, may import agnostic utilities from fsdk-ts

**Reference:** Read `ARCHITECTURE.md` "What Goes in fsdk-ts vs. Consumer Apps" section for the canonical decision framework.

**Output for plan:** A table classifying each planned export as "agnostic" / "needs init pattern" / "consumer-only (don't build here)".

### 3B. Type-Backend Parity

Types must match what the backend actually returns — not what you wish it returned.

Answer these questions:

1. **Does the foundation-sdk domain have Marshmallow schemas?**
   - If yes → read `foundation/<domain>/api/schemas.py` — field names and types are the source of truth
   - If the backend uses `snake_case` field names (marshmallow default) → frontend types must also use `snake_case`
   - If the backend has a custom serializer that converts to `camelCase` → frontend types use `camelCase`

2. **Does the blueprint have a custom serializer function?** (like `_serialize_invite()`, `_serialize_user()`)
   - If yes → read it to see exact field names in the JSON response
   - Field names in the serializer override schema field names

3. **Are there response envelope patterns?** (like `{ success, data, meta }`)
   - If yes → type the full envelope, not just the inner data

**Reference:** Read the backend's `api/schemas.py` and blueprint serializer for the domain.

**Output for plan:** Field-level type definitions with explicit notes on which backend file they mirror.

### 3C. HTTP Client Selection

Answer these questions:

1. **Does this module talk to foundation-sdk endpoints?** (paths like `/api/auth/*`, `/api/reviews/*`, `/api/admin/*`)
   - If yes → use `foundationRequest` (JWT Bearer auth)

2. **Does this module talk to the consumer app's backend?** (paths like `/api/v1/bookings/*`)
   - If yes → use `apiRequest` (CSRF token auth)
   - NOTE: if this is true, the module probably belongs in the consumer app, not fsdk-ts

3. **Might different consumers route these endpoints through different backends?**
   - If yes → use the `initBillingApi(requestFn, urlPrefix)` decoupled pattern

**Reference:** Read `src/api/client.ts` and `src/api/foundation-client.ts` for the two client patterns.

**Output for plan:** Which HTTP client each API method uses and why.

### 3D. Error Handling

Answer these questions:

1. **Does the backend return structured error responses?** (like `{ message: "...", errors: {...} }`)
   - If yes → the API client should let `foundationRequest`/`apiRequest` throw — they already parse error messages
   - If the backend has non-standard error shapes → document how to extract the message

2. **Are there domain-specific error states the hook should expose?** (like "MFA not configured", "invite expired")
   - If yes → expose as specific state fields, not just generic `error: string`

**Reference:** Read `src/api/foundation-client.ts` lines 44-48 for how errors are thrown.

**Output for plan:** Error handling approach for each API method and hook.

### 3E. Logging

Answer these questions:

1. **Does this feature add new API client files?**
   - If yes → each needs `const logger = getLogger('<domain>-api')` at module level
   - Log `info` before and after each request with relevant IDs
   - Log `error` in catch blocks with the error message
   - Never log sensitive data (tokens, passwords, email addresses in MFA flows)

2. **Does this feature add new hook files?**
   - If yes → each needs `const logger = getLogger('use<Domain>')` at module level
   - Log `info` for successful state changes
   - Log `error` for failures

**Reference:** Read `src/utils/logging.ts` for `getLogger` API. Read `src/api/reviews.ts` for the canonical logging pattern.

**Output for plan:** Logger context strings and key log points for each new file.

### 3F. Barrel Exports and Package Exports

Answer these questions:

1. **Does this feature add new files that consumers import?**
   - If yes → add re-exports to the relevant barrel files:
     - `src/types/index.ts` for types
     - `src/api/index.ts` for API clients
     - `src/hooks/index.ts` for hooks
   - `src/index.ts` re-exports from these barrels — usually no change needed

2. **Does this feature need a standalone subpath export?** (like `fsdk-ts/email` or `fsdk-ts/server`)
   - Only if the module is server-only or useful standalone without pulling in all of fsdk-ts
   - Most modules don't need this — they're accessible via the main `fsdk-ts` import

3. **Do new exports conflict with existing ones?** (name collisions across modules)
   - Check existing barrel files for conflicts before adding

**Reference:** Read current `src/api/index.ts`, `src/hooks/index.ts`, `src/types/index.ts`. Read `package.json` `"exports"` map.

**Output for plan:** Exact lines to add to each barrel file. Package.json changes if applicable.

### 3G. Testing and Build Verification

Answer these questions:

1. **Does the build pass after changes?**
   - `npm run build` must succeed (both ESM and CJS outputs)
   - This is the minimum bar — no exceptions

2. **Can consumer apps import the new exports?**
   - After building, verify imports resolve from a consumer app

3. **Do existing exports still work?**
   - Barrel export additions must not break existing imports

**Output for plan:** Verification commands to run after implementation.

### 3H. Enforcement Completeness audit (state-gating features)

**Enforcement Completeness (state-gating features).** When a feature gates access or capability on STATE — account active/disabled, tenant/org active/suspended, force-logout/session-revocation, role/permission, subscription tier, ownership — **Discovery ≠ Enforcement.** Hiding a resource from listings/search/dashboards does NOT enforce the gate. Enumerate EVERY entry point that reads OR mutates the gated resource or performs the gated action — listing/search endpoints AND detail/by-id/by-handle/by-slug lookups; create/reserve/mutate/delete/action endpoints (the ones that *do* the thing); direct-link/direct-id paths that bypass discovery; every auth channel (session cookie AND JWT/bearer, same- AND cross-origin); cross-domain/cross-service consumers resolving the resource via a different code path; admin/webhook/scheduler paths — and prove each independently enforces the gate. Produce an **enforcement matrix** (entry point × gated? × where) and write **negative requirements + negative tests** ("a disabled/suspended/unauthorized subject MUST NOT be able to <action> via ANY path"), not only positive behavior tests — positive tests are structurally blind to a missing enforcement point.

## Phase 4: Emergent Concern Check

Before writing the plan, ask yourself:

1. **Does this feature introduce a new pattern that other fsdk-ts modules should adopt?**
   - A new error handling pattern, a new state shape convention, a new initialization pattern
   - If YES: document the pattern and note which existing modules could benefit (but don't retroactively change them unless asked)

2. **Does this feature introduce a new utility that multiple modules could share?**
   - A shared pagination helper, a shared query-string builder, a shared response parser
   - If YES: put it in `src/utils/` and import from there, not inline in the module

3. **Does this feature change how fsdk-ts modules relate to foundation-sdk domains?**
   - A new convention for how types mirror backend schemas
   - A new convention for how hooks auto-fetch vs manual-fetch
   - If YES: document in the plan and consider updating ARCHITECTURE.md conventions section

4. **Does this feature warrant updating this skill's checklist?**
   - If the concern you just identified would apply to ALL future modules, it should become a new 3X section in this skill
   - If YES: include a work package in the plan to update this skill file

If you answered YES to any of the above, include a "Convention Updates" work package in the plan.

## Phase 5: Multi-Layer Impact

fsdk-ts sits between foundation-sdk (below) and consumer apps (above).

```
Layer Map:
- This repo: fsdk-ts (React companion to foundation-sdk)
- Depends on: foundation-sdk (defines the backend API shapes this lib wraps)
- Depended on by: rihla-web frontend, fsdk-starter, any future foundation-sdk consumer frontend
- Parallel to: (none — it IS the frontend layer for foundation-sdk)
```

For this specific feature, answer:

1. **Does the foundation-sdk domain this maps to have stable API endpoints?**
   - If the SDK endpoints are brand new or in flux → note that types may need updating when the SDK stabilizes
   - If the SDK domain has no HTTP endpoints yet → this module may be premature

2. **Does this change affect consumer apps that already import from fsdk-ts?**
   - New additive exports → no consumer impact (backwards compatible)
   - Changed type shapes or hook signatures → breaking change, document migration
   - Changed API client behavior → consumer behavior changes silently, document carefully

3. **Does the foundation-sdk domain have a DOMAIN.md that lists "fsdk-ts module" in its cross-domain section?**
   - If not → after implementation, update the SDK's DOMAIN.md to reference this new module

4. **Do any consumer apps need wiring changes to use this?**
   - Usually no (just `import { useNewHook } from 'fsdk-ts'`)
   - If the module uses the init pattern → consumers must call the init function

If any cross-layer changes are needed, they must be explicit work packages in the plan.

## Phase 6: Write the Implementation Plan

### Plan structure

```
## Context
1-3 sentences. What foundation-sdk domain this maps to, what the consumer needs.

## Agnosticism Assessment
Table showing each export and why it's agnostic (or why it uses the init pattern).

## Work Packages

### WP1: Types — `src/types/<domain>.ts`
- List every interface/type to define
- Show the key fields for each
- Note which backend file they mirror (schema or serializer)

### WP2: API Client — `src/api/<domain>.ts`
- Which HTTP client (apiRequest vs foundationRequest vs init pattern)
- List every method with: name, HTTP method, endpoint path, request type, response type
- Logger context string

### WP3: React Hook — `src/hooks/<domain>/use<Domain>.ts`
- Return type interface
- State fields (data, isLoading, error, etc.)
- Action functions with signatures
- Initial fetch behavior (useEffect or manual trigger)

### WP4: Barrel Exports
- Exact lines to add to each index.ts

### WP5: Package Exports (if applicable)
- Exact entry to add to package.json exports map

### WP6: Convention Updates (if emergent concern detected in Phase 4)
- What pattern/convention changed
- Which files to update (ARCHITECTURE.md, skill files)

### WP7: Cross-Layer Updates (if multi-layer impact detected in Phase 5)
- Foundation-sdk DOMAIN.md updates
- Consumer app documentation

## Cross-Cutting Concerns Summary

### Type-Backend Parity
| Type | Backend Source | Field Convention | Notes |
|------|--------------|-----------------|-------|

### HTTP Client Usage
| API Method | Client | Auth | Endpoint |
|-----------|--------|------|----------|

### Logging Points
| File | Logger Context | Key Log Points |
|------|---------------|----------------|

## Files to Modify
| File | WP | Changes |
|------|-----|---------|

## Files to Read Before Implementation
List files the implementing agent MUST read in full.

## Implementation Order
1. Types (no dependencies)
2. API client (depends on types)
3. Hook (depends on API client and types)
4. Barrel exports (depends on all above)
5. Build verification: `npm run build`

## Backwards Compatibility
What existing consumers must change (ideally nothing).

## Verification
- `npm run build` passes (both ESM and CJS)
- Consumer app can import new exports from `'fsdk-ts'`
- Consumer app builds successfully
- Types match backend response shapes (verified against schemas.py / serializer)

## Self-Audit
After implementation, check:
- Did this work introduce a new pattern that should be in ARCHITECTURE.md?
- Did this work reveal a gap in this skill's checklist?
- Does the foundation-sdk DOMAIN.md need updating to reference this module?
```

### Plan rules

- **File paths are relative to `fsdk-ts/`.** e.g., `src/api/notifications.ts`
- **Follow existing patterns exactly.** Read `src/api/reviews.ts` and `src/hooks/reviews/useReviews.ts` as the canonical example — match their structure, error handling, and logging.
- **Reference living docs, don't duplicate them.** Say "follow the API client pattern in `src/api/reviews.ts`" not copy-paste the pattern.
- **Types must match foundation-sdk backend responses.** Read the backend's `api/schemas.py` and blueprint serializer. If the backend returns `snake_case`, types use `snake_case`. Do not assume camelCase.
- **Never add product-specific code.** If you find yourself writing Rihla-specific types, hardcoded values, or product-specific endpoints, stop — that code belongs in the consumer app's `src/lib/`.
- **The init pattern (`initBillingApi`)** is for modules that are architecturally agnostic but need per-consumer configuration. Use it sparingly.
- **Build verification is mandatory.** The plan must end with `npm run build`.
- **Include "Files to Read Before Implementation"** — at minimum: ARCHITECTURE.md, the canonical example (reviews), and the corresponding foundation-sdk domain's `api/schemas.py`.
- **Plan for documentation updates.** Note which files need doc updates after implementation — ARCHITECTURE.md module tables, foundation-sdk DOMAIN.md cross-references.
- **Plan for self-audit.** The last section of every plan checks whether the work invalidated any conventions or skills.
