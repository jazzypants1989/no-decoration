# Patterns and Gotchas

Common patterns and pitfalls when using no-decoration.

## 1. Child Container Singleton Confusion

**The Problem:**

You expect singletons to be shared between parent and child containers, but each child creates its own instance.

```javascript
const logger = factory("Logger", () => {
  console.log("Creating logger") // Prints 3 times!
  return new Logger()
})

const app = createContainer()

function handleRequest() {
  const child = childContainer(app)
  return child.get(logger) // New logger each time
}

handleRequest()
handleRequest()
handleRequest()
```

**Why It Happens:**

Child containers check the parent's cache before creating new instances. But if the parent never resolved the factory, there's nothing in the cache to inherit.

**The Fix:**

Use `warmup()` to pre-resolve singletons before creating children:

```javascript
const app = createContainer()

// Pre-resolve singletons - child containers will share these
await app.warmup([logger, database, userService])

function handleRequest() {
  const child = childContainer(app)
  return child.get(logger) // Inherits from parent's cache
}
```

**Rule of Thumb:** Call `warmup()` with all your singletons at startup, before handling requests.

---

## 2. Anonymous Factories Are Hard to Debug

**The Problem:**

Error messages show `<anonymous>` instead of useful names:

```javascript
const config = (c) => ({ env: "prod" })
const logger = (c) => new Logger(c.get(config))

// Error: Circular dependency detected: <anonymous> -> <anonymous> -> <anonymous>
```

**The Fix:**

Always name your factories:

```javascript
const config = factory("Config", () => ({ env: "prod" }))
const logger = factory("Logger", (c) => new Logger(c.get(config)))

// Error: Circular dependency detected: Logger -> Config -> Logger
```

**Alternatives:**

```javascript
// Option 1: Use factory() helper
const config = factory("Config", () => ({ env: "prod" }))

// Option 2: Use named() wrapper
const config = named("Config", () => ({ env: "prod" }))

// Option 3: Set displayName manually
const config = () => ({ env: "prod" })
config.displayName = "Config"
```

---

## 3. Forgetting to Await Async Factories

**The Problem:**

You call `container.get()` on an async factory but forget to await:

```javascript
const database = factory("Database", async (c) => {
  return await Database.connect(c.get(config).dbUrl)
})

const db = container.get(database)
db.query("SELECT * FROM users")
// TypeError: db.query is not a function
```

**Why It Happens:**

`container.get()` returns whatever your factory returns. If the factory is async, it returns a Promise.

**The Fix:**

Always await async factories:

```javascript
const db = await container.get(database)
db.query("SELECT * FROM users") // Works!
```

**Tip:** TypeScript will catch this if you type your factories correctly:

```typescript
// Type tells you it's a Promise
const database: Factory<Promise<Database>> = factory("Database", async (c) => {
  return await Database.connect(c.get(config).dbUrl)
})
```

---

## 4. Forgetting to Dispose

**The Problem:**

Resources aren't cleaned up, leading to connection leaks, file handle exhaustion, etc.

```javascript
const container = createContainer()
const db = await container.get(database)
// ... use db ...
// Container and connections left open!
```

**The Fix:**

Always dispose containers when done:

```javascript
const container = createContainer()
try {
  const db = await container.get(database)
  // ... use db ...
} finally {
  await container.dispose()
}
```

**Better: Use `using` with `childContainer()`:**

```javascript
await using scope = childContainer(parentContainer)
const db = await scope.get(database)
// ... use db ...
// Automatically disposed when scope exits!
```

**For HTTP servers:**

```javascript
const app = createContainer()

// Resolve app-level singletons
await app.get(database)

// Handle requests
server.on('request', async (req, res) => {
  await using scope = childContainer(app)
  // Request-scoped services
  const handler = scope.get(requestHandler)
  await handler.handle(req, res)
  // Scope auto-disposed after each request
})

// On shutdown
process.on('SIGTERM', async () => {
  await app.dispose() // Clean up app-level resources
  process.exit(0)
})
```

---

## 5. Circular Dependencies

**The Problem:**

Two factories depend on each other, causing infinite recursion:

```javascript
const a = factory("A", (c) => ({ name: "A", b: c.get(b) }))
const b = factory("B", (c) => ({ name: "B", a: c.get(a) }))

container.get(a)
// CircularDependencyError: A -> B -> A
```

**The Fix:**

Use `lazy()` to break the cycle:

```javascript
const a = factory("A", (c) => ({
  name: "A",
  b: lazy(c, b)  // Deferred resolution
}))
const b = factory("B", (c) => ({ name: "B", a: c.get(a) }))

const result = container.get(a)
result.name      // "A"
result.b.value   // { name: "B", a: ... } - resolved on access
```

