# no-decoration

## Dependency Injection Without Decorators

A tiny DI container (~100 lines) proving you don't need decorators, reflection, or `emitDecoratorMetadata` for dependency injection in JavaScript/TypeScript.

**[Try it in StackBlitz](https://stackblitz.com/github/jazzypants1989/no-decoration?file=examples%2Ftypescript.ts)**

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Structure](#structure)
- [Run the Examples](#run-the-examples)
- [Why This Exists](#why-this-exists)
- [The Wiring](#the-wiring)
- [Features](#features)
  - [Multiple Dependencies](#multiple-dependencies)
  - [Async Factories](#async-factories)
  - [Disposal / Cleanup](#disposal--cleanup)
  - [Child Containers](#child-containers-per-request-scoping)
  - [Circular Dependency Detection](#circular-dependency-detection)
- [Comparison](#comparison)
- [Trade-offs](#trade-offs)
- [TypeScript](#typescript)
- [API Reference](#api-reference)
- [License](#license)

## Installation

```bash
npm install no-decoration
```

## Quick Start

```ts
import { createContainer, inject, type Factory } from "no-decoration"

// Plain classes
class Config {
  env = "development"
}

class Logger {
  constructor(private config: Config) {}
  log(msg: string) {
    console.log(`[${this.config.env}] ${msg}`)
  }
}

// Factories: (container) => instance
// Type the factory for full autocomplete on container.get()
const config: Factory<Config> = () => new Config()
const logger: Factory<Logger> = (c) => new Logger(c.get(config))

// Or use inject() - types are inferred automatically
const logger2 = inject(Logger, config)

// Usage
const container = createContainer()
container.get(logger).log("Hello!") // Full autocomplete here!
```

> **Note:** For best IDE experience, type your factories with `Factory<T>` or use `inject()`. Plain JS works too, but you won't get autocomplete on `container.get()` results without types.

## Structure

```
lib/
  container.js     # The entire DI system (~100 lines)
  container.d.ts   # TypeScript definitions

examples/
  basic.js         # Simple singleton example
  scoped.js        # Per-request scoping (HTTP server pattern)
  advanced.js      # Async, disposal, circular detection
  typescript.ts    # Comprehensive TypeScript example
```

## Run the Examples

If you want to see this library in action, just [check it out on StackBlitz](https://stackblitz.com/github/jazzypants1989/no-decoration?file=examples%2Ftypescript.ts) or clone the repo and run:

```bash
# Run all examples
npm start

# Or run individually
npm run example:basic
npm run example:scoped
npm run example:advanced
npm run example:typescript
```

## Why This Exists

I got nerd-sniped by a Reddit comment. Someone built a DI library using `experimentalDecorators`, and when I asked why not use a decorator-free approach, they responded:

> "Without some form of metadata or generation, you generally have to declare the dependency graph explicitly, which adds wiring and can make usage more verbose."

That's a reasonable concern. So I wrote a tiny library to see how "verbose" it actually is, and it turns out you can whittle it down to around one line per service.

## The Wiring

Two ways to wire dependencies:

```ts
// Explicit factory - full control, conditional logic, async
const logger: Factory<Logger> = (c) => new Logger(c.get(config))

// inject() helper - just list dependencies in constructor order
const logger = inject(Logger, config)
```

Both are one line, and neither require decorators, reflection, or build steps.

**Use explicit factories when you need:**

- Conditional logic (`env === 'test' ? mockLogger : realLogger`)
- Async initialization (`await Database.connect(...)`)
- Custom construction beyond `new Class(...deps)`

**Use `inject()` when:** you just want `new Class(dep1, dep2, dep3)`

## Features

### Multiple Dependencies

Services often depend on many things. Just call `c.get()` for each:

```ts
class UserService {
  constructor(
    private db: Database,
    private logger: Logger,
    private cache: Cache,
    private config: Config
  ) {}
}

// Explicit factory - full control
const userService: Factory<UserService> = (c) =>
  new UserService(c.get(db), c.get(logger), c.get(cache), c.get(config))

// Or use inject() helper - types inferred, less typing
const userService = inject(UserService, db, logger, cache, config)
```

### Async Factories

For database connections, HTTP clients, anything async:

```ts
// Async factories return Factory<Promise<T>>
const database: Factory<Promise<Database>> = async (c) => {
  const cfg = c.get(config)
  const db = await Database.connect(cfg.dbUrl)
  c.onDispose(() => db.close()) // Cleanup on dispose
  return db
}

// Usage - just await it
const db = await container.get(database)
```

### Disposal / Cleanup

Register cleanup functions, called in reverse order (LIFO):

```ts
const server: Factory<Server> = (c) => {
  const srv = new Server(c.get(config))
  c.onDispose(() => srv.stop())
  return srv
}

// Later: clean up everything
await container.dispose()
```

### Child Containers (Per-Request Scoping)

Child containers inherit parent singletons but have their own cache:

```ts
import {
  createContainer,
  childContainer,
  inject,
  type Factory,
} from "no-decoration"

const app = createContainer()

function handleRequest(userId: string) {
  const request = childContainer(app) // Inherits app singletons

  // Request-specific factory
  const ctx: Factory<RequestContext> = () => new RequestContext(userId)
  const handler = inject(Handler, logger, ctx) // logger from parent

  return request.get(handler).handle()
}
```

### Circular Dependency Detection

Enabled by default. Throws a helpful error instead of stack overflow:

```js
const a = (c) => ({ b: c.get(b) })
const b = (c) => ({ a: c.get(a) })

container.get(a)
// Error: Circular dependency detected: a -> b -> a
```

Disable for performance (not recommended):

```js
const container = createContainer({ detectCircular: false })
```

## Comparison

| Feature                     | Decorator + Reflection    | This Library                   |
| --------------------------- | ------------------------- | ------------------------------ |
| Works in plain JS           | ❌                        | ✅                             |
| TS 5.2+ standard decorators | ❌                        | ✅                             |
| Experimental flags          | Required                  | None                           |
| Build step                  | Required                  | None                           |
| Type safety                 | ✅                        | ✅                             |
| Async factories             | Complex                   | `await container.get(factory)` |
| Stack traces                | Framework internals       | Your code                      |
| Bundle size                 | 10-50KB+                  | ~100 lines (~1KB)              |
| Auto-discovery              | ✅ (scan for @Injectable) | ❌ (explicit wiring)           |
| Learning curve              | Decorators + DI concepts  | Just functions                 |

## Trade-offs

This library prioritizes simplicity and transparency. Here's when you might want something else:

**Consider decorator-based DI if:**

- You have 100+ services and want auto-discovery (scanning for `@Injectable`)
- Your team is already fluent with NestJS/Angular patterns
- You need runtime swapping of implementations without changing code

**This library is great when:**

- You want to understand exactly what's happening
- You're building something new and don't want decorator lock-in
- You need async factories without fighting the framework
- You want to debug DI issues by reading stack traces
- Bundle size matters

The "explicit wiring" that decorator DI avoids is literally `inject(Class, dep1, dep2)` — the same information you'd put in a decorator, just in a different place.

## TypeScript

Full type inference ships with the library via handwritten `.d.ts` files. No build step required.

This is the ["handwritten-dts" pattern](https://github.com/jazzypants1989/no-build-typescript) - full type safety with zero build step.

**Two ways to get autocomplete:**

```ts
// 1. Explicit Factory<T> annotation
const logger: Factory<Logger> = (c) => new Logger(c.get(config))

// 2. Use inject() - types inferred from class constructor
const logger = inject(Logger, config)
```

Both give you full autocomplete on `container.get(logger)`.

**In your IDE:**

- Hover over factories to see inferred types
- Cmd/Ctrl+Click to jump to definitions
- Autocomplete for `container.get()` results
- Type errors when passing wrong dependencies

**Plain JavaScript:** Works fine, but without `Factory<T>` annotations or `inject()`, you won't get autocomplete on resolved instances. If you're using JS with JSDoc, you can use `/** @type {import('no-decoration').Factory<MyClass>} */` to get the same effect.

## API Reference

### Types

```ts
type Factory<T> = (container: Container) => T

interface Container {
  get<T>(factory: Factory<T>): T
  onDispose(fn: () => void | Promise<void>): void
  dispose(): Promise<void>
  has<T>(factory: Factory<T>): boolean
}

interface ContainerOptions {
  detectCircular?: boolean // default: true
}
```

### `createContainer(options?): Container`

Creates a new dependency injection container.

```ts
const container = createContainer()

// Disable circular dependency detection (not recommended)
const container = createContainer({ detectCircular: false })
```

---

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

---

### `inject(Class, ...dependencies): Factory<T>`

Helper to create a factory from a class and its dependencies. Pure convenience—these are equivalent:

```ts
const userService = inject(UserService, db, logger)
const userService: Factory<UserService> = (c) =>
  new UserService(c.get(db), c.get(logger))
```

---

### `container.get(factory): T`

Resolves a factory, returning the cached instance or creating a new one.

- Results are cached (singleton behavior)
- Async factories return promises—just `await` them
- Throws on circular dependencies (if `detectCircular` is enabled)

```ts
const logger = container.get(loggerFactory) // Logger
const db = await container.get(databaseFactory) // Promise<Database> → Database
```

---

### `container.onDispose(fn): void`

Registers a cleanup function to be called when `dispose()` is invoked.

- Cleanup functions run in reverse order (LIFO)
- Can be sync or async

```ts
const database: Factory<Promise<Database>> = async (c) => {
  const db = await Database.connect(c.get(config).dbUrl)
  c.onDispose(() => db.close())
  return db
}
```

---

### `container.dispose(): Promise<void>`

Calls all registered cleanup functions and clears the cache.

- Runs disposers in reverse order (LIFO)
- Aggregates errors into `AggregateError` if multiple disposers fail
- Safe to call multiple times (cache is cleared)

```ts
await container.dispose()
```

---

### `container.has(factory): boolean`

Checks if a factory has been resolved (exists in cache or parent cache).

```ts
if (container.has(databaseFactory)) {
  // Database was already initialized
}
```

## License

MIT
