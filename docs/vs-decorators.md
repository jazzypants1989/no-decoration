# no-decoration vs NestJS: A Practical Comparison

This document compares no-decoration with NestJS's dependency injection system. NestJS code is shown as pseudo-code to illustrate the patterns without requiring installation.

## TL;DR Comparison Table

| Aspect | NestJS | no-decoration |
|--------|--------|---------------|
| Installation | `@nestjs/core @nestjs/common reflect-metadata` | `no-decoration` |
| TypeScript config | `experimentalDecorators`, `emitDecoratorMetadata` | None required |
| Build step | Required (tsc or nest build) | None (runs in Node directly) |
| Bundle size | ~50KB+ (core only) | ~3KB |
| Auto-discovery | Yes (@Injectable scanning) | Optional (see discover.js) |
| Learning curve | Decorators + modules + providers | Just functions |
| Plain JavaScript | No | Yes |

## Side-by-Side: Basic Service

### NestJS (pseudo-code)

```typescript
// tsconfig.json requires:
// "experimentalDecorators": true,
// "emitDecoratorMetadata": true

// main.ts requires:
// import 'reflect-metadata'

@Injectable()
class ConfigService {
  get(key: string): string {
    return process.env[key] || ''
  }
}

@Injectable()
class UserService {
  // Decorator metadata tells NestJS what to inject
  constructor(private config: ConfigService) {}

  getUser(id: string) {
    const dbUrl = this.config.get('DATABASE_URL')
    // ...
  }
}

@Module({
  providers: [ConfigService, UserService],
  exports: [UserService]
})
class UserModule {}
```

### no-decoration

```typescript
// No special TypeScript config
// No imports needed beyond the library
// Runs in plain JavaScript too

class ConfigService {
  get(key: string): string {
    return process.env[key] || ''
  }
}

class UserService {
  constructor(private config: ConfigService) {}

  getUser(id: string) {
    const dbUrl = this.config.get('DATABASE_URL')
    // ...
  }
}

// Explicit wiring - one line per service
const config = factory("Config", () => new ConfigService())
const userService = factory("UserService", (c) =>
  new UserService(c.get(config))
)

// Usage
const container = createContainer()
container.get(userService)
```

## Side-by-Side: Testing

### NestJS

```typescript
// Requires @nestjs/testing package
import { Test } from '@nestjs/testing'

const moduleRef = await Test.createTestingModule({
  providers: [
    UserService,
    { provide: ConfigService, useValue: mockConfig },
  ],
}).compile()

const service = moduleRef.get(UserService)
```

### no-decoration

```typescript
// No additional imports needed
container.override(config, () => mockConfig)
const service = container.get(userService)

// Or batch mocking:
const testContainer = createContainer()
  .with(testing)
  .withMocks([
    [config, () => mockConfig],
    [database, () => mockDb],
  ])
```

## Side-by-Side: Async Initialization

### NestJS

```typescript
@Injectable()
class DatabaseService implements OnModuleInit {
  private connection: Connection

  async onModuleInit() {
    this.connection = await Database.connect()
  }

  // Also need OnModuleDestroy for cleanup
  async onModuleDestroy() {
    await this.connection.close()
  }
}

// Requires understanding lifecycle hooks
// Order depends on module initialization order
```

### no-decoration

```typescript
const database = factory("Database", async (c) => {
  const db = await Database.connect(c.get(config).dbUrl)
  c.onDispose(() => db.close())
  return db
})

// Just await it
const db = await container.get(database)

// Cleanup
await container.dispose()
```

## Side-by-Side: Scoped Providers

### NestJS

```typescript
@Injectable({ scope: Scope.REQUEST })
class RequestContext {
  constructor(@Inject(REQUEST) private request: Request) {}
}

// Requires understanding injection scopes
// REQUEST scope has performance implications
// Must be careful about scope bubbling
```

### no-decoration

```typescript
const app = createContainer()

function handleRequest(req) {
  // Each request gets its own container
  const requestScope = childContainer(app)

  const context = factory("RequestContext", () => new RequestContext(req))
  const handler = factory("Handler", (c) =>
    new Handler(c.get(context), c.get(logger))
  )

  return requestScope.get(handler).handle()
}
```

## What You Lose Without Decorators

### 1. Auto-discovery
NestJS scans for `@Injectable()` and wires automatically.

**But:** You can achieve similar with a simple script:
```bash
node examples/06-discoverability/discover.js ./src
```
This scans for `factory()` calls and generates a manifest.

### 2. Metadata-based Injection
NestJS reads constructor parameter types automatically.

**But:** `factory("Name", (c) => new Class(c.get(dep1), c.get(dep2)))` contains the same information - it's just explicit instead of inferred.

### 3. Module System
No `@Module()` grouping.

**But:** Use regular ES modules:
```typescript
// user/index.ts
export { userService, userRepository } from './factories'
```

### 4. Decorators for Everything
NestJS uses decorators for guards, pipes, interceptors, etc.

**But:** Most of these are framework-specific patterns. For pure DI, you don't need them.

## What You Gain Without Decorators

### 1. No Build Step
Run `.js` files directly with Node. No compilation required.

### 2. No TypeScript Flags
Works with default tsconfig. No experimental features.

### 3. Plain JavaScript Support
Same patterns work in vanilla JS with JSDoc for types.

### 4. Smaller Bundle
~3KB vs 50KB+ for NestJS core.

