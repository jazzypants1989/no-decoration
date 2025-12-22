// =============================================================================
// Patterns - Compositional Decorators
// =============================================================================
// Run with: node examples/patterns.js
//
// This example shows how to use the patterns plugin for:
//   1. pipe() - Compose decorators onto factories
//   2. guard() - Access control
//   3. validate() - Transform/validate resolved values
//   4. intercept() - Wrap resolution (timing, logging, caching)
//   5. catchError() - Handle resolution errors
//   6. Utility decorators - tap, transform, memo, retry, withTimeout
//   7. Conditional decorators - when, ifElse
// =============================================================================

import { createContainer, factory } from "no-decoration"
import {
  pipe,
  guard,
  validate,
  intercept,
  catchError,
  tap,
  transform,
  memo,
  retry,
  withTimeout,
  when,
  ifElse,
  GuardError,
} from "no-decoration/patterns"

/** @import * as Types from 'no-decoration' */
/** @import * as PatternTypes from 'no-decoration/patterns' */

// =============================================================================
// 1. PIPE - Compose Decorators
// =============================================================================
// pipe() is the foundation. It applies decorators left-to-right.

console.log("=== 1. pipe() - Composing Decorators ===\n")

// Simple example: factory with no decorators
const simpleFactory = factory("Simple", () => ({ value: 42 }))

// Same factory with decorators
const decoratedFactory = pipe(
  factory("Decorated", () => ({ value: 42 })),
  (f) => (c) => ({ ...f(c), decorated: true }),
  (f) => (c) => ({ ...f(c), timestamp: Date.now() })
)

const container = createContainer()
console.log("Simple:", container.get(simpleFactory))
console.log("Decorated:", container.get(decoratedFactory))

// =============================================================================
// 2. GUARD - Access Control
// =============================================================================
// Guards run BEFORE resolution. They can throw or return false to deny access.

console.log("\n=== 2. guard() - Access Control ===\n")

// Simulate a user context
/** @type {{ id: number, roles: string[], email?: string } | null} */
let currentUser = null

const requireAuth = () => {
  if (!currentUser) throw new Error("Not authenticated")
}

/**
 * @param {string} role
 */
const requireRole = (role) => () => {
  if (!currentUser?.roles?.includes(role)) {
    return false // Returns false = GuardError thrown
  }
  return true
}

const adminService = pipe(
  factory("AdminService", () => ({
    /** @param {string} id */
    deleteUser: (id) => console.log(`Deleting user ${id}`),
  })),
  guard(requireAuth),
  guard(requireRole("admin"))
)

// Try without authentication
try {
  createContainer().get(adminService)
} catch (e) {
  console.log("Without auth:", e instanceof Error ? e.message : e)
}

// Try with regular user
currentUser = { id: 1, roles: ["user"] }
try {
  createContainer().get(adminService)
} catch (e) {
  console.log("Regular user:", e instanceof GuardError ? "Access denied" : e instanceof Error ? e.message : e)
}

// Try with admin
currentUser = { id: 1, roles: ["admin"] }
const admin = createContainer().get(adminService)
console.log("Admin access:", admin ? "Granted!" : "Denied")

// =============================================================================
// 3. VALIDATE - Transform/Validate Values
// =============================================================================
// Validators run AFTER resolution. They can transform or validate the result.

console.log("\n=== 3. validate() - Transform/Validate ===\n")

// Custom validator function
/**
 * @template {object} T
 * @param {T & { id?: string }} value
 * @returns {T & { id: string }}
 */
const ensureHasId = (value) => {
  if (!value.id) throw new Error("Missing required field: id")
  return /** @type {T & { id: string }} */ (value)
}

// Transform validator
/**
 * @template {object} T
 * @param {T} value
 * @returns {T & { createdAt: string }}
 */
const addTimestamp = (value) => ({
  ...value,
  createdAt: new Date().toISOString(),
})

// Schema-like validator (works with Zod, Valibot, etc.)
const userSchema = {
  /** @param {unknown} value */
  parse(value) {
    const v = /** @type {{ email?: string }} */ (value)
    if (!v.email?.includes("@")) {
      throw new Error("Invalid email format")
    }
    return { .../** @type {object} */ (value), validated: true }
  },
}

