# no-decoration

## Dependency Injection Without Decorators

A minimal DI container (~400 line core) proving you don't need decorators, reflection, or `emitDecoratorMetadata` for dependency injection in JavaScript/TypeScript.

**[Try it in StackBlitz](https://stackblitz.com/github/jazzypants1989/no-decoration?file=examples%2Ftypescript.ts)**

## Installation

```bash
npm install no-decoration
```

## Quick Start

```ts
import { createContainer, factory } from "no-decoration"

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
const config = factory("Config", () => new Config())
const logger = factory("Logger", (c) => new Logger(c.get(config)))

// Usage
const container = createContainer()
container.get(logger).log("Hello!") // [development] Hello!
```

## Why This Exists

I got nerd-sniped by a Reddit comment. Someone built a DI library using `experimentalDecorators`, and when I asked why not use a decorator-free approach, they responded:

> "Without some form of metadata or generation, you generally have to declare the dependency graph explicitly, which adds wiring and can make usage more verbose."

That's a reasonable concern. So I wrote a tiny library to see how "verbose" it actually is, and it turns out you can whittle it down to around one line per service.

## The Wiring

```ts
// One line per service - that's it
const config = factory("Config", () => new Config())
const logger = factory("Logger", (c) => new Logger(c.get(config)))
const userService = factory("UserService", (c) =>
  new UserService(c.get(database), c.get(logger))
)

// Options for common patterns
const command = factory("Command", () => new Command(), { transient: true })
const slowDb = factory("SlowDB", async (c) => await connect(), { timeout: 5000 })
```

No decorators, reflection, or build steps. Just functions.

## The Philosophy: Just Functions

A factory is just a function: `(container) => instance`

This means factories:
- **Compose** naturally (pipe, decorator, tagged)
- **Debug** easily (step into them, see the stack)
- **Test** simply (call them, check the result)
- **Type-check** without magic (TypeScript infers everything)

No reflection, no metadata, no special syntax. Just functions calling functions.

## Examples

See the [`examples/`](./examples/) directory for a progressive learning path:

1. **[why-di.js](./examples/why-di.js)** - Before/after comparison showing DI benefits
2. **[basic.js](./examples/basic.js)** - Core API: factories, inject, transient, async, disposal
3. **[testing.js](./examples/testing.js)** - Mocking, snapshots, validation
4. **[plugins.js](./examples/plugins.js)** - Health, observability, timeout, tagged factories
5. **[patterns.js](./examples/patterns.js)** - Guards, validation, interceptors, error handling
6. **[typescript.ts](./examples/typescript.ts)** - Full TypeScript example with type inference
7. **[multifile/](./examples/multifile/)** - HTTP server with request scoping, health checks, graceful shutdown

```bash
# Run examples
node examples/basic.js
node examples/testing.js
npx tsx examples/typescript.ts
node examples/multifile/index.js  # Starts HTTP server on :3000
```

## Documentation

- **[Why DI?](./docs/why-di.md)** - When to use (and not use) DI
- **[Features](./docs/features.md)** - All features with examples
- **[HTTP Integration](./docs/http-integration.md)** - Express, Hono, Fastify, and plain Node.js
- **[Patterns & Gotchas](./docs/gotchas.md)** - Common pitfalls and how to avoid them
- **[API Reference](./docs/api-reference.md)** - Complete API documentation
- **[TypeScript](./docs/typescript.md)** - Type inference and patterns
- **[Writing Plugins](./docs/plugins.md)** - Extend the container
- **[vs Decorators](./docs/vs-decorators.md)** - Side-by-side comparison with NestJS

## Plugins

```ts
import { createContainer } from "no-decoration"
import { health, observability, testing, debug, batch, discovery } from "no-decoration/plugins"

const container = createContainer()
  .with(health)        // Health checks
  .with(observability) // Events, dependency graph
  .with(testing)       // Mocking, snapshots
  .with(debug)         // Development logging
  .with(batch)         // defineFactories() for batch creation
  .with(discovery)     // Scan codebase for factories
```

### Patterns (Guards, Validation, Interceptors)

Compositional decorators for NestJS-like features without decorators:

```ts
import { pipe, guard, validate, intercept, catchError } from "no-decoration/patterns"

const userService = pipe(
  factory("UserService", (c) => new UserService(c.get(database))),
  guard(requireAuth),           // Access control
  validate(userSchema),         // Zod/Valibot validation
  intercept(timing),            // Logging, caching, retry
  catchError(fallbackHandler)   // Error handling
)
```

Also includes: `tap`, `transform`, `memo`, `retry`, `withTimeout`, `when`, `ifElse`.

### Presets

Pre-configured plugin combinations for common scenarios:

```ts
import { createContainer } from "no-decoration"
import { production, development, testOnly } from "no-decoration/presets"

// Production: health + observability (no testing utilities)
const app = createContainer().with(production)

// Development: health + observability + testing
const dev = createContainer().with(development)

// Testing: just testing utilities (minimal footprint)
const test = createContainer().with(testOnly)
```

## Quick Comparison

| Aspect | Decorator DI (NestJS) | no-decoration |
|--------|----------------------|----------------|
| TypeScript config | `experimentalDecorators` + `emitDecoratorMetadata` | None |
| Build step | Required | None (runs directly) |
| Bundle size | 50KB+ | ~3KB |
| Plain JavaScript | No | Yes |
| Debugging | Framework internals in stack | Your code only |
| Testing setup | Test module + provider config | `container.override()` |
| Learning curve | Decorators + modules + providers + lifecycles | Just functions |

See [vs-decorators.md](./docs/vs-decorators.md) for side-by-side code examples.

## When to Use Something Else

Be honest about tradeoffs:

- **Very large teams** needing enforced conventions → NestJS's structure helps
- **Already invested** in the decorator ecosystem → migration cost may not be worth it
- **Need NestJS ecosystem** → GraphQL resolvers, microservices, WebSocket gateways

See [Why DI?](./docs/why-di.md) for honest guidance on when DI (and this library) makes sense.

## License

MIT
