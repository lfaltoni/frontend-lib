# Implementation Plan: Validation Utilities (Email & Phone)

## Context

fsdk-ts needs client-side validation utilities that mirror foundation-sdk's backend validation exactly, so client and server never disagree on what's valid. These are pure utility functions (not React hooks or components) that any consumer app can import. Currently fsdk-ts has zero client-side validation; Reela has a local copy of `isValidEmail()` that should be replaced by this shared implementation.

## Phase 1 Understanding

1. **What is this feature?** Pure TypeScript validation/normalization functions for email and phone, mirroring foundation-sdk's backend logic.
2. **Foundation-sdk domain:** Cross-cuts `email` (validation module) and `phone_verification` (service module). Not a single domain — these are shared utilities.
3. **Module type:** Infrastructure/utility work — new files in `src/types/` and `src/utils/`.
4. **Key entities:** `ValidationResult` type — `{ valid: boolean; reason?: string }`.
5. **API endpoints:** None — these are pure functions with no network calls.
6. **React state management:** None — pure functions, not hooks.
7. **New dependencies:** None.
8. **Public API surface:** New exports only (additive, non-breaking).

## Agnosticism Assessment

| Export | Agnostic? | Rationale |
|--------|-----------|-----------|
| `ValidationResult` type | Yes | Generic validation shape, any app needs this |
| `validateEmail()` | Yes | Email format validation is universal |
| `normalizeEmail()` | Yes | Lowercase + trim is universal |
| `validatePhone()` | Yes | E.164 is an international standard |
| `normalizePhone()` | Yes | Stripping formatting chars is universal |

All exports are fully agnostic. No init pattern needed.

## Work Packages

### WP1: Types — `src/types/validation.ts`

Create a new type definition file with one interface:

```typescript
/**
 * Result of a validation check.
 * `reason` is a machine-readable code (e.g. 'empty', 'no_at_sign') — present only when invalid.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
```

**Design notes:**
- `reason` is `string` (not a union) to keep it extensible for future validators without type changes.
- Mirrors foundation-sdk's `EmailValidationResult(is_valid, reason)` shape but uses `valid` (not `is_valid`) to match JS naming conventions.
- The same type is used for both email and phone validation — intentionally generic.

### WP2: Utility Functions — `src/utils/validation.ts`

Create a new utility file. No logging needed — these are pure synchronous functions with no side effects (consistent with `pagination.ts` which is also a pure utility with no logger).

#### `validateEmail(email: string): ValidationResult`

Must mirror **exactly** the logic in `foundation-sdk/foundation/email/validation.py:validate_email_format()`:

```
1. If empty or whitespace-only → { valid: false, reason: 'empty' }
2. Trim the input
3. If count of '@' !== 1 → { valid: false, reason: 'no_at_sign' }
4. Split on '@' → [local, domain]
5. If local is empty → { valid: false, reason: 'invalid_local' }
6. If domain is empty or has no '.' → { valid: false, reason: 'invalid_domain' }
7. If any domain label is empty (catches "user@.com", "user@foo..com") → { valid: false, reason: 'invalid_domain' }
8. Final regex sanity check: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ → if fails: { valid: false, reason: 'invalid_domain' }
9. → { valid: true }
```

**IMPORTANT:** The backend does NOT just run the regex. It does step-by-step checks with specific reason codes, then uses the regex as a final sanity check. The frontend must replicate this exact sequence to produce the same reason codes for the same inputs.

**Backend reason codes (must match exactly):** `'empty'`, `'no_at_sign'`, `'invalid_local'`, `'invalid_domain'`

#### `normalizeEmail(email: string): string`

Mirrors `foundation-sdk/foundation/email/validation.py:normalize_email()`:

```
return email.strip().toLowerCase()
```

One-liner. Trim + lowercase.

#### `validatePhone(phone: string): ValidationResult`

Mirrors the validation logic inside `foundation-sdk/foundation/phone_verification/service.py:_normalize_phone()`:

```
1. If empty or whitespace-only → { valid: false, reason: 'empty' }
2. Strip formatting: replace /[\s\-()]+/g with ''
3. If doesn't start with '+', prepend '+'
4. Test against E.164 regex: /^\+[1-9]\d{1,14}$/
5. If fails → { valid: false, reason: 'invalid_format' }
6. → { valid: true }
```

**Note:** The backend's `_normalize_phone` raises `ValueError` on invalid format. The frontend equivalent returns a `ValidationResult` instead of throwing — more ergonomic for form validation use cases.

#### `normalizePhone(phone: string): string`

Mirrors the normalization (but not validation) portion of `_normalize_phone()`:

```
1. Strip formatting: replace /[\s\-()]+/g with ''
2. If doesn't start with '+', prepend '+'
3. Return the cleaned string
```

**Note:** This does NOT validate. Consumer apps should call `validatePhone()` first if they need to check validity, then `normalizePhone()` to clean the value before sending to the API. Keeping them separate lets consumers normalize for display without gating on validity.

### WP3: Barrel Exports

