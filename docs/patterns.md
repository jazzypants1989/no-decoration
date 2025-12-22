# Patterns

Compositional decorators for factories. This is how no-decoration achieves feature parity with NestJS guards, pipes, interceptors, and exception filters—without any actual decorators.

```javascript
import { pipe, guard, validate, intercept, catchError } from "no-decoration/patterns"

const userService = pipe(
  factory("UserService", fn),
  guard(requireAuth),
  validate(userSchema),
  intercept(timing),
  catchError(fallback)
)
```

## The Key Insight

NestJS decorators like `@UseGuards()` and `@UsePipes()` are just function composition with extra steps. The patterns plugin makes this explicit:

| NestJS | no-decoration |
|--------|---------------|
| `@UseGuards(AuthGuard)` | `guard(requireAuth)` |
| `@UsePipes(ValidationPipe)` | `validate(schema)` |
| `@UseInterceptors(LoggingInterceptor)` | `intercept(logging)` |
| `@Catch(HttpException)` | `catchError(handler)` |

Same capabilities. No magic. No metadata reflection. Just functions.

## pipe()

Compose decorators onto a factory. Decorators apply left-to-right:

```javascript
const service = pipe(
  factory("Service", fn),
  firstDecorator,   // Applied first
  secondDecorator,  // Applied second
  thirdDecorator    // Applied last
)
```

Each decorator wraps the previous result, so execution order is:
1. `thirdDecorator` runs first (outermost)
2. `secondDecorator` runs second
3. `firstDecorator` runs third
4. Original factory runs last (innermost)

This is standard function composition: `third(second(first(factory)))`.

## guard()

Access control that runs **before** resolution. Guards can:
- Throw an error to reject with a custom message
- Return `false` to reject with a `GuardError`
- Return `true` or `void` to allow

```javascript
import { guard, GuardError } from "no-decoration/patterns"

// Throw to reject with custom error
const requireAuth = () => {
  if (!currentUser) throw new Error("Authentication required")
}

// Return false to reject with GuardError
const requireRole = (role) => () => {
  return currentUser?.roles?.includes(role) ?? false
}

// Compose multiple guards
const adminService = pipe(
  factory("AdminService", fn),
  guard(requireAuth),
  guard(requireRole("admin"))
)

// Async guards work too
const requireValidToken = async () => {
  const valid = await validateToken(currentToken)
  if (!valid) throw new Error("Invalid token")
}
```

**When to use:** Authentication, authorization, rate limiting, feature flags.

## validate()

Validation that runs **after** resolution. Works with:
- Custom validator functions
- Zod, Valibot, or any schema with a `.parse()` method

```javascript
import { validate, ValidationError } from "no-decoration/patterns"

// Custom function
const ensureHasId = (value) => {
  if (!value.id) throw new Error("Missing id")
  return value
}

// Zod schema
import { z } from "zod"
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
})

// Apply validation
const userFactory = pipe(
  factory("User", fn),
  validate(ensureHasId),
  validate(userSchema)
)
```

Validators can also transform values:

```javascript
const addTimestamp = (value) => ({
  ...value,
  createdAt: new Date().toISOString()
})

const withTimestamp = pipe(
  factory("Record", fn),
  validate(addTimestamp)
)
```

**When to use:** Schema validation, data normalization, ensuring invariants.

## intercept()

Wrap the entire resolution process. Interceptors receive a `next` function and context:

```javascript
import { intercept } from "no-decoration/patterns"

const timing = (next, ctx) => {
  const start = Date.now()
  const result = next()
  console.log(`${ctx.factory.displayName}: ${Date.now() - start}ms`)
  return result
}

const logging = (next, ctx) => {
  console.log(`Resolving ${ctx.factory.displayName}...`)
  const result = next()
  console.log(`Done.`)
  return result
}

const service = pipe(
  factory("Service", fn),
  intercept(timing),
  intercept(logging)
)
```

Build a TTL cache:

```javascript
const cache = (ttl) => {
  let cached = null
  let expiry = 0

  return (next, ctx) => {
    if (cached && Date.now() < expiry) return cached
    cached = next()
    expiry = Date.now() + ttl
    return cached
  }
}

const cachedService = pipe(
  factory("Expensive", fn),
  intercept(cache(5000))
)
```

**When to use:** Timing, logging, caching, metrics, tracing.

## catchError()

Handle errors during resolution with a fallback:

```javascript
import { catchError } from "no-decoration/patterns"

const withFallback = pipe(
  factory("Flaky", fn),
  catchError((error, ctx) => {
    console.error(`${ctx.factory.displayName} failed:`, error)
    return { status: "fallback", data: [] }
  })
)
```

Rethrow after logging:

```javascript
const logAndRethrow = pipe(
  factory("Service", fn),
  catchError((error, ctx) => {
    logger.error(`Resolution failed: ${ctx.factory.displayName}`, error)
    throw error
  })
)
```

**When to use:** Fallbacks, error logging, graceful degradation.

## Utility Decorators

### tap()

Side effects without modifying the value:

```javascript
import { tap } from "no-decoration/patterns"

const withLogging = pipe(
  factory("Users", fn),
  tap((users) => console.log(`Loaded ${users.length} users`))
)
```

### transform()

Map the resolved value:

```javascript
import { transform } from "no-decoration/patterns"

const userIds = pipe(
  factory("Users", fn),
  transform((users) => users.map(u => u.id))
)
```

### memo()

Cache forever, across all containers:

```javascript
import { memo } from "no-decoration/patterns"

const config = pipe(
  factory("Config", loadConfig),
  memo()
)

// Same instance regardless of container
container1.get(config) === container2.get(config) // true
```

**Note:** Different from container singletons. `memo()` caches globally; container singletons cache per-container.

### retry()

Retry failed resolutions:

```javascript
import { retry } from "no-decoration/patterns"

const resilient = pipe(
  factory("API", connect),
  retry(3, 1000)  // 3 attempts, 1s delay between
)

// Returns Promise<T>
await container.get(resilient)
```

### withTimeout()

Timeout slow factories:

```javascript
import { withTimeout } from "no-decoration/patterns"

const bounded = pipe(
  factory("SlowDB", connect),
  withTimeout(5000)  // Fail after 5s
)

// Returns Promise<T>
await container.get(bounded)
```

## Conditional Decorators

### when()

Apply a decorator only if a condition is true:

```javascript
import { when } from "no-decoration/patterns"

const isDev = process.env.NODE_ENV !== "production"

const service = pipe(
  factory("Service", fn),
  when(isDev, intercept(verboseLogging))
)
```

The condition can be a boolean or a function:

```javascript
when(() => featureFlags.isEnabled("newAuth"), guard(newAuthGuard))
```

### ifElse()

Choose between decorators based on a condition:

```javascript
import { ifElse } from "no-decoration/patterns"

const isTest = process.env.NODE_ENV === "test"

const database = pipe(
  factory("Database", fn),
  ifElse(
    isTest,
    transform(() => mockDb),
    intercept(connectionPooling)
  )
)
```

## Real-World Example

A protected API service with all the patterns:

```javascript
import { createContainer, factory } from "no-decoration"
import { pipe, guard, validate, intercept, catchError } from "no-decoration/patterns"
import { z } from "zod"

// Auth guard
const requireAuth = () => {
  const user = getCurrentUser()
  if (!user) throw new Error("Authentication required")
}

// Response schema
const responseSchema = z.object({
  data: z.array(z.unknown()),
  meta: z.object({
    total: z.number(),
    page: z.number(),
  }),
})

// Timing interceptor
const timing = (next, ctx) => {
  const start = Date.now()
  const result = next()
  if (result instanceof Promise) {
    return result.then(r => {
      metrics.record(ctx.factory.displayName, Date.now() - start)
      return r
    })
  }
  metrics.record(ctx.factory.displayName, Date.now() - start)
  return result
}

// Error fallback
const fallback = (error, ctx) => {
  logger.error(`${ctx.factory.displayName} failed`, error)
  return { data: [], meta: { total: 0, page: 1 } }
}

// Compose everything
const apiService = pipe(
  factory("APIService", (c) => ({
    async fetch(page) {
      const response = await fetch(`/api/items?page=${page}`)
      return response.json()
    }
  })),
  guard(requireAuth),
  intercept(timing),
  catchError(fallback),
  validate(responseSchema)
)
```

## Error Types

The patterns plugin exports two error classes:

```javascript
import { GuardError, ValidationError } from "no-decoration/patterns"

try {
  container.get(guardedFactory)
} catch (e) {
  if (e instanceof GuardError) {
    console.log("Access denied:", e.factoryName)
  }
  if (e instanceof ValidationError) {
    console.log("Validation failed:", e.cause)
  }
}
```

## Comparison with NestJS

```typescript
// NestJS
@Injectable()
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
class UserService {
  @UsePipes(ValidationPipe)
  async getUser(@Param('id') id: string) {
    return this.userRepo.find(id)
  }
}

// no-decoration
const userService = pipe(
  factory("UserService", (c) => ({
    getUser: (id) => c.get(userRepo).find(id)
  })),
  guard(requireAuth),
  intercept(logging),
  validate(userSchema)
)
```

Same result. One uses reflection and decorators. One uses functions. Both work. One is easier to debug.
