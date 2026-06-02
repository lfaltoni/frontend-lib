# Implementation Plan: Toast Notification Infrastructure (ToastProvider + useToast)

## Context

fsdk-ts needs a React toast notification system so all consumer apps (Reela, fsdk-starter, future apps) get a shared toast implementation. This mirrors Bookease-pro's production-proven `ToastService` (4 types, 3 severity tiers, hover-pause, dismissable) but as idiomatic React with context + hooks. No foundation-sdk backend domain — this is pure frontend infrastructure.

**Architectural significance:** This is the FIRST React component, FIRST context provider, and FIRST styling in fsdk-ts. The library has been fully headless until now. The `src/table/` module sets the precedent for self-contained feature directories that include hooks + types — toast follows the same structure.

## Phase 1 Understanding

1. **What is this feature?** A React context-based toast notification system with auto-dismiss, hover-pause, and the same type/tier model as Bookease-pro's vanilla JS toast service.
2. **Foundation-sdk domain:** None — pure frontend infrastructure (like logging, pagination, table).
3. **Module type:** Infrastructure. New standalone module at `src/toast/`.
4. **Key entities:** `ToastType`, `ToastTier`, `ToastOptions`, `Toast` (internal), `UseToastReturn`.
5. **API endpoints:** None.
6. **React state management:** Toast queue as `useState<Toast[]>`. Actions: show/dismiss. No loading/error/pagination.
7. **New dependencies:** None.
8. **Public API surface:** New additive exports only.

## Agnosticism Assessment

| Export | Agnostic? | Rationale |
|--------|-----------|-----------|
| `ToastProvider` | Yes | Every React app needs a toast system; no product-specific behavior |
| `useToast()` | Yes | Generic show/success/error/warning/info API |
| `ToastType`, `ToastTier`, `ToastOptions` | Yes | Universal notification concepts |
| `showToast` (module-level) | Yes | For API interceptors — product-agnostic |

All exports are fully agnostic. No init pattern needed.

## Work Packages

### WP1: Types — `src/toast/types.ts`

```typescript
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastTier = 'critical' | 'standard' | 'transient';

export interface ToastOptions {
  type?: ToastType;
  duration?: number;        // Override tier default (ms)
  dismissable?: boolean;    // Override tier default
}

// Internal state — not exported from barrel
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  tier: ToastTier;
  duration: number;
  dismissable: boolean;
  hoverPause: boolean;
}

export interface UseToastReturn {
  show: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  error: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  warning: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  info: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
}
```

**Design notes:**
- `Toast` interface is internal state — exported from the file but not necessarily from the barrel (the implementing agent can decide whether consumers need it).
- `UseToastReturn` matches Bookease-pro's `window.ToastService` public API shape.
- `ToastOptions.type` is optional on `show()` (defaults to `'info'`), and omitted from convenience methods.

### WP2: Toast Constants — defined in `src/toast/ToastProvider.tsx` (module-level, not exported)

These are implementation constants, not types. Define them at the top of the provider file.

**Tier configuration (must match Bookease-pro exactly):**
```typescript
const TIERS: Record<ToastTier, { duration: number; dismissable: boolean; hoverPause: boolean }> = {
  critical:  { duration: 15000, dismissable: true,  hoverPause: true  },
  standard:  { duration: 8000,  dismissable: true,  hoverPause: true  },
  transient: { duration: 5000,  dismissable: false, hoverPause: false },
};

const TYPE_TIER_MAP: Record<ToastType, { tier: ToastTier; duration?: number }> = {
  error:   { tier: 'critical'                  },  // 15000 from tier
  success: { tier: 'standard'                  },  // 8000 from tier
  warning: { tier: 'standard', duration: 10000 },  // overrides standard's 8000
  info:    { tier: 'transient'                 },  // 5000 from tier
};
```

### WP3: ToastProvider Component — `src/toast/ToastProvider.tsx`

This is the first React component in fsdk-ts. It is a context provider that also renders the toast container.

**Structure:**