**When to Use `lazy()`:**

- When you have genuine circular dependencies (rare, consider refactoring)
- When you want to defer expensive resolution
- When you need to break initialization order constraints

**Better: Refactor to Remove Cycles:**

Circular dependencies often indicate design issues. Consider:

1. **Extract shared logic** into a third service both depend on
2. **Use events** instead of direct references
3. **Inject a factory function** instead of the instance

```javascript
// Instead of circular reference:
const a = factory("A", (c) => ({
  // Don't store b, get it when needed
  doSomething: () => c.get(b).process()
}))
```

---

## 6. Overusing Transient

**The Problem:**

Making expensive factories transient creates performance issues:

```javascript
// BAD: New connection for every resolution
const database = transient(factory("Database", async (c) => {
  return await Database.connect(c.get(config).dbUrl) // Expensive!
}))

// Every get() creates a new connection
await container.get(database) // Connect
await container.get(database) // Connect again
await container.get(database) // Connect again...
```

**When to Use Transient:**

- Stateful objects that shouldn't be shared (request contexts, commands)
- Objects that maintain mutable state per-use
- Factories with side effects that should happen each time

**When NOT to Use Transient:**

- Database connections (singleton + connection pool)
- HTTP clients (singleton + keep-alive)
- Expensive initialization (cache the result)
- Stateless services (no reason to recreate)

**The Fix:**

Use singleton (default) for shared resources:

```javascript
// GOOD: One connection pool, shared
const database = factory("Database", async (c) => {
  const db = await Database.connect(c.get(config).dbUrl)
  c.onDispose(() => db.close())
  return db
})

// Only connects once
await container.get(database) // Connect
await container.get(database) // Returns cached
await container.get(database) // Returns cached
```

---

## 7. Modifying Factory Results

**The Problem:**

You modify a singleton's properties, affecting all consumers:

```javascript
const config = factory("Config", () => ({
  env: "development",
  debug: false
}))

// Somewhere in your code...
const cfg = container.get(config)
cfg.debug = true  // Mutates the singleton!

// Later...
const cfg2 = container.get(config)
console.log(cfg2.debug) // true - oops!
```

**The Fix:**

Treat singletons as immutable, or use transient for mutable objects:

```javascript
// Option 1: Freeze the result
const config = factory("Config", () => Object.freeze({
  env: "development",
  debug: false
}))

// Option 2: Return a new object each time
const config = transient(factory("Config", () => ({
  env: "development",
  debug: false
})))

// Option 3: Use a class with immutable patterns
const config = factory("Config", () => new Config({
  env: "development",
  debug: false
}))
```

---

## 8. Factory Side Effects on Import

**The Problem:**

Factories that do work at definition time (not resolution time):

```javascript
// BAD: Connection happens when module is imported!
const database = factory("Database", () => {
  const db = connectSync(process.env.DATABASE_URL)  // Blocks on import
  return db
})

// Importing this module blocks until connection completes
import { database } from './factories'
```

**The Fix:**

All work should happen inside the factory function:

```javascript
// GOOD: Connection happens when factory is resolved
const database = factory("Database", () => {
  return connectSync(process.env.DATABASE_URL)
})

// Or even better, async:
const database = factory("Database", async () => {
  return await Database.connect(process.env.DATABASE_URL)
})
```

---

## 9. Not Using the Container in Tests

**The Problem:**

Creating instances directly in tests, bypassing the container:

```javascript
// BAD: Bypasses the container, misses overrides
test("UserService creates users", () => {
  const mockDb = { query: jest.fn() }
  const service = new UserService(mockDb)  // Direct construction
  // ...
})
```

**The Fix:**

Use the container with overrides:

```javascript
// GOOD: Uses container, respects the same wiring as production
test("UserService creates users", () => {
  const container = createContainer()
  container.override(database, () => ({ query: jest.fn() }))

  const service = container.get(userService)
  // Tests the real factory wiring with mock dependencies
})
```

---

## Quick Reference

| Gotcha | Symptom | Fix |
|--------|---------|-----|
| Child container singletons | Multiple instances created | Use `warmup()` |
| Anonymous factories | Unclear error messages | Use `factory()` or `named()` |
| Missing await | `undefined.method` errors | `await container.get()` |
| Missing dispose | Resource leaks | `try/finally` or `using` |
| Circular dependencies | Stack overflow or error | Use `lazy()` or refactor |
| Transient overuse | Performance issues | Use singleton for shared resources |
| Mutating singletons | Unexpected state sharing | Freeze or use transient |
| Import side effects | Slow/blocking imports | Move work inside factory |
| Direct construction in tests | Bypasses container | Use container with overrides |
