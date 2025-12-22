# Type Strategy for DI Library

## CRITICAL: Read This First

**BEFORE making any type changes, READ the full pattern documentation:**
- **[../nobuild-ts-experiments/docs/patterns/](../nobuild-ts-experiments/docs/patterns/)** - All 13 patterns documented
- **[../nobuild-ts-experiments/RESULTS.md](../nobuild-ts-experiments/RESULTS.md)** - Key findings

Do NOT make piecemeal changes. Read ALL the patterns first, understand the codebase holistically, THEN make changes.

**Previous agents have wasted hours by not reading this.** They made mistakes that are explicitly documented here, then had to rediscover solutions through painful experimentation. Don't be that agent. Read everything first.

---

## How to Import Types in JSDoc

**Always use namespace imports:**

```javascript
/** @import * as Types from 'no-decoration' */
```

Then reference types as `Types.Factory<T>`, `Types.Container`, etc.

**NEVER use destructured imports:**

```javascript
// WRONG - leads to bare Factory<T> which is harder to read
/** @import { Factory, Container } from 'no-decoration' */
```

---

## THE CORE INSIGHT (Memorize This)

**When you use `@type {Types.fn}`, the generic T is NOT in scope.**
**When you use `@template T`, the generic T IS in scope.**

```javascript
// @type {Types.fn} - T is NOT in scope
/** @type {Types.tagged} */
export function tagged(namespace, factoryCreator) {
  /** @type {Map<string, Factory<T>>} */  // ERROR: T not defined
  const cache = new Map();
}

// @template T - T IS in scope
/**
 * @template T
 * @param {string} namespace
 * @param {(tag: string) => Factory<T>} factoryCreator
 */
export function tagged(namespace, factoryCreator) {
  /** @type {Map<string, Factory<T>>} */  // WORKS: T is defined
  const cache = new Map();
}
```

---

## The Hybrid Approach (This Library's Strategy)

| Pattern | When to Use | Examples in lib/core.js |
|---------|-------------|-------------------------|
| `@type {Types.fn}` | T not needed internally | `transient`, `named`, `decorator` |
| `@template T` | T needed for internal annotations | `lazy`, `timeout`, `tagged` |

---

## Quick Pattern Reference

Full documentation: **[../nobuild-ts-experiments/docs/patterns/index.md](../nobuild-ts-experiments/docs/patterns/index.md)**

| Pattern | When to Use | Key Insight |
|---------|-------------|-------------|
| 1. Type Inheritance | Simple functions | `@type {Types.fn}` |
| 2. Template Scope | Need T internally | `@template T` |
| 3. Control Flow | Lazy/caching | `{ value: T } \| null` wrapper |
| 4. Helper Extraction | Object methods | Extract for `@template`, `@param` for non-generic |
| 5. Escape Hatches | When casts needed | Never `any`, prefer `@type {T}` |
| 6. Assertion Functions | Validating input | `@returns {asserts value is T}` |
| 7. Mutation vs Inference | Object composition | Spread > Object.assign |
| 8. Builder Pattern | Plugin composition | Chain `.and()` calls |
| 9. @satisfies Pattern | Preserve literals | Validate without widening |
| 10. Breaking Inference | Factory functions | Control where T comes from |
| 11. Nested Returns | Decorators/currying | Inner params need explicit types |
| 12. Overload Threading | Variadic composition | `.d.ts` overloads, simple `.js` |
| 13. Internal Types | Private helpers | Use `internal.d.ts` |

---

## Escape Hatch Hierarchy

**Read full details: [../nobuild-ts-experiments/docs/patterns/05-escape-hatches.md](../nobuild-ts-experiments/docs/patterns/05-escape-hatches.md)**

| Level | Cast | Use When |
|-------|------|----------|
| 1 | No cast | Goal - TypeScript verifies everything |
| 2 | `@type {T}` | You know it's the generic T |
| 3 | `@type {A & B}` | Fixed-arity intersection |
| 4 | `@type {never}` | Variadic/dynamic patterns (last resort) |
| 5 | `any` | **NEVER USE** - spreads virally |

---

## Decision Tree

```
Does your function need internal type annotations?
├── No → Pattern 1: @type {Types.fn}
└── Yes → Does it need to reference T?
    ├── No → Pattern 1: @type {Types.fn}
    └── Yes → Pattern 2: @template T
        └── Is it an object method?
            ├── Yes → Pattern 4: Helper Extraction
            └── No → Is there lazy/cached state?
                ├── Yes → Pattern 3: Wrapper Objects
                └── No → Pattern 2 is sufficient
```

---

## File Structure

```
lib/
├── core.js        # Runtime (uses @type or @template)
├── core.d.ts      # Consumer types (full docs, @example)
├── internal.d.ts  # Internal helper types
├── errors.js/.d.ts
└── presets.js/.d.ts
```

| Content | Location |
|---------|----------|
| Public signatures, @example | `core.d.ts` |
| Internal helpers | `internal.d.ts` |
| Implementation JSDoc | `core.js` (minimal) |

---

## Key Finding: .d.ts Wins

**When both `.js` and `.d.ts` exist, VS Code shows docs from `.d.ts`.**

Consumer-facing documentation belongs in `.d.ts` files.

---

## The .js vs .d.ts Split (IMPORTANT)