```
ToastProvider (context provider)
├── ToastContext (createContext)
├── State: toasts (Toast[])
├── Actions: show(), dismiss()
├── Module-level ref: toastActionsRef (for non-component access)
├── Renders: portal-based toast container
│   └── ToastItem (internal component, one per toast)
│       ├── Message text
│       ├── Close button (if dismissable)
│       └── Hover-pause timer logic
└── Injects: <style> tag with default CSS (CSS custom properties for overrides)
```

**Key implementation details:**

1. **Portal rendering:** Use `ReactDOM.createPortal` to render the toast container into `document.body`. Guard with `typeof document !== 'undefined'` for SSR safety.

2. **Toast ID generation:** Use a simple incrementing counter (`let nextId = 0; const id = String(++nextId)`). No need for UUID — toasts are ephemeral.

3. **`show()` function:** Resolves type → tier → defaults, applies option overrides, adds toast to state.

4. **`dismiss()` function:** Removes toast from state by ID. The ToastItem handles the exit animation delay before calling dismiss.

5. **Module-level ref for non-component access:**
   ```typescript
   import { createRef } from 'react';
   const toastActionsRef = createRef<UseToastReturn>();
   // Set inside ToastProvider via useEffect
   // Exported as showToast() etc.
   ```
   This enables API interceptors to call `showToast('Session expired', { type: 'error' })` without being inside a React component. The ref is populated when ToastProvider mounts and cleared on unmount.

6. **SSR safety:** All DOM access (`document.body`, `createPortal`) guarded with `typeof document !== 'undefined'`. The provider renders `null` during SSR.

**Styling approach:**

Inject a `<style>` tag from the ToastProvider (same approach as Bookease-pro). Use CSS custom properties for consumer overrides. This is the ONLY practical approach that supports animations, hover states, and media queries.

**Default CSS custom properties (consumer overrides these):**
```css
--fsdk-toast-z-index: 10001
--fsdk-toast-max-width: 400px
--fsdk-toast-top: 1rem
--fsdk-toast-right: 1rem
--fsdk-toast-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
--fsdk-toast-font-size: 0.9rem
--fsdk-toast-radius: 8px
--fsdk-toast-success-color: #16a34a
--fsdk-toast-error-color: #dc2626
--fsdk-toast-warning-color: #d97706
--fsdk-toast-info-color: #3b82f6
```

The injected CSS uses the `fsdk-toast-` prefix on all class names to avoid collisions. Consumer apps can override any color/spacing by setting the custom properties on `:root` or any ancestor.

**No icons baked in.** Unlike Bookease-pro which embeds SVG icons, the React version renders only message text + close button. Consumer apps can add icons via CSS (`::before` pseudo-element) or by wrapping the message string.

### WP4: ToastItem Component — internal to `src/toast/ToastProvider.tsx`

A small internal component (not exported) that renders one toast and manages its auto-dismiss timer with hover-pause.

**Timer logic (must match Bookease-pro exactly):**
```
1. On mount: start timer with `duration` ms
2. On mouseenter (if hoverPause): pause timer, record remaining time
3. On mouseleave (if hoverPause): resume timer with remaining time (minimum 500ms)
4. On timer expire: trigger exit animation, then call dismiss() after 350ms
5. On close button click: same as timer expire (animate out, then dismiss)
```

**Animation:** Slide in from the right on mount (translateX(110%) → translateX(0)). Slide out + fade on dismiss. Transition duration 300ms. DOM removal after 350ms (same as Bookease-pro).

**Timer implementation:** Use `useRef` for `timeoutId`, `startTime`, and `remaining`. Use `useEffect` cleanup to clear timeout on unmount.

### WP5: useToast Hook — `src/toast/useToast.ts`

Minimal hook that reads from ToastContext:

```typescript
export function useToast(): UseToastReturn {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
```

This is intentionally in a separate file from the provider so the import is clean: `import { useToast } from 'fsdk-ts'`.

### WP6: Module-Level Toast Access — exported from `src/toast/index.ts`

For API interceptors and non-component code:

```typescript
export function showToast(message: string, options?: ToastOptions): void {
  // Delegates to the ref set by ToastProvider
  // No-ops silently if ToastProvider is not mounted (don't crash interceptors)
}
```

