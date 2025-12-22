# API Reference

## Types

```ts
type Factory<T> = (container: Container) => T

interface Container {
  // Core
  get<T>(factory: Factory<T>): T
  has<T>(factory: Factory<T>): boolean
  resolver<T>(factory: Factory<T>): () => T

  // Lifecycle
  onDispose(fn: () => void | Promise<void>): void
  dispose(): Promise<void>

  // Testing
  tryGet<T>(factory: Factory<T>): T | undefined
  override<T>(factory: Factory<T>, replacement: Factory<T>): void
  clearOverrides(): void
  clearCache(): void

  // Production
  freeze(): void
  warmup(factories: Factory<unknown>[]): Promise<this>
  asReadOnly(): ReadOnlyContainer

  // Plugin System
  with<T extends object>(plugin: Plugin<T>): this & T
}

interface ContainerOptions {
  detectCircular?: boolean  // default: true
  interceptors?: Interceptor[]
}
```

## Core Functions

### `createContainer(options?): Container`

Creates a new dependency injection container.

```ts
const container = createContainer()

// Disable circular dependency detection (not recommended)
const container = createContainer({ detectCircular: false })
```

### `childContainer(parent, options?): Container`

Creates a child container that inherits resolved instances from the parent.

Child containers have their own cache and disposal. Parent singletons are shared; child-specific factories are isolated.

```ts
const app = createContainer()

function handleRequest(userId: string) {
  const request = childContainer(app)
  // ... use request container
  await request.dispose() // Only disposes request-scoped resources
}
```

### `factory(name, fn, options?): Factory<T>`

**The recommended way to create factories.** Creates a named factory with optional configuration.

```ts
// Basic factory
const config = factory("Config", () => new Config())

// With dependencies
const userService = factory("UserService", (c) =>
  new UserService(c.get(database), c.get(logger))
)

// Transient (new instance each time)
const command = factory("Command", () => new Command(), { transient: true })

// With timeout
const slowService = factory("SlowService", async (c) => {
  return await connectToSlowThing()
}, { timeout: 5000 })
```

**Options:**
- `transient?: boolean` - Create new instance every time (default: false)
- `timeout?: number` - Timeout in milliseconds for async factories

### `inject(Class, ...dependencies): Factory<T>`

Helper to create a factory from a class and its dependencies. Pure convenience - these are equivalent:

```ts
const userService = inject(UserService, db, logger)
const userService = factory("UserService", (c) =>
  new UserService(c.get(db), c.get(logger))
)
```

## Container Methods

### `container.get(factory): T`

Resolves a factory, returning the cached instance or creating a new one.

- Results are cached (singleton behavior)
- Async factories return promises - just `await` them
- Throws on circular dependencies (if `detectCircular` is enabled)

```ts
const logger = container.get(loggerFactory) // Logger
const db = await container.get(databaseFactory) // Promise<Database> -> Database
```

### `container.onDispose(fn): void`

Registers a cleanup function to be called when `dispose()` is invoked.

- Cleanup functions run in reverse order (LIFO)
- Can be sync or async

```ts
const database = factory("Database", async (c) => {
  const db = await Database.connect(c.get(config).dbUrl)
  c.onDispose(() => db.close())
  return db
})
```

### `container.dispose(): Promise<void>`

Calls all registered cleanup functions and clears the cache.

- Runs disposers in reverse order (LIFO)
- Aggregates errors into `AggregateError` if multiple disposers fail
- Safe to call multiple times (cache is cleared)

```ts
await container.dispose()
```

### `container.has(factory): boolean`

Checks if a factory has been resolved (exists in cache or parent cache).

```ts
if (container.has(databaseFactory)) {
  // Database was already initialized
}
```

### `container.override(factory, replacement): void`

Replace a factory with a different implementation. Useful for testing.

```ts
container.override(database, () => mockDatabase)
```

### `container.freeze(): void`

Prevents new factories from being resolved. Only cached factories can be accessed.

```ts
container.get(database)
container.get(cache)
container.freeze()
// Now only database and cache can be accessed
```

### `container.warmup(factories): Promise<this>`

Pre-resolve factories so child containers share the cached instances. Call this at startup before creating child containers.

```ts
const app = createContainer()
await app.warmup([database, userService, cache])
// All singletons now cached - child containers will share them
```

Returns the container for chaining:

```ts
await app.warmup([database]).then(c => c.freeze())
```

### `container.asReadOnly(): ReadOnlyContainer`

Returns a read-only view with only `get`, `tryGet`, `has`, and `resolver`.

## Helper Functions

### `transient<T>(factory): Factory<T>`

Mark a factory as transient - creates new instance every time.

```ts
const command = transient(factory("Command", () => new Command()))
```

**Note:** Prefer using `factory("Name", fn, { transient: true })` instead.

### `lazy<T>(container, factory): Lazy<T>`

Create a lazy wrapper that defers resolution until `.value` is accessed.

```ts
const serviceA = factory("ServiceA", (c) =>
  new ServiceA(lazy(c, serviceB))
)
// serviceB is only resolved when serviceA accesses lazyRef.value
```

### `named<T>(name, factory): Factory<T>`

Give a factory a display name for better error messages.

```ts
const database = named("Database", () => new Database())
```

**Note:** Prefer using `factory("Name", fn)` instead.

### `childContainer(parent, options?): Container`

Create a child container that inherits from parent. Supports `Symbol.asyncDispose` for automatic cleanup.

```ts
// Manual cleanup
const child = childContainer(parent)
await child.dispose()

// Or with automatic cleanup
await using scope = childContainer(parent)
// scope is automatically disposed when exiting the block
```

### `timeout<T>(factory, ms): Factory<Promise<T>>`

Wrap a factory with a timeout. If resolution takes longer than ms, throws `TimeoutError`.

```ts
const database = timeout(factory("Database", async (c) => {
  return await Database.connect()
}), 5000)
```

**Note:** Prefer using `factory("Name", fn, { timeout: 5000 })` instead.

### `tagged<T>(namespace, factoryCreator): (tag: string) => Factory<T>`

Create a factory namespace for multiple tagged implementations.

```ts
const dbByRegion = tagged("Database", (region) =>
  factory(`Database:${region}`, async () => Database.connect(region))
)

const usDb = container.get(dbByRegion("us-east"))
const euDb = container.get(dbByRegion("eu-west"))
```

### `wrap<T>(factory, wrapper): Factory<T>`

Wrap a factory's output with additional behavior.

```ts
const loggingDb = wrap(database, (db) => {
  return new Proxy(db, {
    get(target, prop) {
      console.log(`Accessing db.${String(prop)}`)
      return target[prop]
    }
  })
})
```

### `scoped<Args, T>(creator): (...args: Args) => Factory<T>`

Create a scoped factory that captures request-specific parameters. The creator always receives container as the first argument.

```ts
// Ignore container if not needed
const requestContext = scoped((_, userId: string) => new RequestContext(userId))

// Use container to resolve dependencies
const requestHandler = scoped((c, userId: string) =>
  new Handler(c.get(logger), userId)
)

// Usage in request handler
const ctx = container.get(requestContext(userId))
```

### `defineFactories<T>(factories): T`

Define multiple named factories at once. Supports forward references via proxy.

**Import from batch plugin:**

```ts
import { defineFactories } from "no-decoration/plugins/batch"

const { config, database, logger } = defineFactories(($) => ({
  config: () => new Config(),
  database: (c) => new Database(c.get($.config)),
  logger: (c) => new Logger(c.get($.config))
}))
```

### `pipe(...plugins): ComposedPlugin`

Compose multiple plugins into a single plugin.

```ts
const allPlugins = pipe(health, observability, testing)
const container = createContainer().with(allPlugins)
```

### `definePlugin<T>(name, apply): Plugin<T>`

Helper to create a plugin with a name and apply function.

```ts
const myPlugin = definePlugin("myPlugin", (container, internals) => {
  return {
    myMethod() { /* ... */ }
  }
})
```

## Error Classes

All errors extend `DIError` and include actionable suggestions.

### `CircularDependencyError`

Thrown when a circular dependency is detected.

```ts
import { CircularDependencyError } from "no-decoration/errors"

try {
  container.get(factoryA)
} catch (e) {
  if (e instanceof CircularDependencyError) {
    console.log(e.chain) // Array of factories in the cycle
  }
}
```

### `TimeoutError`

Thrown when a factory times out.

### `FrozenContainerError`

Thrown when trying to resolve an unresolved factory on a frozen container.

### `ResolutionError`

Thrown when a factory fails to resolve, wrapping the original error.
