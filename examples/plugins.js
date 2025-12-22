// =============================================================================
// Production Plugins
// =============================================================================
// Run with: node examples/plugins.js
//
// This example covers production-ready plugins and features:
//   1. Health checks (health plugin)
//   2. Observability - events, dependency graph (observability plugin)
//   3. Timeout for slow factories
//   4. Tagged factories for namespaced singletons
//   5. wrap() for cross-cutting concerns
//   6. Interceptors for AOP
//   7. Container freezing and read-only views
//   8. Scoped containers with childContainer()
//   9. Batch factory definitions (batch plugin)
//   10. Factory discovery (discover plugin)
// =============================================================================

import {
  createContainer,
  childContainer,
  factory,
  timeout,
  tagged,
  wrap,
} from "no-decoration"
import { health, observability, defineFactories, discover } from "no-decoration/plugins"

/** @import * as Types from 'no-decoration' */

// =============================================================================
// 1. HEALTH CHECKS
// =============================================================================
// Register health checks with onHealthCheck(), run them with checkHealth().

console.log("=== 1. Health Checks ===\n")

/** @type {Types.Factory<{connected: boolean, ping: () => Promise<boolean>}>} */
const database = factory("Database", () => ({
  connected: true,
  async ping() {
    await new Promise((r) => setTimeout(r, 5))
    return true
  },
}))

/** @type {Types.Factory<{connected: boolean, ping: () => Promise<string>}>} */
const cache = factory("Cache", () => ({
  connected: true,
  async ping() {
    await new Promise((r) => setTimeout(r, 2))
    return "PONG"
  },
}))

// Create container with health plugin
const healthContainer = createContainer().with(health)

// Get services
const dbInstance = healthContainer.get(database)
const redisInstance = healthContainer.get(cache)

// Register health checks on the container (not inside factories)
healthContainer.onHealthCheck("database", async () => {
  await dbInstance.ping()
})
healthContainer.onHealthCheck("cache", async () => {
  const result = await redisInstance.ping()
  if (result !== "PONG") throw new Error("Cache not responding")
})

// Run all health checks
const report = await healthContainer.checkHealth()
console.log("Health report:", {
  healthy: report.healthy,
  checks: Object.fromEntries(
    [...report.checks].map(([name, result]) => [
      name,
      { healthy: result.healthy, ms: result.ms.toFixed(2) + "ms" },
    ])
  ),
})

// =============================================================================
// 2. OBSERVABILITY - EVENTS
// =============================================================================
// Listen to resolve, dispose, and override events.

console.log("\n=== 2. Observability - Events ===\n")

const obsContainer = createContainer().with(observability)

// Track all resolutions
/** @type {Array<{name: string, ms: string}>} */
const resolutions = []

const unsub = obsContainer.on("resolve", (f, _instance, ms) => {
  const name = f.displayName || f.name || "anonymous"
  resolutions.push({ name, ms: ms.toFixed(2) })
  console.log(`  Resolved: ${name} in ${ms.toFixed(2)}ms`)
})

// Define some factories
/** @type {Types.Factory<{dbUrl: string}>} */
const config = factory("Config", () => ({ dbUrl: "postgres://..." }))

/** @type {Types.Factory<{log: (msg: string) => void}>} */
const logger = factory("Logger", () => ({
  log: (msg) => console.log(`  [LOG] ${msg}`),
}))

/** @type {Types.Factory<{url: string}>} */
const dbFactory = factory("Database2", (c) => ({ url: c.get(config).dbUrl }))

/** @type {Types.Factory<{db: {url: string}, log: {log: (msg: string) => void}}>} */
const userService = factory("UserService", (c) => ({
  db: c.get(dbFactory),
  log: c.get(logger),
}))

// Resolve and watch events
obsContainer.get(userService)
console.log("Resolution order:", resolutions.map((r) => r.name).join(" → "))

unsub() // Unsubscribe

// =============================================================================
// 3. OBSERVABILITY - DEPENDENCY GRAPH
// =============================================================================
// Visualize the dependency graph.

console.log("\n=== 3. Dependency Graph ===\n")