**`src/types/index.ts`** — add at the end:
```typescript
export * from './validation';
```

**`src/utils/index.ts`** — add at the end:
```typescript
export * from './validation';
```

No changes needed to:
- `src/index.ts` — already re-exports `./types` and `./utils`
- `package.json` exports — validation is part of the main `"."` export, no standalone subpath needed

### WP4: Documentation Updates

After implementation, update **ARCHITECTURE.md** Utilities table (line 122-131) to add:

| File | Key Exports | Purpose |
|------|-------------|---------|
| `validation.ts` | `validateEmail()`, `normalizeEmail()`, `validatePhone()`, `normalizePhone()` | Email and phone validation/normalization — mirrors foundation-sdk backend logic |

Also add `ValidationResult` to the Type Definitions table (line 106-120):

| File | Key Exports | Maps to |
|------|-------------|---------|
| `validation.ts` | `ValidationResult` | foundation-sdk `email/validation.py` + `phone_verification/service.py` |

## Cross-Cutting Concerns Summary

### Type-Backend Parity

| Frontend Type/Function | Backend Source | Parity Notes |
|----------------------|---------------|-------------|
| `ValidationResult` | `EmailValidationResult` (NamedTuple) | Same shape: `valid`/`is_valid` + `reason`. JS uses `valid` per convention. |
| `validateEmail()` | `validate_email_format()` in `foundation/email/validation.py` | Same step-by-step logic, same reason codes, same regex |
| `normalizeEmail()` | `normalize_email()` in `foundation/email/validation.py` | Same logic: strip + lowercase |
| `validatePhone()` | `_normalize_phone()` in `foundation/phone_verification/service.py` | Same regex `^\+[1-9]\d{1,14}$`, same strip chars `[\s\-()]+` |
| `normalizePhone()` | `_normalize_phone()` (normalization portion only) | Same strip + prepend logic |

### HTTP Client Usage

None — pure utility functions with no network calls.

### Logging Points

None — these are pure synchronous functions like `pagination.ts`. No side effects, no logger needed.

## Files to Create

| File | WP | Contents |
|------|-----|---------|
| `src/types/validation.ts` | WP1 | `ValidationResult` interface |
| `src/utils/validation.ts` | WP2 | `validateEmail`, `normalizeEmail`, `validatePhone`, `normalizePhone` |

## Files to Modify

| File | WP | Changes |
|------|-----|---------|
| `src/types/index.ts` | WP3 | Add `export * from './validation'` |
| `src/utils/index.ts` | WP3 | Add `export * from './validation'` |
| `ARCHITECTURE.md` | WP4 | Add rows to Utilities and Type Definitions tables |

## Files to Read Before Implementation

The implementing agent MUST read these files in full before writing code:

1. `ARCHITECTURE.md` — conventions and patterns
2. `src/utils/pagination.ts` — canonical pure utility pattern (no logging, no side effects)
3. `src/types/validation.ts` — will not exist yet, but check anyway to avoid collisions
4. `src/utils/index.ts` — current barrel exports
5. `src/types/index.ts` — current barrel exports

The implementing agent does NOT need to read the foundation-sdk backend files — the exact logic to implement is specified above in WP2.

## Implementation Order

1. `src/types/validation.ts` — type definition (no dependencies)
2. `src/utils/validation.ts` — functions (imports from types)
3. `src/types/index.ts` — add barrel export
4. `src/utils/index.ts` — add barrel export
5. `ARCHITECTURE.md` — update documentation tables
6. Run `npm run build` — verify both ESM and CJS outputs succeed

## Backwards Compatibility

Fully backwards compatible. All changes are additive exports — no existing types, functions, or signatures are modified.

## Verification

1. `npm run build` passes (both ESM and CJS)
2. New exports are accessible via `import { validateEmail, validatePhone, normalizePhone, normalizeEmail, ValidationResult } from 'fsdk-ts'`
3. No naming conflicts with existing exports (checked: no existing `validate*` or `normalize*` exports)

## Consumer App Migration Note

After this lands, Reela's local `utils/validateEmail.ts` should be deleted and replaced with:
```typescript
import { validateEmail } from 'fsdk-ts';
```
This is a consumer-side change, not part of this implementation.

## Phase 2 Design Awareness

These validation utilities are for **inline field errors** (form-level). The future `ToastProvider` + `useToast()` hook is for **action outcomes** (save success, network errors). These are separate concerns:
- Validation functions return `ValidationResult` — consumed by form components to show field-level errors
- Toasts are triggered by API responses — consumed by a provider at the app root

No design decisions in this plan constrain or complicate the Phase 2 toast work.

## Self-Audit Checklist

After implementation, verify:
- [ ] `npm run build` passes
- [ ] No new patterns introduced that need ARCHITECTURE.md convention updates (these follow existing utility patterns exactly)
- [ ] ARCHITECTURE.md tables updated with new files
- [ ] foundation-sdk DOMAIN.md for email and phone_verification domains — consider adding cross-reference to fsdk-ts validation utilities (optional, low priority)