// Note: When chaining validators with different return types, each step transforms the type
const userFactory = factory("User", () => {
  const base = { id: "user-123", email: "alice@example.com", name: "Alice" }
  const withId = ensureHasId(base)
  const withTimestamp = addTimestamp(withId)
  const validated = userSchema.parse(withTimestamp)
  return validated
})

console.log("Validated user:", createContainer().get(userFactory))

// =============================================================================
// 4. INTERCEPT - Wrap Resolution
// =============================================================================
// Interceptors wrap the ENTIRE resolution. Great for logging, timing, caching.

console.log("\n=== 4. intercept() - Wrap Resolution ===\n")

// Timing interceptor - no need for explicit generics, intercept() handles it
/** @type {<T>(next: () => T, ctx: PatternTypes.InterceptContext<T>) => T} */
const timing = (next, ctx) => {
  const start = Date.now()
  const result = next()
  const ms = Date.now() - start
  console.log(`  [timing] ${ctx.factory.displayName} resolved in ${ms}ms`)
  return result
}

// Logging interceptor
/** @type {<T>(next: () => T, ctx: PatternTypes.InterceptContext<T>) => T} */
const logging = (next, ctx) => {
  console.log(`  [log] Resolving ${ctx.factory.displayName}...`)
  const result = next()
  console.log(`  [log] Resolved ${ctx.factory.displayName}:`, typeof result)
  return result
}

// Caching interceptor (manual cache, different from container's singleton)
/**
 * @param {number} ttl
 * @returns {<T>(next: () => T, ctx: PatternTypes.InterceptContext<T>) => T}
 */
const createCache = (ttl) => {
  /** @type {unknown} */
  let cached = null
  let expiry = 0
  return (next, _ctx) => {
    if (cached && Date.now() < expiry) {
      console.log("  [cache] HIT")
      return /** @type {ReturnType<typeof next>} */ (cached)
    }
    console.log("  [cache] MISS")
    cached = next()
    expiry = Date.now() + ttl
    return /** @type {ReturnType<typeof next>} */ (cached)
  }
}

let callCount = 0
const expensiveService = pipe(
  factory("ExpensiveService", () => {
    callCount++
    // Simulate expensive computation
    const start = Date.now()
    while (Date.now() - start < 50) {}
    return { computed: true, call: callCount }
  }),
  intercept(timing),
  intercept(logging),
  intercept(createCache(5000))
)

console.log("First call:")
const c1 = createContainer()
console.log("Result:", c1.get(expensiveService))

console.log("\nSecond call (cached):")
console.log("Result:", c1.get(expensiveService))

// =============================================================================
// 5. CATCH ERROR - Error Handling
// =============================================================================
// catchError handles errors during resolution.

console.log("\n=== 5. catchError() - Error Handling ===\n")

let shouldFail = true

const unreliableService = pipe(
  factory("UnreliableService", () => {
    if (shouldFail) {
      throw new Error("Service temporarily unavailable")
    }
    return { status: "ok", data: [1, 2, 3] }
  }),
  catchError((error, ctx) => {
    console.log(`  [error] ${ctx.factory.displayName} failed: ${error instanceof Error ? error.message : error}`)
    return { status: "fallback", data: /** @type {number[]} */ ([]) }
  })
)

console.log("When service fails:")
console.log("Result:", createContainer().get(unreliableService))

shouldFail = false
console.log("\nWhen service succeeds:")
console.log("Result:", createContainer().get(unreliableService))

// =============================================================================
// 6. UTILITY DECORATORS
// =============================================================================

console.log("\n=== 6. Utility Decorators ===\n")

// tap() - Side effects without modifying value
console.log("tap():")
const withTap = pipe(
  factory("TapExample", () => ({ items: [1, 2, 3] })),
  tap((value) => console.log("  Resolved with", value.items.length, "items"))
)
createContainer().get(withTap)

// transform() - Map the resolved value
console.log("\ntransform():")
const withTransform = pipe(
  factory("TransformExample", () => ({ users: [{ id: 1 }, { id: 2 }] })),
  transform((value) => value.users.map((/** @type {{ id: number }} */ u) => u.id))
)
console.log("  IDs:", createContainer().get(withTransform))

