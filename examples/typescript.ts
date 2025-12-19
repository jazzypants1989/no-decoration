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