const graph = obsContainer.getDependencyGraph()

console.log("Mermaid diagram:")
console.log(graph.toMermaid())

console.log("Topological order:")
console.log(
  graph
    .getTopologicalOrder()
    .map((f) => f.displayName || f.name)
    .join(" → ")
)

// =============================================================================
// 4. TIMEOUT FOR SLOW FACTORIES
// =============================================================================
// Wrap factories with timeout() to fail if they take too long.

console.log("\n=== 4. Timeout ===\n")

/** @type {Types.Factory<Promise<{ready: boolean}>>} */
const slowService = factory("SlowService", async () => {
  await new Promise((r) => setTimeout(r, 100))
  return { ready: true }
})

// With short timeout - will fail
const timedService = timeout(slowService, 50)

const c2 = createContainer()
try {
  await c2.get(timedService)
} catch (e) {
  console.log("Timeout caught:", /** @type {Error} */ (e).message)
}

// With longer timeout - will succeed
const timedService2 = timeout(slowService, 200)
const result = await createContainer().get(timedService2)
console.log("With longer timeout:", result)

// =============================================================================
// 5. TAGGED FACTORIES
// =============================================================================
// Create namespaced singletons with tagged().

console.log("\n=== 5. Tagged Factories ===\n")

// tagged() returns a function that creates factories for each tag
const loggerFactory = tagged("logger", (tag) =>
  factory(`Logger:${tag}`, () => ({
    log: (/** @type {string} */ msg) => console.log(`  [${tag.toUpperCase()}] ${msg}`),
  }))
)

const c3 = createContainer()

// Different loggers for different modules
const appLogger = c3.get(loggerFactory("app"))
const dbLogger = c3.get(loggerFactory("database"))
const apiLogger = c3.get(loggerFactory("api"))

appLogger.log("Application started")
dbLogger.log("Database connected")
apiLogger.log("API listening")

// Same tag = same instance (cached)
const appLogger2 = c3.get(loggerFactory("app"))
console.log("\nSame instance for same tag:", appLogger === appLogger2)

// =============================================================================
// 6. DECORATORS
// =============================================================================
// Wrap instances with cross-cutting concerns.

console.log("\n=== 6. Decorators ===\n")

/** @type {Types.Factory<{process: (data: string) => string}>} */
const service = factory("Service", () => ({
  process: (data) => {
    console.log("  Processing:", data)
    return data.toUpperCase()
  },
}))

// Wrap with logging
const loggedService = wrap(service, (instance) => ({
  ...instance,
  process: (/** @type {string} */ data) => {
    console.log("  [Before] process called with:", data)
    const result = instance.process(data)
    console.log("  [After] process returned:", result)
    return result
  },
}))

const c4 = createContainer()
c4.get(loggedService).process("hello")

// =============================================================================
// 7. INTERCEPTORS
// =============================================================================
// Global middleware that runs on every factory resolution.

console.log("\n=== 7. Interceptors ===\n")

// Timing interceptor
/** @type {import('no-decoration').Interceptor} */
const timingInterceptor = (f, next) => {
  const start = performance.now()
  const result = next()
  const ms = performance.now() - start
  console.log(`  [Timing] ${f.displayName || f.name}: ${ms.toFixed(2)}ms`)
  return result
}

// Logging interceptor
/** @type {import('no-decoration').Interceptor} */
const loggingInterceptor = (f, next) => {
  console.log(`  [Enter] ${f.displayName || f.name}`)
  const result = next()
  console.log(`  [Exit] ${f.displayName || f.name}`)
  return result
}

const c5 = createContainer({
  interceptors: [loggingInterceptor, timingInterceptor],
})

/** @type {Types.Factory<{ready: boolean}>} */
const interceptedService = factory("SlowInit", () => {
  const start = Date.now()
  while (Date.now() - start < 10) {} // 10ms delay
  return { ready: true }
})

c5.get(interceptedService)

// =============================================================================
// 8. CONTAINER FREEZING AND READ-ONLY
// =============================================================================
// Lock down containers for production.

console.log("\n=== 8. Freezing and Read-Only ===\n")