Plus convenience wrappers: `showToastSuccess`, `showToastError`, `showToastWarning`, `showToastInfo`.

**Why this pattern:** API response interceptors (like an Axios interceptor or a `foundationRequest` wrapper) run outside React component context. They can't call `useToast()`. The module-level ref pattern lets them show toasts without needing a component reference.

### WP7: Barrel Exports — `src/toast/index.ts`

```typescript
export type { ToastType, ToastTier, ToastOptions, UseToastReturn } from './types';
export { ToastProvider } from './ToastProvider';
export { useToast } from './useToast';
export { showToast, showToastSuccess, showToastError, showToastWarning, showToastInfo } from './ToastProvider';
```

**Note:** `Toast` (internal state) is NOT exported from the barrel — consumers don't need it.

### WP8: Top-Level Barrel Updates

**`src/index.ts`** — add:
```typescript
export * from './toast';
```

**`src/hooks/index.ts`** — do NOT add toast here. The toast module is self-contained at `src/toast/` (like `src/table/`), not scattered across `src/hooks/` + `src/types/`. This follows the `src/table/` precedent where the module owns its own types, hooks, and barrel.

**`src/types/index.ts`** — do NOT add toast types here. They're exported via `src/toast/index.ts` → `src/index.ts`.

### WP9: Documentation Updates

**ARCHITECTURE.md — add new section after Utilities, before Server Modules:**

```markdown
### Toast Notifications (`src/toast/`)

React context-based toast notification system. Mirrors Bookease-pro's production toast tiers and timing.

| File | Key Exports | Purpose |
|------|-------------|---------|
| `types.ts` | `ToastType`, `ToastTier`, `ToastOptions`, `UseToastReturn` | Toast type definitions |
| `ToastProvider.tsx` | `ToastProvider`, `showToast`, `showToastSuccess`, `showToastError`, `showToastWarning`, `showToastInfo` | Context provider + rendering + module-level access |
| `useToast.ts` | `useToast()` | Hook returning `{ show, success, error, warning, info }` |
| `index.ts` | barrel | Re-exports all public API |
```

**ARCHITECTURE.md — update main export table** to add:
```
| `fsdk-ts` | ... + toast notifications (ToastProvider, useToast) | Client |
```

**ARCHITECTURE.md — add consumer integration note:**

```markdown
### Toast Setup

Wrap your app root with `ToastProvider`:

\```tsx
import { ToastProvider } from 'fsdk-ts';

function App() {
  return (
    <ToastProvider>
      {/* your app */}
    </ToastProvider>
  );
}
\```

Use toasts in components:
\```tsx
import { useToast } from 'fsdk-ts';

function SaveButton() {
  const toast = useToast();
  const handleSave = async () => {
    try {
      await saveData();
      toast.success('Changes saved');
    } catch {
      toast.error('Failed to save');
    }
  };
}
\```

For API interceptors (outside React components):
\```tsx
import { showToastError } from 'fsdk-ts';

// In your API interceptor setup
if (response.status === 401) {
  showToastError('Session expired. Please log in again.');
}
\```

Override default styling via CSS custom properties:
\```css
:root {
  --fsdk-toast-success-color: #22c55e;
  --fsdk-toast-error-color: #ef4444;
  --fsdk-toast-radius: 12px;
  --fsdk-toast-font-family: 'Inter', sans-serif;
}
\```
```

## Cross-Cutting Concerns Summary

### Type-Backend Parity

Not applicable — no backend types. This is pure frontend infrastructure.

### HTTP Client Usage

Not applicable — no API calls. Pure state management + rendering.

### Logging Points

| File | Logger Context | Key Log Points |
|------|---------------|----------------|
| `ToastProvider.tsx` | `'toast'` | `logger.debug` on show (with type + duration) and dismiss. Debug level — these are high-frequency UI events, not API calls. |

### Error Handling

- `useToast()` throws if used outside `ToastProvider` — standard React context pattern.
- Module-level `showToast()` no-ops silently if provider is not mounted — interceptors should not crash.