// memo() - Cache forever (across containers)
console.log("\nmemo():")
let memoCallCount = 0
const memoized = memo()
const withMemo = pipe(
  factory("MemoExample", () => ({ call: ++memoCallCount })),
  memoized
)
console.log("  Container 1:", createContainer().get(withMemo))
console.log("  Container 2:", createContainer().get(withMemo))
console.log("  Call count:", memoCallCount, "(should be 1)")

// retry() - Retry on failure
console.log("\nretry():")
let retryAttempts = 0
const withRetry = pipe(
  factory("RetryExample", () => {
    retryAttempts++
    if (retryAttempts < 3) throw new Error("Not yet")
    return { success: true, attempts: retryAttempts }
  }),
  retry(3, 100)
)
console.log("  Result:", await createContainer().get(withRetry))

// withTimeout() - Timeout slow factories
console.log("\nwithTimeout():")
const fastFactory = pipe(
  factory("FastFactory", async () => {
    await new Promise((r) => setTimeout(r, 50))
    return { fast: true }
  }),
  withTimeout(1000)
)
console.log("  Fast result:", await createContainer().get(fastFactory))

// =============================================================================
// 7. CONDITIONAL DECORATORS
// =============================================================================

console.log("\n=== 7. Conditional Decorators ===\n")

const isDev = process.env.NODE_ENV !== "production"

// when() - Apply decorator conditionally
/**
 * @template T
 * @param {PatternTypes.Factory<T>} f
 * @returns {PatternTypes.Factory<T>}
 */
const devLogging = (f) => (c) => {
  console.log("  [dev] Resolving factory...")
  return f(c)
}

const conditionalService = pipe(
  factory("ConditionalService", () => ({ env: isDev ? "dev" : "prod" })),
  when(isDev, devLogging)
)

console.log("when() - only logs in dev:")
console.log("Result:", createContainer().get(conditionalService))

// ifElse() - Apply different decorators based on condition
// Both branches must preserve the type. For different shapes, use
// container.override() in tests or handle the logic inside the factory.
const isTest = false

const branchingService = pipe(
  factory("BranchingService", () => ({ base: true })),
  ifElse(
    isTest,
    tap((v) => console.log("  [test] Resolved:", v)),
    tap((v) => console.log("  [prod] Resolved:", v))
  )
)

console.log("\nifElse() - different branches:")
createContainer().get(branchingService)

// =============================================================================
// REAL-WORLD EXAMPLE: Protected API Service
// =============================================================================

console.log("\n=== Real-World Example: Protected API Service ===\n")

// Reset user for this example
currentUser = { id: 1, roles: ["user"], email: "user@example.com" }

// Request context simulation
class RequestContext {
  /** @param {{ id: number, roles: string[], email?: string }} user */
  constructor(user) {
    this.user = user
    this.requestId = Math.random().toString(36).slice(2, 10)
  }
}

const requestContext = factory("RequestContext", () => new RequestContext(/** @type {NonNullable<typeof currentUser>} */ (currentUser)))

// A complete API service with all the patterns
const apiService = pipe(
  factory("APIService", (c) => {
    const ctx = c.get(requestContext)
    return {
      getData: () => ({
        requestId: ctx.requestId,
        user: ctx.user.email,
        data: ["item1", "item2", "item3"],
      }),
    }
  }),
  // Access control
  guard(() => {
    if (!currentUser) throw new Error("Authentication required")
  }),
  // Logging
  intercept((next, ctx) => {
    console.log(`  [${new Date().toISOString()}] Resolving ${ctx.factory.displayName}`)
    return next()
  }),
  // Error handling - fallback must return same shape as success
  catchError((err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error("  API Error:", message)
    return {
      getData: () => ({
        requestId: "error",
        user: /** @type {string | undefined} */ (undefined),
        data: ["error: " + message],
      }),
    }
  }),
  // Validation
  validate((service) => {
    if (typeof service.getData !== "function") {
      throw new Error("Invalid API service")
    }
    return service
  })
)

const c = createContainer()
const api = /** @type {{ getData: () => object }} */ (c.get(apiService))
console.log("API Response:", api.getData())

console.log("\n=== Patterns Examples Complete ===")
