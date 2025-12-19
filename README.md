# Dependency Injection Without Decorators

A tiny DI container proving you don't need decorators, reflection, or `emitDecoratorMetadata` for dependency injection in JavaScript/TypeScript.

## The Point

> "Without some form of metadata or generation, you generally have to declare the dependency graph explicitly, which adds wiring and can make usage more verbose."

The "wiring" is one line per service:

```js
const logger = (c) => new Logger(c.get(config))
```

That's it. No decorators. No reflection. No experimental flags. No build step.

## Structure

```
lib/
  container.js     # The entire DI system (~40 lines of code)

examples/
  basic.js         # Simple singleton example
  scoped.js        # Per-request scoping (HTTP server pattern)
  typescript.ts    # TypeScript version with full type inference
```

## Run the Examples

```bash
# JavaScript
node examples/basic.js
node examples/scoped.js

# TypeScript
npx tsx examples/typescript.ts
```

## Type Safety Without a Build Step

The library ships with a handwritten `.d.ts` file for TypeScript consumers. No compilation needed.

**Why a `.d.ts` file?** While the `.js` source uses JSDoc for type checking during development, npm consumers typically don't have `allowJs: true` in their tsconfig. The `.d.ts` ensures everyone gets autocomplete and type checking out of the box.

```
lib/
├── container.js      # Implementation (runs in Node/browser)
└── container.d.ts    # Type definitions (for IDE/TypeScript)
```

This is the ["handwritten-dts" pattern](https://github.com/user/nobuild-ts-experiments) - full type safety with zero build step.

**In your IDE:**

- Hover over any factory to see its inferred type
- Cmd/Ctrl+Click to jump to definitions
- Get autocomplete for `container.get()` results
- See type errors inline when you pass wrong dependencies

Try it: open `examples/basic.js` and hover over `service` on line 73.

## How It Works

1. A **factory** is a function: `(container) => instance`
2. The **container** caches factory results (singleton by default)
3. Factories call `c.get(otherFactory)` to declare dependencies

```js
// Define services (plain classes)
class Logger {
  constructor(config) {
    this.config = config
  }
}

// Define factories (one line each)
const config = () => new Config()
const logger = (c) => new Logger(c.get(config))

// Use
const container = createContainer()
const log = container.get(logger) // Dependencies resolved automatically
```

## Comparison

| Approach                               | Decorator + Reflection | Explicit Factories    |
| -------------------------------------- | ---------------------- | --------------------- |
| Works in plain JS                      | ❌                     | ✅                    |
| Works with TS 5.2+ standard decorators | ❌                     | ✅                    |
| Requires experimental flags            | ✅                     | ❌                    |
| Requires build step                    | ✅                     | ❌                    |
| Type safety                            | ✅                     | ✅                    |
| Debuggable                             | Hard                   | Easy (just functions) |

## License

MIT
