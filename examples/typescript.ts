// =============================================================================
// Comprehensive TypeScript Example
// =============================================================================
// Run with: npx tsx examples/typescript.ts
// =============================================================================
//
// This single file demonstrates EVERY feature of the DI container:
//   1. Basic dependency injection with type inference
//   2. The inject() helper for less boilerplate
//   3. Child containers for per-request scoping
//   4. Async factories for database connections, etc.
//   5. Disposal/cleanup for resource management
//   6. Circular dependency detection
//   7. Patterns plugin: guard, validate, intercept, transform, catchError
//
// 💡 IDE Tips - Notice how types flow through without annotations:
//    • Hover over factories → inferred types
//    • Cmd/Ctrl+Click on `inject` → jumps to definition
//    • Try invalid usage → immediate type errors
//
// =============================================================================

import {
  createContainer,
  childContainer,
  inject,
  type Factory,
  type Container,
} from "no-decoration"

// =============================================================================
// DEMONSTRATE TYPE INFERENCE FOR inject()
// =============================================================================
// These examples show that the improved .d.ts signature for inject provides
// full type inference for both dependencies and result types.

// Function target
function add(a: number, b: number): number {
  return a + b
}
const depA: Factory<number> = () => 2
const depB: Factory<number> = () => 3

const addFactory = inject(add, depA, depB)
//    ^? Factory<number> (inferred)
// Hover over addFactory above to see: (container: Container) => number

// Usage example:
const addContainer = createContainer()
const sum = addContainer.get(addFactory)
console.log("addFactory result:", sum) // 5

// Class target
class Pair {
  constructor(public a: number, public b: string) {}
}
const depNum: Factory<number> = () => 42
const depStr: Factory<string> = () => "hello"
const pairFactory = inject(Pair, depNum, depStr) // OK
//    ^? Factory<Pair> (inferred)
// Hover over pairFactory above to see: (container: Container) => Pair

// Usage example:
const pairContainer = createContainer()
const pair = pairContainer.get(pairFactory)
console.log("pairFactory result:", pair) // Pair { a: 42, b: "hello" }

// If you try to pass the wrong type, TypeScript will error:
// const badFactory = inject(Pair, depNum, depNum) // Error: number is not assignable to string
// Wrong types? TypeScript will error (with a long message):
// const badFactory = inject(Pair, depNum, depNum) // Error

// =============================================================================
// 1. BASIC DEPENDENCY INJECTION
// =============================================================================
// Plain classes with constructor injection. No decorators needed.

class Config {
  readonly env = process.env.NODE_ENV || "development"
  readonly dbUrl = "postgres://localhost:5432/mydb"
}

class Logger {
  constructor(private config: Config) {
    console.log("Logger created (singleton - only prints once)")
  }

  log(message: string) {
    console.log(`[${this.config.env}] ${message}`)
  }
}

class UserService {
  constructor(private logger: Logger) {}

  findAll() {
    this.logger.log("Finding all users")
    return [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]
  }
}

// Factories: just functions (container) => instance
const config: Factory<Config> = () => new Config()
const logger: Factory<Logger> = (c) => new Logger(c.get(config))

// =============================================================================
// 2. THE inject() HELPER
// =============================================================================
// Shorter syntax when you just need to wire up constructor dependencies.

// These two are equivalent:
const userServiceExplicit: Factory<UserService> = (c) =>
  new UserService(c.get(logger))
const userService = inject(UserService, logger) // Same thing, less typing

// Use explicit factories when you need conditional logic:
// const logger: Factory<Logger> = (c) => {
//   const cfg = c.get(config)
//   return cfg.env === 'test' ? new MockLogger() : new Logger(cfg)
// }

// Multiple dependencies? Just list them:
class ComplexService {
  constructor(
    private config: Config,
    private logger: Logger,
    private users: UserService
  ) {}

  doWork() {
    this.logger.log(`Complex work in ${this.config.env}`)
    return this.users.findAll()
  }
}

// Explicit: full control
const complexExplicit: Factory<ComplexService> = (c) =>
  new ComplexService(c.get(config), c.get(logger), c.get(userService))

// Or with inject(): just list dependencies in constructor order
const complexService = inject(ComplexService, config, logger, userService)

// =============================================================================
// 3. CHILD CONTAINERS (Per-Request Scoping)
// =============================================================================
// Child containers share parent singletons but have their own cache.

class RequestContext {
  constructor(public requestId: string, public userId: string | null) {}
}

class RequestHandler {
  constructor(private logger: Logger, private ctx: RequestContext) {}

  handle() {
    this.logger.log(`[${this.ctx.requestId}] User: ${this.ctx.userId}`)
    return { ok: true }
  }
}

function handleRequest(app: Container, userId: string | null) {
  const requestId = crypto.randomUUID().slice(0, 8)

  // Child container inherits app singletons (logger, config)
  // but gets fresh instances for request-scoped factories
  const request = childContainer(app)

  // Request-specific factory
  const ctx: Factory<RequestContext> = () =>
    new RequestContext(requestId, userId)
  const handler = inject(RequestHandler, logger, ctx)

  return request.get(handler).handle()
}

// =============================================================================
// 4. ASYNC FACTORIES
// =============================================================================
// For database connections, HTTP clients, anything async.

class Database {
  private connected = true

  private constructor(private url: string) {}

  static async connect(url: string): Promise<Database> {
    await new Promise((r) => setTimeout(r, 50)) // Simulate connection
    console.log(`Database connected to ${url}`)
    return new Database(url)
  }

