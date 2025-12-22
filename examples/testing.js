// =============================================================================
// Testing with DI
// =============================================================================
// Run with: node examples/testing.js
//
// This example shows how DI makes testing easy:
//   1. Basic override() for mocking
//   2. withMocks() for batch mocking
//   3. snapshot() / restore() for test isolation
//   4. tryGet() for optional dependencies
//   5. validate() for startup checks
//   6. clearCache() for resetting state
// =============================================================================

import { createContainer, factory, transient } from "no-decoration"
import { testing, observability } from "no-decoration/plugins"

/** @import * as Types from 'no-decoration' */

// =============================================================================
// SETUP: Example Services
// =============================================================================

class Database {
  connected = true

  constructor() {
    console.log("  [Real Database] Connected")
  }

  /** @param {string} sql */
  query(sql) {
    console.log(`  [Real Database] Query: ${sql}`)
    return [{ id: 1, name: "Real Data" }]
  }

  close() {
    this.connected = false
    console.log("  [Real Database] Closed")
  }
}

class Logger {
  /** @param {string} msg */
  log(msg) {
    console.log(`  [Real Logger] ${msg}`)
  }
}

class EmailService {
  /** @param {string} to @param {string} subject */
  send(to, subject) {
    console.log(`  [Real Email] Sending "${subject}" to ${to}`)
    return { sent: true }
  }
}

class UserService {
  /**
   * @param {Database} db
   * @param {Logger} logger
   */
  constructor(db, logger) {
    this.db = db
    this.logger = logger
  }

  getUsers() {
    this.logger.log("Fetching users")
    return this.db.query("SELECT * FROM users")
  }
}

// Factories
/** @type {Types.Factory<Database>} */
const database = factory("Database", (c) => {
  const db = new Database()
  c.onDispose(() => db.close())
  return db
})

/** @type {Types.Factory<Logger>} */
const logger = factory("Logger", () => new Logger())

/** @type {Types.Factory<EmailService>} */
const emailService = factory("EmailService", () => new EmailService())

/** @type {Types.Factory<UserService>} */
const userService = factory("UserService", (c) =>
  new UserService(c.get(database), c.get(logger))
)

// =============================================================================
// 1. BASIC OVERRIDE
// =============================================================================
// Use override() to swap a real dependency with a mock.

console.log("=== 1. Basic Override ===\n")

const container = createContainer().with(testing)

// Create a mock database
/** @type {Types.Factory<{query: (sql: string) => Array<{id: number, name: string}>}>} */
const mockDatabase = () => ({
  query: (sql) => {
    console.log(`  [Mock Database] Query: ${sql}`)
    return [{ id: 999, name: "Mock Data" }]
  },
})

// Override the real database with the mock
container.override(database, mockDatabase)

// Now userService uses the mock
const users = container.get(userService)
console.log("Result:", users.getUsers())

// =============================================================================
// 2. BATCH MOCKING WITH withMocks()
// =============================================================================
// Use withMocks() to set up multiple mocks at once.

console.log("\n=== 2. Batch Mocking with withMocks() ===\n")

const testContainer = createContainer().with(testing).withMocks([
  // [original, mock] pairs
  [database, () => ({ query: () => [{ id: 1, name: "Mock" }] })],
  [logger, () => ({ log: () => {} })], // Silent mock
  [emailService, () => ({ send: () => ({ sent: false, reason: "mocked" }) })],
])

console.log("Database query:", testContainer.get(database).query("test"))
console.log("Email send:", testContainer.get(emailService).send("test@test.com", "Hi"))
// Logger is silent - no output

// =============================================================================
// 3. SNAPSHOT / RESTORE FOR TEST ISOLATION
// =============================================================================
// Capture container state, make changes, then restore.

console.log("\n=== 3. Snapshot / Restore ===\n")

const c2 = createContainer().with(testing)

// Capture initial state
console.log("Taking snapshot...")
const snapshot = c2.snapshot()

// Make changes - provide a complete mock that matches Database interface
c2.override(database, () => ({
  connected: true,
  query: () => [{ id: 1, name: "Override" }],
  close: () => {},
}))
console.log("After override:", c2.get(database).query("test"))

