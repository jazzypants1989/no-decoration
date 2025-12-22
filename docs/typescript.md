# TypeScript Support

Full type inference ships with the library via handwritten `.d.ts` files. No build step required.

This is the ["handwritten-dts" pattern](https://github.com/jazzypants1989/no-build-typescript) - full type safety with zero build step.

## Getting Autocomplete

The recommended way to define factories is with `factory()`:

```ts
import { createContainer, factory } from "no-decoration"

class Logger {
  log(msg: string) { console.log(msg) }
}

class UserService {
  constructor(private logger: Logger) {}
}

// factory() gives you full autocomplete
const logger = factory("Logger", () => new Logger())
const userService = factory("UserService", (c) =>
  new UserService(c.get(logger))
)

const container = createContainer()
container.get(userService).logger.log("Hello!") // Full autocomplete!
```

Alternative with `inject()`:

```ts
// inject() infers types from class constructor
const logger = inject(Logger)
const userService = inject(UserService, logger)
```

## In Your IDE

- Hover over factories to see inferred types
- Cmd/Ctrl+Click to jump to definitions
- Autocomplete for `container.get()` results
- Type errors when passing wrong dependencies

## The Factory Type

```ts
// A factory is a function that takes a container and returns a value
type Factory<T> = (container: Container) => T
```

When you use `factory("Name", fn)` or `inject(Class, deps...)`, TypeScript infers `T` from your function's return type or class constructor.

## Async Factories

For async factories, the return type is `Factory<Promise<T>>`:

```ts
const database = factory("Database", async (c) => {
  return await Database.connect(c.get(config).dbUrl)
})

// Type: Factory<Promise<Database>>
// Usage:
const db = await container.get(database) // db: Database
```

## Plain JavaScript with JSDoc

You can use the library in plain JavaScript with full type checking via JSDoc:

```js
/** @import { Factory } from 'no-decoration' */

class Config {
  env = "development"
}

/** @type {Factory<Config>} */
const config = () => new Config()
```

For async factories in vanilla JavaScript, use the inline import pattern:

```js
/** @type {import('no-decoration').Factory<Promise<Database>>} */
const database = async (c) => {
  return await Database.connect()
}
```

This ensures both `Factory` and `Promise` are resolved from the correct context.

## Type Inference with inject()

The `inject()` helper has overloads for 0-8 dependencies with explicit types, plus a fallback for more:

```ts
// 0 dependencies - infers from class/function
const config = inject(Config) // Factory<Config>

// 2 dependencies - types flow through
const userService = inject(UserService, database, logger)
// TypeScript knows UserService needs (Database, Logger)

// 9+ dependencies - uses rest parameter inference
const complex = inject(ComplexService, d1, d2, d3, d4, d5, d6, d7, d8, d9)
```

## Plugin Types

When using plugins, TypeScript knows what methods are added:

```ts
import { createContainer } from "no-decoration"
import { health, testing } from "no-decoration/plugins"

const container = createContainer()
  .with(health)
  .with(testing)

// TypeScript knows these methods exist:
container.checkHealth()        // From health plugin
container.withMocks([...])     // From testing plugin
container.snapshot()           // From testing plugin
```

## Error Types

Custom error classes are exported for type-safe error handling:

```ts
import {
  CircularDependencyError,
  TimeoutError,
  FrozenContainerError
} from "no-decoration/errors"

try {
  container.get(factory)
} catch (e) {
  if (e instanceof CircularDependencyError) {
    console.log("Cycle:", e.chain)
  } else if (e instanceof TimeoutError) {
    console.log("Timeout after:", e.ms, "ms")
  }
}
```

## No experimentalDecorators Needed

Unlike NestJS or TypeDI, this library works with default TypeScript settings:

```json
// tsconfig.json - no special flags needed
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler"
    // NO experimentalDecorators
    // NO emitDecoratorMetadata
  }
}
```