## Files to Create

| File | WP | Contents |
|------|-----|---------|
| `src/toast/types.ts` | WP1 | Type definitions |
| `src/toast/ToastProvider.tsx` | WP2-4 | Provider + ToastItem + constants + CSS + module-level ref |
| `src/toast/useToast.ts` | WP5 | Context consumer hook |
| `src/toast/index.ts` | WP7 | Barrel exports |

## Files to Modify

| File | WP | Changes |
|------|-----|---------|
| `src/index.ts` | WP8 | Add `export * from './toast'` |
| `ARCHITECTURE.md` | WP9 | Add Toast Notifications section, consumer integration note |

## Files to Read Before Implementation

1. `ARCHITECTURE.md` — conventions
2. `src/table/index.ts` — precedent for self-contained feature module with its own barrel
3. `src/toast/` — verify directory doesn't exist yet
4. `src/index.ts` — current top-level barrel
5. Bookease-pro `static/js/toast-service.js` — the behavior spec (already read; exact tiers/durations documented above in WP2)

The implementing agent does NOT need to read the Bookease-pro file — all behavior is specified in this plan.

## Implementation Order

1. `src/toast/types.ts` — type definitions (no dependencies)
2. `src/toast/ToastProvider.tsx` — provider + rendering + constants + CSS (depends on types)
3. `src/toast/useToast.ts` — context consumer hook (depends on context from provider)
4. `src/toast/index.ts` — barrel exports
5. `src/index.ts` — add toast to top-level barrel
6. `ARCHITECTURE.md` — documentation updates
7. `npm run build` — verify both ESM and CJS

## Backwards Compatibility

Fully backwards compatible. All changes are additive:
- New `src/toast/` directory
- New export line in `src/index.ts`
- No existing types, hooks, or signatures modified

Consumer apps that don't use toasts are unaffected. `ToastProvider` is opt-in — apps that don't wrap with it simply don't have toasts.

## Verification

1. `npm run build` passes (both ESM and CJS)
2. New exports accessible: `import { ToastProvider, useToast, showToast, ToastType, ToastOptions } from 'fsdk-ts'`
3. No naming conflicts with existing exports (checked: no existing `Toast*`, `useToast`, or `show*` exports)
4. SSR safety: no `document` or `window` access outside guards

## Emergent Concerns

### New pattern: React component in fsdk-ts

This introduces the FIRST React component (`ToastProvider`) and the FIRST context provider. This sets a precedent for future components (e.g., a `ThemeProvider`, `ErrorBoundary`, etc.).

**Convention to document:** React components/providers that are infrastructure-level (not product-specific UI) belong in self-contained directories at `src/<feature>/` (following the `src/table/` and now `src/toast/` pattern). They are NOT placed in `src/hooks/` or a generic `src/components/`.

### New pattern: CSS in fsdk-ts

This introduces the FIRST CSS. The convention: use injected `<style>` tags with `fsdk-` prefixed class names and CSS custom properties for overrides. No CSS files, no CSS modules, no build-time CSS processing.

### New pattern: Module-level React state access

The `showToast()` module-level function uses a ref pattern to access React context from outside components. This pattern could be reused for other cross-cutting concerns (e.g., a future `logError()` that both logs and shows a toast). Document this pattern.

**These conventions should be added to ARCHITECTURE.md** as part of WP9.

## Self-Audit Checklist

After implementation, verify:
- [ ] `npm run build` passes
- [ ] ARCHITECTURE.md updated with Toast section and new conventions (components, CSS, module-level access)
- [ ] No `src/components/` directory created (toast lives at `src/toast/`, not `src/components/toast/`)
- [ ] SSR-safe: all DOM access guarded
- [ ] CSS uses `fsdk-toast-` prefix on all class names (no collisions)
- [ ] Tier durations match Bookease-pro exactly: error=15s, success=8s, warning=10s, info=5s
- [ ] Hover-pause minimum 500ms matches Bookease-pro
- [ ] Dismiss animation 350ms delay matches Bookease-pro
- [ ] `showToast()` no-ops silently when provider not mounted
