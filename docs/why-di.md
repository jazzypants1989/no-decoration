# Why Dependency Injection?

## The Honest Answer

Dependency injection is not always necessary. For a 100-line script, it's overkill. For pure functions that take inputs and return outputs, it adds nothing. But at some point, your code will hit one of these walls—and that's when DI starts to make sense.

## Wall 1: The Testing Wall

You write a service that uses a database:

```javascript
class UserService {
  constructor() {
    this.db = new Database(process.env.DATABASE_URL)
  }

  getUser(id) {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id])
  }
}
```

Now you want to test it. How?

- **Option A**: Connect to a real database in tests. Slow, flaky, requires setup.
- **Option B**: Mock the `Database` constructor with `jest.mock()`. Fragile, magic.
- **Option C**: Environment variable hacks. Still loads real modules.

**With DI:**

```javascript
class UserService {
  constructor(db) {  // ← Injected!
    this.db = db
  }

  getUser(id) {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id])
  }
}

// Factory
const userService = inject(UserService, database)

// Test - just override the dependency
const testContainer = container.withMocks([
  [database, () => ({ query: () => [{ id: 1, name: 'Test' }] })]
])
const service = testContainer.get(userService)  // Uses mock!
```

**The wall**: When testing becomes painful because you can't swap implementations.

## Wall 2: The Configuration Wall

You start with hardcoded values:

```javascript
class ApiClient {
  constructor() {
    this.baseUrl = 'https://api.example.com'
    this.timeout = 5000
  }
}
```

Then you need different values for dev/staging/prod. Then you need to test with a different URL. Then you need feature flags. The `process.env` calls multiply across your codebase.

**With DI:**

```javascript
class ApiClient {
  constructor(config) {
    this.baseUrl = config.apiUrl
    this.timeout = config.timeout
  }
}

const config = () => ({
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  timeout: parseInt(process.env.TIMEOUT) || 5000
})

const apiClient = inject(ApiClient, config)
```

Configuration is centralized. Every service that needs config gets the same instance. You can override it for tests. You can trace where values come from.

**The wall**: When `process.env` is scattered everywhere and configuration becomes a mess.

## Wall 3: The "Who Creates What?" Wall

At first, your code creates its own dependencies:

```javascript
class OrderService {
  constructor() {
    this.db = new Database()
    this.paymentClient = new PaymentClient(new Config())
    this.emailService = new EmailService(new SmtpClient())
    this.logger = new Logger()
  }
}
```

Questions start to pile up:

- Which Database instance does OrderService use? Is it the same one UserService uses?
- If PaymentClient changes its constructor, how many places break?
- How do you know what depends on what?

**With DI:**

```javascript
// Every dependency is explicit, defined once
const config = () => new Config()
const database = inject(Database, config)
const paymentClient = inject(PaymentClient, config)
const emailService = inject(EmailService, smtpClient)
const orderService = inject(OrderService, database, paymentClient, emailService, logger)
```

You can see the dependency graph. `OrderService` doesn't know or care how `Database` is created. It just needs one.

**The wall**: When your classes create their own dependencies and you lose track of what's shared.

## When NOT to Use DI

DI is a tool, not a religion. Skip it when:

### Small Scripts
Under 200 lines? No external services? Just write the code directly.

```javascript
// This is fine. No DI needed.
const data = fs.readFileSync('data.json', 'utf8')
const parsed = JSON.parse(data)
console.log(parsed)
```

### Pure Functions
Functions that take data and return data don't need DI.

```javascript
// This is fine. Input → Output. No dependencies.
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
```

### Single-Purpose CLIs
A CLI that does one thing and exits doesn't need a container.

```javascript
// This is fine. Run once, done.
const result = await fetch(process.argv[2])
console.log(await result.text())
```

### When Module Singletons Work
JavaScript modules are singletons. Sometimes that's enough.

```javascript
// database.js
export const db = new Database(process.env.DATABASE_URL)

// user-service.js
import { db } from './database.js'
export function getUser(id) { return db.query(...) }
```

This works when:
- You don't need different instances for different contexts
- Testing with real connections is acceptable
- The module graph is simple

## The Middle Ground: Factory Functions

Before reaching for a DI container, consider simple factory functions:

```javascript
// factories.js
export function createDatabase(config) {
  return new Database(config.dbUrl)
}

export function createUserService(db, logger) {
  return { getUser: (id) => db.query(...) }
}

// main.js
const config = loadConfig()
const db = createDatabase(config)
const logger = createLogger(config)
const userService = createUserService(db, logger)
```

This is often sufficient. Upgrade to a container when:

1. **Deep dependency chains**: When A needs B needs C needs D, the factory call chains get long
2. **Per-request scoping**: When you need fresh instances per HTTP request
3. **Lifecycle management**: When resources need cleanup (close connections, stop servers)
4. **Many overrides for testing**: When you're overriding the same things repeatedly

## The Decorator Question

"Why not just use decorators like NestJS?"

You can! Decorators work. But they come with trade-offs:

| | Decorators (NestJS) | This Library |
|---|---|---|
| **Requires `experimentalDecorators`** | Yes | No |
| **Requires `emitDecoratorMetadata`** | Yes | No |
| **Requires build step** | Yes | No |
| **Works in plain JavaScript** | No | Yes |
| **Bundle size** | 10-50KB+ | ~2KB |
| **Stack traces** | Framework internals | Your code |
| **Auto-discovery** | Yes (scans for @Injectable) | No (explicit) |

**Use decorators when:**
- You have 100+ services and want auto-discovery
- Your team already knows NestJS/Angular patterns
- You're building a framework on top of DI

**Use this library when:**
- You want to understand what's happening
- Bundle size matters
- You prefer explicit over implicit
- You want debuggable stack traces

## The Real Answer

DI isn't about "best practices" or "enterprise patterns." It's about:

1. **Making dependencies visible** — so you can see what depends on what
2. **Making dependencies swappable** — so you can test without real databases
3. **Centralizing creation** — so changes happen in one place

If you don't have these problems, you don't need DI. If you do, DI is one solution. This library tries to be the smallest, simplest solution that still works for real applications.