  async close() {
    await new Promise((r) => setTimeout(r, 25))
    this.connected = false
    console.log("Database connection closed")
  }

  query() {
    if (!this.connected) throw new Error("Database not connected")
    return [{ id: 1, name: "Alice" }]
  }
}

// Async factory - returns Promise<Database>
const database: Factory<Promise<Database>> = (c) => {
  const cfg = c.get(config)
  return Database.connect(cfg.dbUrl).then((db) => {
    // Register cleanup (see section 5)
    c.onDispose(() => db.close())
    return db
  })
}

// =============================================================================
// 5. DISPOSAL / CLEANUP
// =============================================================================
// Register cleanup functions with onDispose(), called on container.dispose()

class Server {
  constructor(private logger: Logger) {
    console.log("Server started")
  }

  async stop() {
    console.log("Server stopped")
  }
}

const server: Factory<Server> = (c) => {
  const srv = new Server(c.get(logger))
  c.onDispose(() => srv.stop()) // Cleanup in reverse order (LIFO)
  return srv
}

// =============================================================================
// 6. CIRCULAR DEPENDENCY DETECTION
// =============================================================================
// Enabled by default. Throws a helpful error instead of stack overflow.

// Uncomment to see the error:
// const a: Factory<{ b: unknown }> = (c) => ({ b: c.get(b) })
// const b: Factory<{ a: unknown }> = (c) => ({ a: c.get(a) })
// container.get(a) // Error: Circular dependency detected: a -> b -> a

// Disable detection for performance (not recommended):
// const container = createContainer({ detectCircular: false })

// =============================================================================
// 7. PATTERNS PLUGIN (Type-Safe Decorators)
// =============================================================================
// The patterns plugin provides NestJS-like decorators with full type safety.

import {
  pipe,
  guard,
  validate,
  intercept,
  catchError,
  transform,
  type InterceptContext,
} from "no-decoration/patterns"
import { factory } from "no-decoration"

// Guard: Access control before resolution
const requireEnv = (envVar: string) => () => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required env var: ${envVar}`)
  }
}

// Validate: Transform/validate after resolution
interface ApiConfig {
  apiKey: string
  baseUrl: string
}

const validateApiConfig = (cfg: ApiConfig): ApiConfig => {
  if (!cfg.apiKey) throw new Error("Missing apiKey")
  if (!cfg.baseUrl.startsWith("http")) throw new Error("Invalid baseUrl")
  return cfg
}

// Intercept: Wrap resolution (timing, logging, etc.)
const timing = <T>(next: () => T, ctx: InterceptContext<T>): T => {
  const start = Date.now()
  const result = next()
  console.log(`  [timing] ${ctx.factory.displayName} resolved in ${Date.now() - start}ms`)
  return result
}

// catchError: Handle resolution errors with fallback
const withFallback = <T>(fallback: T) => (error: unknown): T => {
  console.log(`  [fallback] Using fallback due to: ${error}`)
  return fallback
}

// Compose decorators with pipe() - types flow through each step
const apiConfig = pipe(
  factory("ApiConfig", (): ApiConfig => ({
    apiKey: process.env.API_KEY || "demo-key",
    baseUrl: "https://api.example.com",
  })),
  validate(validateApiConfig), // Type: Factory<ApiConfig>
  intercept(timing),           // Type: Factory<ApiConfig>
)

// Transform changes the type - TypeScript tracks this!
interface User {
  id: number
  name: string
  email: string
}

const usersFactory = factory("Users", (): User[] => [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
])

// Transform User[] to string[] - the type changes!
const userEmails = pipe(
  usersFactory,
  transform((users) => users.map((u) => u.email))
)
// userEmails is now Factory<string[]> - hover to verify!

// Error handling with type-safe fallback
const riskyFactory = pipe(
  factory("Risky", (): number => {
    if (Math.random() > 0.5) throw new Error("Random failure")
    return 42
  }),
  catchError(withFallback(-1)) // Fallback must return number
)

// =============================================================================
// PUTTING IT ALL TOGETHER
// =============================================================================

async function main() {
  console.log("=== Creating app container ===")
  const app = createContainer()

  // Basic singleton
  console.log("\n=== Basic DI ===")
  const users = app.get(userService)
  console.log("Users:", users.findAll())

  // Same instance (singleton)
  const users2 = app.get(userService)
  console.log("Same instance?", users === users2)

  // Multiple dependencies
  console.log("\n=== Multiple Dependencies ===")
  const complex = app.get(complexService)
  console.log("Complex result:", complex.doWork())

  // Async factory
  console.log("\n=== Async Factory ===")
  const db = await app.get(database)
  console.log("Query:", db.query())

  // Start server (registers cleanup)
  app.get(server)

  // Per-request scoping
  console.log("\n=== Per-Request Scoping ===")
  handleRequest(app, "alice")
  handleRequest(app, "bob")
  // Notice: "Logger created" only printed once (shared singleton)

  // Patterns plugin demo
  console.log("\n=== Patterns Plugin ===")

  // Validated config with timing
  const cfg = app.get(apiConfig)
  console.log("API Config:", cfg)

  // Transform: User[] -> string[]
  const emails: string[] = app.get(userEmails) // Type is string[]!
  console.log("User emails:", emails)

  // Error handling with fallback
  const value = app.get(riskyFactory)
  console.log("Risky value (or fallback):", value)

  // Cleanup everything
  console.log("\n=== Disposal ===")
  await app.dispose()

  // After disposal, resources are cleaned up
  try {
    db.query()
  } catch (e) {
    console.log("Expected error:", (e as Error).message)
  }
}

main()
