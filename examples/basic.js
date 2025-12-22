// =============================================================================
// Basic DI Concepts
// =============================================================================
// Run with: node examples/basic.js
//
// This example covers the core API:
//   1. Factories and createContainer
//   2. factory() helper for named factories
//   3. inject() helper for class/function wiring
//   4. transient() for fresh instances
//   5. Async factories
//   6. Disposal and cleanup
//   7. Child containers and scoping
//   8. Circular dependency detection
// =============================================================================

import {
  createContainer,
  childContainer,
  factory,
  inject,
  transient,
  scoped,
} from "no-decoration"

/** @import * as Types from 'no-decoration' */

// =============================================================================
// 1. FACTORIES AND CONTAINERS
// =============================================================================
// A factory is just a function: (container) => value
// The container caches results, so factories are singletons by default.

console.log("=== 1. Factories and Containers ===\n")

class Config {
  env = process.env.NODE_ENV || "development"
  dbUrl = "postgres://localhost:5432/mydb"
}

class Logger {
  /** @param {Config} config */
  constructor(config) {
    this.config = config
    console.log("[Logger] Created (this only prints once - singleton!)")
  }

  /** @param {string} message */
  log(message) {
    console.log(`[${this.config.env}] ${message}`)
  }
}

class UserService {
  /** @param {Logger} logger */
  constructor(logger) {
    this.logger = logger
  }

  /** @param {string} name */
  createUser(name) {
    this.logger.log(`Creating user: ${name}`)
    return { id: crypto.randomUUID(), name }
  }
}

// Define factories - just functions that take a container
/** @type {Types.Factory<Config>} */
const config = () => new Config()

/** @type {Types.Factory<Logger>} */
const logger = (c) => new Logger(c.get(config))
//                     ↑ c.get() resolves dependencies

/** @type {Types.Factory<UserService>} */
const userService = (c) => new UserService(c.get(logger))

// Use the container
const container = createContainer()
const service = container.get(userService)
service.createUser("Alice")
service.createUser("Bob")

// Same instance every time (singleton)
const service2 = container.get(userService)
console.log("Same instance?", service === service2) // true

// =============================================================================
// 2. THE factory() HELPER
// =============================================================================
// factory(name, fn) creates a named factory. Names help with debugging.

console.log("\n=== 2. The factory() Helper ===\n")

/** @type {Types.Factory<{port: number}>} */
const serverConfig = factory("ServerConfig", () => ({ port: 3000 }))

console.log("Factory name:", serverConfig.displayName) // "ServerConfig"
console.log("Config:", createContainer().get(serverConfig))

// =============================================================================
// 3. THE inject() HELPER
// =============================================================================
// inject() is shorthand for wiring constructors. Works with classes and functions.

console.log("\n=== 3. The inject() Helper ===\n")

// With classes:
class Database {
  /** @param {Config} config */
  constructor(config) {
    this.url = config.dbUrl
  }
}

const databaseFactory = inject(Database, config)
// Equivalent to: (c) => new Database(c.get(config))

// With regular functions:
/**
 * @param {Config} cfg
 * @param {Logger} log
 */
function createApiClient(cfg, log) {
  log.log("Creating API client")
  return { url: cfg.dbUrl, connected: true }
}

const apiClient = inject(createApiClient, config, logger)
// Equivalent to: (c) => createApiClient(c.get(config), c.get(logger))

// With async functions:
/**
 * @param {Config} cfg
 * @param {Logger} log
 */
async function connectToService(cfg, log) {
  log.log("Connecting to external service...")
  await new Promise((r) => setTimeout(r, 50))
  return { url: cfg.dbUrl, ready: true }
}

const externalService = inject(connectToService, config, logger)

const c2 = createContainer()
console.log("Database:", c2.get(databaseFactory))
console.log("API Client:", c2.get(apiClient))
console.log("External Service:", await c2.get(externalService))

// =============================================================================
// 4. TRANSIENT FACTORIES
// =============================================================================
// By default, factories are singletons. Use transient() for fresh instances.

console.log("\n=== 4. Transient Factories ===\n")

let commandCount = 0

class Command {
  id = ++commandCount
  timestamp = Date.now()

  execute() {
    console.log(`[Command ${this.id}] Executing...`)
  }
}

// Singleton (default)
const singletonCommand = factory("SingletonCommand", () => new Command())

// Transient - new instance every time
const transientCommand = transient(factory("TransientCommand", () => new Command()))

const c3 = createContainer()

console.log("Singleton:")
const s1 = c3.get(singletonCommand)
const s2 = c3.get(singletonCommand)
console.log("  Same instance?", s1 === s2) // true

console.log("Transient:")
const t1 = c3.get(transientCommand)
const t2 = c3.get(transientCommand)
const t3 = c3.get(transientCommand)
console.log("  Same instance?", t1 === t2) // false
console.log("  IDs:", t1.id, t2.id, t3.id) // 2, 3, 4

// =============================================================================
// 5. ASYNC FACTORIES
// =============================================================================
// Factories can be async. Just await the result of container.get().

console.log("\n=== 5. Async Factories ===\n")

class AsyncDatabase {
  connected = true