| Content | Where it belongs |
|---------|------------------|
| `@example` blocks | `.d.ts` ONLY |
| Prose descriptions | `.d.ts` ONLY |
| `@returns` | `.d.ts` ONLY (redundant in `.js` when `.d.ts` exists) |
| `@template` | `.js` (to put T in scope) |
| `@param` | `.js` (when params aren't inferred) |
| `@type` | `.js` (for inner functions/variables) |

**Look at `lib/core.js`** - it has ZERO `@example` blocks. All examples are in `lib/core.d.ts`.

**Key insight:** `@returns` is usually redundant in `.js` files when a `.d.ts` exists. The return type comes from the `.d.ts`.

**Exception:** When the return type introduces its own generic (not from `@template`):

```javascript
// NO @template - the <T> is introduced in the return type
/**
 * @param {number} attempts
 * @returns {<T>(factory: Factory<T>) => Factory<Promise<T>>}
 */
export function retry(attempts) { ... }
```

Here `@returns` IS needed because we're returning a generic function and T isn't in scope from `@template`. See `retry()` and `withTimeout()` in `lib/plugins/patterns.js`.

---

## Overload Threading for Variadic Composition

**Full documentation: [../nobuild-ts-experiments/docs/patterns/12-overload-threading.md](../nobuild-ts-experiments/docs/patterns/12-overload-threading.md)**

For `pipe()` and similar composition functions, use `.d.ts` overloads to thread types:

```typescript
// .d.ts - one overload per arity, each output flows to next input
export declare function pipe<T, R1>(factory: Factory<T>, d1: (f: Factory<T>) => Factory<R1>): Factory<R1>
export declare function pipe<T, R1, R2>(factory: Factory<T>, d1: ..., d2: (f: Factory<R1>) => Factory<R2>): Factory<R2>
// ... up to 8
```

```javascript
// .js - trivially simple
export function pipe(factory, ...decorators) {
  return decorators.reduce((f, d) => d(f), factory)
}
```

All complexity in `.d.ts`, simple implementation in `.js`. See `lib/plugins/patterns.d.ts` for the real example.

**Common mistake:** Agents see verbose JSDoc in a `.js` file and think "I should clean this up" - then they strip the type annotations along with the examples, breaking the type checker.

**The rule:**
- `.js` files: Minimal JSDoc. Only `@template`, `@param`, `@type` for internal type safety. No prose, no examples, usually no `@returns`.
- `.d.ts` files: Full documentation. Examples, descriptions, return types, usage notes.

---

## Commands

```bash
npx tsc --noEmit  # Type check - should pass with zero errors
npm test          # Run tests
```

---

## Nested Returned Functions Pattern (Used in lib/plugins/patterns.js)

**Full documentation: [../nobuild-ts-experiments/docs/patterns/11-nested-returns.md](../nobuild-ts-experiments/docs/patterns/11-nested-returns.md)**

When a function returns a function that returns a function (decorators, currying), inner function parameters are NOT inferred from `.d.ts`:

```javascript
// .d.ts says: function guard(fn): <T>(factory: Factory<T>) => Factory<T>

/** @type {Types.guard} */
export function guard(guardFn) {
  return (factory) => {
    const guarded = (c) => {  // c is 'any'! Not inferred from Factory<T>
      return factory(c)
    }
    return guarded
  }
}
```

**Fix 1:** Add explicit `@param` to inner functions:

```javascript
const guarded = (c) => {  // Still 'any'
/** @param {Types.Container} c */
const guarded = (c) => {  // Now typed!
```

**Fix 2:** Type the entire inner function with `@type`:

```javascript
/**
 * @template T
 * @param {PatternTypes.Factory<T>} factory
 * @returns {PatternTypes.Factory<T>}
 */
const decorator = (factory) => {
  /** @type {PatternTypes.Factory<T>} */
  const guarded = (c) => {
    // c is now Container (from Factory<T> definition)
    return factory(c)
  }
  return guarded
}
```

**Fix 3:** For type-changing decorators (like `retry`: `T → Promise<T>`), use `.d.ts` overloads:

```typescript
// In .d.ts - each decorator output flows to next input
export declare function pipe<T, R1>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>
): Factory<R1>

export declare function pipe<T, R1, R2>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>
): Factory<R2>
// ... up to 8 decorators
```

This enables perfect type inference for decorator composition.

---

## Plugin Pattern (Used in lib/plugins/)

Object literal methods with `@type {Plugin<...>}` do NOT get parameter types inferred:

```javascript
// Parameters are 'any' - TypeScript doesn't infer from Plugin interface!
/** @type {Types.Plugin<HealthMethods>} */
export const health = {
  name: "health",
  apply(container, internals) {  // container/internals are 'any'!
    return { ... }
  },
}
```

**Fix:** Add explicit `@param` annotations:

```javascript
/** @type {Types.Plugin<HealthMethods>} */
export const health = {
  name: "health",
  /**
   * @param {Types.Container} container
   * @param {Types.ContainerInternals} internals
   */
  apply(container, internals) {
    return { ... }
  },
}
```

All plugins in `lib/plugins/` follow this pattern.

---

## Goal: Zero Escape Hatches

This library targets **zero** `any` or `@type {never}`.

When stuck, apply patterns in order:
1. Pattern 2: `@template T` to put T in scope
2. Pattern 3: Wrapper object `{ value: T } | null`
3. Pattern 4: Helper extraction for object methods
4. Only then consider honest casts (`@type {T}`)