// Restore to clean state
c2.restore(snapshot)
c2.clearCache() // Also clear cached instances

console.log("After restore: (using real database)")
console.log("Result:", c2.get(userService).getUsers())

// =============================================================================
// 4. tryGet() FOR OPTIONAL DEPENDENCIES
// =============================================================================
// tryGet() returns undefined instead of throwing if factory fails.

console.log("\n=== 4. tryGet() for Optional Dependencies ===\n")

/** @type {Types.Factory<{get: (key: string) => string | null, set: (key: string, value: string) => void}>} */
const optionalCache = factory("OptionalCache", () => {
  throw new Error("Cache not configured!")
})

/** @type {Types.Factory<{data: string, cache: {get: (key: string) => string | null, set: (key: string, value: string) => void}}>} */
const serviceWithOptionalDep = factory("ServiceWithOptional", (c) => {
  // Try to get cache, use fallback if not available
  const cache = c.tryGet(optionalCache) ?? {
    get: () => null,
    set: () => {},
  }

  return {
    data: "some data",
    cache,
  }
})

const c3 = createContainer()
const svc = c3.get(serviceWithOptionalDep)
console.log("Service created despite missing cache:", !!svc)
console.log("Fallback cache works:", svc.cache.get("key") === null)

// =============================================================================
// 5. VALIDATE FOR STARTUP CHECKS
// =============================================================================
// validate() resolves factories and reports errors without crashing.

console.log("\n=== 5. validate() for Startup Checks ===\n")

/** @type {Types.Factory<{ok: boolean}>} */
const goodFactory = factory("GoodFactory", () => ({ ok: true }))

/** @type {Types.Factory<{ok: boolean}>} */
const badFactory = factory("BadFactory", () => {
  throw new Error("Configuration missing!")
})

const c4 = createContainer().with(observability)

// Validate good factories - should pass
console.log("Validating good factories...")
await c4.validate([goodFactory])
console.log("  Good factories validated!")

// Validate bad factories - catches errors
console.log("Validating bad factories...")
try {
  await c4.validate([badFactory])
} catch (e) {
  console.log("  Caught error:", /** @type {Error} */ (e).message)
}

// Get detailed report instead of throwing
console.log("\nGetting validation report...")
const validationReport = await c4.validateReport([goodFactory, badFactory])
console.log("  Valid:", validationReport.valid)
console.log("  Errors:", validationReport.errors.map((e) => e.factory))

// =============================================================================
// 6. clearCache() FOR RESETTING STATE
// =============================================================================
// clearCache() removes all cached instances without disposing them.

console.log("\n=== 6. clearCache() for Resetting State ===\n")

let createCount = 0

/** @type {Types.Factory<{id: number}>} */
const countedFactory = factory("Counted", () => {
  createCount++
  console.log(`  Creating instance #${createCount}`)
  return { id: createCount }
})

const c5 = createContainer()

console.log("First get:", c5.get(countedFactory))
console.log("Second get (cached):", c5.get(countedFactory))

c5.clearCache()
console.log("After clearCache:")

console.log("Third get (fresh):", c5.get(countedFactory))

// =============================================================================
// 7. TRANSIENT IN TESTS
// =============================================================================
// Transient factories create fresh instances - useful for commands, events, etc.

console.log("\n=== 7. Transient Factories in Tests ===\n")

let cmdCount = 0

/** @type {Types.Factory<{id: number, execute: () => void}>} */
const command = transient(
  factory("Command", () => ({
    id: ++cmdCount,
    execute() {
      console.log(`  Executing command ${this.id}`)
    },
  }))
)

const c6 = createContainer()
const cmd1 = c6.get(command)
const cmd2 = c6.get(command)
const cmd3 = c6.get(command)

console.log("Command IDs:", cmd1.id, cmd2.id, cmd3.id) // 1, 2, 3
cmd1.execute()
cmd2.execute()

// =============================================================================
// CLEANUP
// =============================================================================

console.log("\n=== Cleanup ===\n")
await container.dispose()
await c2.dispose()

console.log("\n=== Testing Examples Complete ===")