### 5. Readable Stack Traces
Errors show your code, not framework internals.

### 6. Simpler Async
Just return a Promise and await it. No lifecycle hooks to learn.

### 7. Transparent Behavior
No "magic" - you can trace exactly what happens.

## The JavaScript Angle

Decorator-based DI fights against idiomatic JavaScript in several ways:

### 1. Class-Only
Decorators only work on classes. Modern JavaScript often prefers functions:

```javascript
// Can't decorate this
const createUserService = (db, logger) => ({
  getUser: (id) => db.query('SELECT * FROM users WHERE id = ?', [id]),
  log: (msg) => logger.info(msg)
})

// But this works fine with no-decoration
const userService = factory("UserService", (c) =>
  createUserService(c.get(database), c.get(logger))
)
```

### 2. Experimental and Divergent
`experimentalDecorators` is not the same as TC39 standard decorators:

- TypeScript's implementation predates the standard
- The standard (Stage 3) has different semantics
- Code written for `experimentalDecorators` won't work with standard decorators
- You're locking into a non-standard feature

### 3. TypeScript-Specific Metadata
`emitDecoratorMetadata` only exists in TypeScript:

- It emits design-time type information as runtime metadata
- This metadata is what NestJS reads to understand constructor parameters
- No equivalent exists in standard JavaScript or other transpilers
- Your DI is coupled to a TypeScript-specific compiler feature

### 4. No Arrow Functions
You can't decorate arrow functions or function expressions:

```typescript
// This doesn't work
@Injectable()
const handler = () => { ... }

// Must use class syntax
@Injectable()
class Handler { ... }
```

### 5. Confusing Evaluation Order
Decorator evaluation order surprises even experienced developers:

```typescript
@A()
@B()
class Foo {
  @C()
  @D()
  method() {}
}

// Evaluation order: A, B, D, C (outer-to-inner for class, then inner-to-outer for methods)
// Application order: B, A, C, D (inner-to-outer always)
```

### The Alternative

no-decoration works with whatever JavaScript you write:
- Functions, classes, or objects
- Arrow functions or regular functions
- Any transpiler or none at all
- Standard JavaScript semantics

## Error Messages and Debugging

One of the biggest practical differences is what happens when things go wrong.

### Typical NestJS Error

```
Nest can't resolve dependencies of the UserService (?).
Please make sure that the argument dependency at index [0]
is available in the AppModule context.

Potential solutions:
- If ConfigService is a provider, is it part of the current AppModule?
- If ConfigService is exported from a separate @Module, is that module
  imported within AppModule?
```

**Problems:**
- Which dependency failed? The `?` doesn't tell you
- "index [0]" requires counting constructor parameters
- Multiple potential causes listed, but which one applies?
- No indication of what was actually requested vs. what was found

### no-decoration Error

```
CircularDependencyError: Circular dependency detected:
  userService → database → logger → userService

Resolution chain:
  1. userService (src/services.js:15)
  2. database (src/services.js:8)
  3. logger (src/services.js:3)
  4. userService (src/services.js:15) ← cycle

Fix: Use lazy() to break the cycle:
  const logger = factory("Logger", (c) => ({
    db: lazy(c, database)
  }))
```

**Benefits:**
- The full cycle is shown
- File locations are included
- Specific fix is suggested
- No guessing required

### Stack Traces

**NestJS stack trace (typical):**
```
Error: Nest can't resolve dependencies...
    at Injector.lookupComponentInParentModules (injector.js:202)
    at Injector.resolveComponentInstance (injector.js:157)
    at resolvePerScope (injector.js:123)
    at Injector.loadProvider (injector.js:89)
    at async Promise.all (index 3)
    at InstanceLoader.createInstancesOfProviders (instance-loader.js:44)
```

Where's your code? Buried under framework internals.

**no-decoration stack trace:**
```
Error: Database connection failed
    at database (src/factories.js:12:5)
    at userService (src/factories.js:18:12)
    at Container.get (no-decoration/core.js:52:20)
    at main (src/index.js:8:3)
```

Your code is right there. You can step through it in a debugger.

### Debugging Experience

With decorators, debugging DI issues often means:
1. Searching NestJS docs for error codes
2. Checking module imports and exports
3. Verifying decorator order
4. Understanding injection scopes
5. Sometimes: reading framework source code

With explicit factories:
1. Set a breakpoint in your factory
2. Step through and see what happens
3. That's it

## When to Choose Each

### Choose NestJS when:
- You have 100+ services and want automatic discovery
- You're building a full framework with GraphQL, microservices, etc.
- Your team is already trained on NestJS patterns
- You need the NestJS ecosystem (guards, pipes, interceptors)

### Choose no-decoration when:
- You want to understand exactly what's happening
- Bundle size matters (serverless, edge functions)
- You're adding DI to an existing project incrementally
- You want debuggable stack traces
- You prefer explicit over implicit
- You need simple async without lifecycle complexity
- You want to run code without a build step

## The Core Insight

Both approaches encode the same information:

```typescript
// NestJS: encoded in decorator metadata
@Injectable()
class UserService {
  constructor(private db: Database, private logger: Logger) {}
}

// no-decoration: encoded in factory function
const userService = factory("UserService", (c) =>
  new UserService(c.get(database), c.get(logger))
)
```

The decorator approach hides the wiring. The factory approach makes it explicit. Neither has more or less information - it's just in different places.

The question is: do you prefer magic that "just works" or explicit code you can trace?