/** @type {Types.Factory<{port: number}>} */
const appConfig = factory("AppConfig", () => ({ port: 3000 }))

/** @type {Types.Factory<{config: {port: number}}>} */
const app = factory("App", (c) => ({ config: c.get(appConfig) }))

/** @type {Types.Factory<{lazy: boolean}>} */
const lazyService = factory("LazyService", () => ({ lazy: true }))

const prodContainer = createContainer().with(observability)

// Initialize required services
await prodContainer.validate([appConfig, app])
console.log("Validated required services")

// Freeze - no new factories can be resolved
prodContainer.freeze()
console.log("Container frozen")

// Existing factories still work
console.log("Config port:", prodContainer.get(appConfig).port)

// But new factories fail
try {
  prodContainer.get(lazyService)
} catch (e) {
  console.log("Lazy resolution blocked:", /** @type {Error} */ (e).message)
}

// Read-only view - no mutation methods
const readOnly = prodContainer.asReadOnly()
console.log("\nRead-only container:")
console.log("  Can get:", readOnly.get(appConfig).port)
console.log("  Has override?", "override" in readOnly) // false

// =============================================================================
// 9. SCOPED CONTAINERS
// =============================================================================
// Create child containers that auto-dispose.

console.log("\n=== 9. Scoped Containers ===\n")

/** @type {Types.Factory<{handle: () => string}>} */
const requestHandler = factory("RequestHandler", (c) => {
  console.log("  Creating request handler")
  c.onDispose(() => console.log("  Disposing request handler"))
  return { handle: () => "response" }
})

const appContainer = createContainer()

/**
 * @param {number} id
 */
async function handleRequest(id) {
  console.log(`Request ${id}:`)

  // childContainer() returns a child that supports await using
  const scope = childContainer(appContainer)
  try {
    const handler = scope.get(requestHandler)
    return handler.handle()
  } finally {
    await scope.dispose() // Cleanup when done
  }
}

await handleRequest(1)
await handleRequest(2)

// =============================================================================
// 10. BATCH FACTORY DEFINITIONS
// =============================================================================
// Define multiple factories at once with defineFactories().

console.log("\n=== 10. Batch Factory Definitions ===\n")

// Define factories with forward references using the callback pattern
/**
 * @typedef {{
 *   config: Types.Factory<{env: string, dbUrl: string}>,
 *   logger: Types.Factory<{log: (msg: string) => void}>,
 *   database: Types.Factory<{url: string, connected: boolean}>
 * }} BatchFactories
 */

/** @type {BatchFactories} */
const batchFactories = defineFactories((/** @type {BatchFactories} */ $) => ({
  config: () => ({
    env: "production",
    dbUrl: "postgres://...",
  }),

  logger: (/** @type {Types.Container} */ c) => ({
    log: (/** @type {string} */ msg) =>
      console.log(`  [${c.get($.config).env}] ${msg}`),
  }),

  database: (/** @type {Types.Container} */ c) => {
    c.get($.logger).log("Connecting to database...")
    return { url: c.get($.config).dbUrl, connected: true }
  },
}))

const c6 = createContainer()
console.log("Database:", c6.get(batchFactories.database))

// =============================================================================
// 11. FACTORY DISCOVERY
// =============================================================================
// Scan codebase for factory definitions.

console.log("\n=== 11. Factory Discovery ===\n")

// discover() scans JavaScript/TypeScript files for factory patterns
const discovered = await discover(["./examples/multifile"])

console.log(`Found ${discovered.factories.length} factories:`)
for (const f of discovered.factories) {
  console.log(`  - ${f.name} (${f.type})${f.options?.async ? " [async]" : ""}`)
}

console.log("\nDependency graph:")
const mermaid = discovered.toMermaid()
console.log(mermaid.includes("-->") ? mermaid : "  (No dependencies detected)")

// =============================================================================
// CLEANUP
// =============================================================================

console.log("\n=== Cleanup ===\n")
await healthContainer.dispose()
await obsContainer.dispose()

console.log("=== Plugin Examples Complete ===")
