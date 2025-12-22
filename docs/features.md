# Features

This document covers all the features of no-decoration in detail.

## Multiple Dependencies

Services often depend on many things. Use `factory()` with `c.get()` for each dependency:

```ts
class UserService {
  constructor(
    private db: Database,
    private logger: Logger,
    private cache: Cache,
    private config: Config
  ) {}
}

// Recommended: factory() helper
const userService = factory("UserService", (c) =>
  new UserService(c.get(db), c.get(logger), c.get(cache), c.get(config))
)

// Alternative: inject() helper - types inferred, less typing
const userService = inject(UserService, db, logger, cache, config)
```

## Async Factories

For database connections, HTTP clients, anything async:

```ts
// Async factories return Factory<Promise<T>>
const database = factory("Database", async (c) => {
  const cfg = c.get(config)
  const db = await Database.connect(cfg.dbUrl)
  c.onDispose(() => db.close()) // Cleanup on dispose
  return db
})

// Usage - just await it
const db = await container.get(database)
```

## Disposal / Cleanup

Register cleanup functions, called in reverse order (LIFO):

```ts
const server = factory("Server", (c) => {
  const srv = new Server(c.get(config))
  c.onDispose(() => srv.stop())
  return srv
})

// Later: clean up everything
await container.dispose()
```

## Child Containers (Per-Request Scoping)

Child containers inherit parent singletons but have their own cache:

```ts
import { createContainer, childContainer, factory } from "no-decoration"

const app = createContainer()

function handleRequest(userId: string) {
  const request = childContainer(app) // Inherits app singletons

  // Request-specific factory
  const ctx = factory("RequestContext", () => new RequestContext(userId))
  const handler = factory("Handler", (c) => new Handler(c.get(logger), c.get(ctx)))

  return request.get(handler).handle()
}
```

## Circular Dependency Detection

Enabled by default. Throws a helpful error instead of stack overflow:

```js
const a = factory("A", (c) => ({ b: c.get(b) }))
const b = factory("B", (c) => ({ a: c.get(a) }))

container.get(a)
// CircularDependencyError: Circular dependency detected: A -> B -> A
//
// How to fix:
//   1. Use lazy() to defer resolution
//   2. Restructure dependencies to break the cycle
```

Disable for performance (not recommended):

```js
const container = createContainer({ detectCircular: false })
```

## Testing Support

The killer feature of DI is easy testing. Override any factory with a mock:

```ts
const container = createContainer()

// Override with a mock
container.override(database, () => mockDatabase)
container.override(httpClient, () => mockHttpClient)

// Now all resolutions use mocks
const service = container.get(userService) // Uses mocks!
```

Batch mocking with `withMocks` (requires testing plugin):

```ts
import { testing } from "no-decoration/plugins"

const testContainer = createContainer()
  .with(testing)
  .withMocks([
    [database, () => mockDatabase],
    [logger, () => mockLogger],
  ])
```

Snapshot/restore for test isolation:

```ts
const snapshot = container.snapshot()
// ... run tests that modify state ...
container.restore(snapshot)
```

## Transient Factories

By default, factories are singletons. Use `transient` option for fresh instances:

```ts
const command = factory("Command", () => new Command(), { transient: true })

const cmd1 = container.get(command) // New instance
const cmd2 = container.get(command) // Different instance
```

## Lazy Resolution

Break circular dependencies with `lazy()`:

```ts
import { lazy } from "no-decoration"

// A needs B, B needs A - circular!
const serviceA = factory("ServiceA", (c) => new ServiceA(lazy(c, serviceB)))
const serviceB = factory("ServiceB", (c) => new ServiceB(c.get(serviceA)))

// ServiceA gets a lazy reference to B
// B is only resolved when .value is accessed
```

## Observability

Track resolutions with events (requires observability plugin):

```ts
import { observability } from "no-decoration/plugins"

const container = createContainer().with(observability)

container.on("resolve", (factory, instance, ms) => {
  console.log(`Resolved ${factory.displayName} in ${ms}ms`)
})
```

Visualize the dependency graph:

```ts
const graph = container.getDependencyGraph()
console.log(graph.toMermaid())
// graph TD
//   UserService --> Database
//   UserService --> Logger
//   Database --> Config
```

Validate at startup:

```ts
await container.validate([database, userService, authMiddleware])
// Throws if any factory fails to resolve
```

## Health Checks

Register health checks and run them all at once (requires health plugin):

```ts
import { health } from "no-decoration/plugins"

const container = createContainer().with(health)

const database = factory("Database", async (c) => {
  const db = await Database.connect()
  c.onHealthCheck("database", () => db.ping())
  return db
})

// Later, in your /health endpoint:
const report = await container.checkHealth()
res.status(report.healthy ? 200 : 503).json(report)
```

## Interceptors

Wrap every resolution with cross-cutting concerns (AOP):

```ts
const timingInterceptor = (factory, next) => {
  const start = performance.now()
  const result = next()
  console.log(`${factory.displayName}: ${performance.now() - start}ms`)
  return result
}

const container = createContainer({
  interceptors: [timingInterceptor],
})
```

## Debug Mode

Enable detailed logging during development (requires debug plugin):

```ts
import { debug } from "no-decoration/plugins"

const container = createContainer().with(debug)
// Logs all resolutions with timing
// Warns about slow factories and anonymous factories
```

Or with custom options:

```ts
const container = createContainer().with(
  debug.configure({
    timing: true,
    warnings: true,
    logger: myCustomLogger,
  })
)
```

## Timeout Protection

Prevent hung factories from blocking your application:

```ts
const slowService = factory("SlowService", async (c) => {
  // If this takes more than 5 seconds, throws TimeoutError
  return await connectToSlowThing()
}, { timeout: 5000 })
```

## Container Freezing

Prevent new resolutions after initialization (production safety):

```ts
// Resolve all required factories at startup
await container.get(database)
await container.get(cache)
container.get(userService)

// Freeze - no new resolutions allowed
container.freeze()

// Later: this throws FrozenContainerError
container.get(someUnresolvedFactory)
```