  /** @param {string} url */
  constructor(url) {
    this.url = url
  }

  /** @param {string} url */
  static async connect(url) {
    await new Promise((r) => setTimeout(r, 50))
    console.log(`[AsyncDatabase] Connected to ${url}`)
    return new AsyncDatabase(url)
  }

  async close() {
    await new Promise((r) => setTimeout(r, 25))
    this.connected = false
    console.log("[AsyncDatabase] Connection closed")
  }

  query() {
    if (!this.connected) throw new Error("Not connected")
    return [{ id: 1, name: "Alice" }]
  }
}

/** @type {Types.Factory<Promise<AsyncDatabase>>} */
const asyncDatabase = factory("AsyncDatabase", async (c) => {
  const cfg = c.get(config)
  const db = await AsyncDatabase.connect(cfg.dbUrl)
  c.onDispose(() => db.close()) // Register cleanup
  return db
})

const c4 = createContainer()
const db = await c4.get(asyncDatabase)
console.log("Query result:", db.query())

// =============================================================================
// 6. DISPOSAL AND CLEANUP
// =============================================================================
// Register cleanup with onDispose(). Called in reverse order on dispose().

console.log("\n=== 6. Disposal and Cleanup ===\n")

/** @type {Types.Factory<{name: string}>} */
const resource1 = factory("Resource1", (c) => {
  console.log("  Creating Resource1")
  c.onDispose(() => console.log("  Disposing Resource1"))
  return { name: "r1" }
})

/** @type {Types.Factory<{name: string}>} */
const resource2 = factory("Resource2", (c) => {
  console.log("  Creating Resource2")
  c.onDispose(() => console.log("  Disposing Resource2"))
  return { name: "r2" }
})

/** @type {Types.Factory<{name: string}>} */
const resource3 = factory("Resource3", (c) => {
  c.get(resource1)
  c.get(resource2)
  console.log("  Creating Resource3")
  c.onDispose(() => console.log("  Disposing Resource3"))
  return { name: "r3" }
})

const c5 = createContainer()
c5.get(resource3)

console.log("\nDisposing (reverse order):")
await c5.dispose()

// Also disposes the async database from section 5
await c4.dispose()

// =============================================================================
// 7. CHILD CONTAINERS AND SCOPING
// =============================================================================
// Child containers share parent singletons but have their own cache.
// Perfect for per-request isolation in HTTP servers.

console.log("\n=== 7. Child Containers and Scoping ===\n")

// App-wide singleton
/** @type {Types.Factory<Logger>} */
const appLogger = factory("AppLogger", (c) => {
  console.log("  Creating AppLogger (once)")
  return new Logger(c.get(config))
})

// Request-scoped context
class RequestContext {
  /**
   * @param {string} requestId
   * @param {string | null} userId
   */
  constructor(requestId, userId) {
    this.requestId = requestId
    this.userId = userId
  }
}

// Using scoped() - creates factory that captures parameters
// The creator always receives container as first arg (use _ to ignore if not needed)
const requestContext = scoped(
  /**
   * @param {Types.Container} _
   * @param {string} requestId
   * @param {string | null} userId
   */
  (_, requestId, userId) => new RequestContext(requestId, userId)
)

// scoped() with container access for resolving dependencies
const requestHandler = scoped(
  /**
   * @param {Types.Container} c
   * @param {string} requestId
   * @param {string | null} userId
   */
  (c, requestId, userId) => {
    const log = c.get(appLogger)
    const ctx = c.get(requestContext(requestId, userId))
    return {
      handle() {
        log.log(`[${ctx.requestId}] User: ${ctx.userId}`)
        return { ok: true }
      },
    }
  }
)

// App container
const app = createContainer()

// IMPORTANT: Pre-resolve app-wide singletons BEFORE creating child containers.
// If you skip this, each child would create its own instance because
// singletons are only shared if they're already in the parent's cache.
app.get(appLogger)

/**
 * @param {string} userId
 */
function handleRequest(userId) {
  const requestId = crypto.randomUUID().slice(0, 8)

  // Child inherits app singletons (already cached above), gets own cache for request-scoped
  const request = childContainer(app)

  const handler = request.get(requestHandler(requestId, userId))
  return handler.handle()
}

console.log("Request 1:", handleRequest("alice"))
console.log("Request 2:", handleRequest("bob"))
console.log("Request 3:", handleRequest("charlie"))
// AppLogger is only created once because we pre-resolved it in the parent!

// =============================================================================
// 8. CIRCULAR DEPENDENCY DETECTION
// =============================================================================
// The container detects circular dependencies and throws a helpful error.

console.log("\n=== 8. Circular Dependency Detection ===\n")

// Uncomment to see the error:
// const a = factory("A", (c) => ({ name: "A", b: c.get(b) }))
// const b = factory("B", (c) => ({ name: "B", a: c.get(a) }))
// createContainer().get(a)
// → Error: Circular dependency detected: A -> B -> A

console.log("Circular dependencies are detected at runtime.")
console.log("Uncomment the code above to see the error message.")

// You can disable detection for performance (not recommended):
// const container = createContainer({ detectCircular: false })

console.log("\n=== Basic Examples Complete ===")
