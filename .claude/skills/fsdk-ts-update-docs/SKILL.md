---
description: Update all fsdk-ts documentation to reflect code changes. Auto-discovers what changed via git diff, then updates ARCHITECTURE.md module tables, verifies type-backend parity with foundation-sdk, and checks cross-layer documentation in foundation-sdk DOMAIN.md files.
---

# /fsdk-ts-update-docs — Update fsdk-ts Documentation

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

---

Update fsdk-ts documentation to match the current state of the code.

## Step 1: Discover what changed

Run these commands to understand the diff:

```bash
git diff --stat
git diff --name-only
git diff
git status
```

If everything is already committed, **derive the range — do NOT default to `HEAD~1`** (it only
captures the LAST commit, so when several commits have landed since the docs were last updated it
silently misses the earlier ones). No need to know or count how many commits there were:
```bash
# Diff EVERYTHING since the docs this skill maintains were last touched — all intervening commits, one pass:
DOCS_LAST=$(git log -1 --format=%H -- ARCHITECTURE.md)   # the doc files this skill updates
git diff "$DOCS_LAST"..HEAD --stat
git diff "$DOCS_LAST"..HEAD
```
Alternatives: a feature branch → `git diff main...HEAD`; a user-named base → `git diff <base>..HEAD`.
Use `HEAD~1` ONLY for a known single-commit change; for brand-new docs (no prior commit), read the code as-is.

From the diff, identify:
- New or changed type files (`src/types/*.ts`)
- New or changed API client files (`src/api/*.ts`)
- New or changed hook files (`src/hooks/*/*.ts`)
- New or changed utility files (`src/utils/*.ts`)
- New or changed server modules (`src/server/*.ts`)
- New or changed email modules (`src/email/*.ts`)
- Changed barrel exports (`src/*/index.ts`, `src/index.ts`)
- Changed package.json exports map
- Changed environment configuration

## Step 2: Determine which docs need updates

Use this decision tree:

| Change type | Update targets |
|-------------|---------------|
| New domain module (types + API + hook) | ARCHITECTURE.md: Module Reference tables (all 3: API, Hooks, Types) |
| Changed type file | ARCHITECTURE.md: Type Definitions table |
| Changed API client file | ARCHITECTURE.md: API Clients table |
| Changed hook file | ARCHITECTURE.md: React Hooks table |
| Changed utility file | ARCHITECTURE.md: Utilities table |
| Changed server module | ARCHITECTURE.md: Server Modules table |
| Changed email module | ARCHITECTURE.md: Email Module table |
| New barrel export lines | Verify ARCHITECTURE.md module tables list the new module |
| New package.json export | ARCHITECTURE.md: Package Exports table |
| Changed env config | ARCHITECTURE.md: Environment Configuration table |
| New convention or pattern change | ARCHITECTURE.md: Conventions section |
| Module extracted to consumer app | ARCHITECTURE.md: Migration section (if still relevant) |
| **Foundation-sdk endpoint changed** | **Cross-layer:** verify `src/types/<domain>.ts` still matches `foundation-sdk/foundation/<domain>/api/schemas.py` |
| **New foundation-sdk domain with endpoints** | **Cross-layer:** check if fsdk-ts module exists; if not, flag for creation |

**Only update docs affected by actual code changes.** Don't rewrite unrelated sections.

## Step 3: ARCHITECTURE.md structure

fsdk-ts has a single ARCHITECTURE.md (no per-module DOMAIN.md files — the project is a flat library, not a domain-based architecture). The doc has these sections:

1. **What This Library Is** — one paragraph
2. **What Goes in fsdk-ts vs. Consumer Apps** — the agnosticism rules
3. **Module Reference** — tables for each module category:
   - API Clients (`src/api/`)
   - React Hooks (`src/hooks/`)
   - Type Definitions (`src/types/`)
   - Utilities (`src/utils/`)
   - Server Modules (`src/server/`)
   - Email Module (`src/email/`)
4. **Package Exports** — subpath export map
5. **Conventions** — patterns for adding new modules
6. **Environment Configuration** — env vars and defaults
7. **Migration** — extracted modules (historical record)

When updating, match the existing table format exactly. Read the current file first.

## Step 4: Cross-layer documentation touchpoints

### Foundation-sdk DOMAIN.md — 1 place per domain

When a fsdk-ts module is created or updated for a foundation-sdk domain:

1. **Check `../foundation-sdk/foundation/<domain>/DOMAIN.md`** for a "Cross-Domain Dependencies" or "fsdk-ts" reference
2. If the DOMAIN.md doesn't mention the fsdk-ts module → add a note: "fsdk-ts companion: `src/types/<domain>.ts`, `src/api/<domain>.ts`, `src/hooks/<domain>/use<Domain>.ts`"

Verify which domains have fsdk-ts modules:
```bash
# List all fsdk-ts API modules
ls src/api/*.ts | grep -v index | grep -v client | grep -v foundation-client

# List all foundation-sdk domains with HTTP endpoints
ls ../foundation-sdk/foundation/*/api/ 2>/dev/null | grep -v __pycache__
```

### Type-backend parity — verify per domain

When types changed, verify they still match the backend:

```bash
# For each changed type file, read the backend schema
# Example for audit:
cat ../foundation-sdk/foundation/audit/api/schemas.py
cat src/types/audit.ts
# Field names and types should match
```

Check:
- Field names match (snake_case or camelCase, matching what the backend actually returns)
- Nullable fields in the schema have `| null` in the type
- Response envelope shapes match (`{ success, data, meta }` etc.)
- New backend fields are reflected in frontend types

## Step 5: Verify

After all updates, run verification:

```bash
# Build must pass
npm run build

# All API modules should be in the API Clients table
for f in src/api/*.ts; do
  name=$(basename "$f" .ts)
  [ "$name" = "index" ] || [ "$name" = "client" ] || [ "$name" = "foundation-client" ] || echo "API module: $name"
done

# All hooks should be in the React Hooks table
find src/hooks -name "use*.ts" -not -path "*/index.ts" | while read f; do
  echo "Hook: $(basename $f .ts)"
done

# All type files should be in the Type Definitions table
for f in src/types/*.ts; do
  name=$(basename "$f" .ts)
  [ "$name" = "index" ] || echo "Type file: $name"
done

# Barrel exports should include all modules
echo "=== API barrel ==="
cat src/api/index.ts
echo "=== Hooks barrel ==="
cat src/hooks/index.ts
echo "=== Types barrel ==="
cat src/types/index.ts
```

Cross-check:
- Every API module in `src/api/` has a row in ARCHITECTURE.md API Clients table
- Every hook in `src/hooks/` has a row in ARCHITECTURE.md React Hooks table
- Every type file in `src/types/` has a row in ARCHITECTURE.md Type Definitions table
- Every barrel export line has a corresponding module that exists
- Package.json exports map matches ARCHITECTURE.md Package Exports table
- Foundation-sdk DOMAIN.md files reference their fsdk-ts companions

## Rules

- **Diff-driven.** Only update docs affected by actual code changes. Don't rewrite unrelated sections.
- **Grep, don't guess.** Verify module names, export lists, and type fields against actual code before writing.
- **Match existing format.** Read ARCHITECTURE.md first. Don't introduce new table structures or heading styles.
- **Build must pass.** If you updated code (types, exports), run `npm run build` to verify.
- **Never remove docs for modules that still exist.** If unsure whether something was removed, check the file system first.
- **Cross-layer awareness.** When fsdk-ts modules change, check if foundation-sdk DOMAIN.md files need updating. When foundation-sdk endpoints change, check if fsdk-ts types are still accurate.
- **Type-backend parity is non-negotiable.** Types must match what the backend actually returns. Read `api/schemas.py` and the blueprint serializer — don't guess field names.
