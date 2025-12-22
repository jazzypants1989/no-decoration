// =============================================================================
// Why Dependency Injection?
// =============================================================================
// Run with: node examples/why-di.js
//
// This example shows the problems that arise WITHOUT dependency injection,
// then demonstrates how DI solves each one.
// =============================================================================

import { createContainer, factory, transient } from "no-decoration"

/** @import * as Types from 'no-decoration' */

// =============================================================================
// PART 1: THE PROBLEMS (Without DI)
// =============================================================================

console.log("=== PART 1: Problems Without DI ===\n")

// Problem 1: Hardcoded Dependencies
// ---------------------------------
// Classes create their own dependencies. You can't swap them for tests.

class HardcodedDatabase {
  constructor() {
    // Hardcoded connection - can't use a different DB for tests
    this.url = process.env.DATABASE_URL || "postgres://localhost:5432/mydb"
  }

  /** @param {string} sql */
  query(sql) {
    return [{ id: 1, name: "Alice" }]
  }
}

class HardcodedCache {
  constructor() {
    // Hardcoded connection - can't mock for tests
    this.url = process.env.REDIS_URL || "redis://localhost:6379"
    /** @type {Map<string, unknown>} */
    this.data = new Map()
  }

  /** @param {string} key */
  get(key) {
    return this.data.get(key)
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    this.data.set(key, value)
  }
}

class HardcodedUserService {
  constructor() {
    // Problem: UserService creates its own dependencies
    // - Can't inject mocks for testing
    // - If Database constructor changes, this breaks
    // - Are all UserService instances sharing the same Database? Who knows!
    this.db = new HardcodedDatabase()
    this.cache = new HardcodedCache()
  }

  /** @param {number} id */
  getUser(id) {
    const cached = this.cache.get(`user:${id}`)
    if (cached) return cached

    const users = this.db.query(`SELECT * FROM users WHERE id = ${id}`)
    const user = users[0]
    if (user) this.cache.set(`user:${id}`, user)
    return user
  }
}

// Using it:
const hardcodedService = new HardcodedUserService()
console.log("Hardcoded service works:", hardcodedService.getUser(1))

console.log(`
THE PROBLEMS:

1. TESTING IS HARD
   How do you test UserService without a real database?
   - jest.mock() is fragile and magical
   - Environment variables still load real modules

2. HIDDEN DEPENDENCIES
   Looking at "new UserService()", you can't tell it needs:
   - Database connection
   - Cache connection
   Dependencies are invisible from the outside.

3. NO SHARING CONTROL
   If OrderService also uses Database, are they sharing?
   new Database() in each service = multiple connections!

4. CONFIGURATION MESS
   DATABASE_URL is read inside constructors.
   Every service reads process.env. No single source of truth.

5. LIFECYCLE MYSTERY
   When does the database connection close?
   Resources are created but never explicitly managed.
`)

// =============================================================================
// PART 2: THE SOLUTIONS (With DI)
// =============================================================================

console.log("=== PART 2: Solutions With DI ===\n")

// Solution: Dependencies are PARAMETERS, not created internally

class Config {
  env = process.env.NODE_ENV || "development"
  dbUrl = process.env.DATABASE_URL || "postgres://localhost:5432/mydb"
  redisUrl = process.env.REDIS_URL || "redis://localhost:6379"
}

class Database {
  /** @param {Config} config */
  constructor(config) {
    this.url = config.dbUrl
    console.log(`[Database] Connected to ${this.url}`)
  }

  /** @param {string} sql */
  query(sql) {
    console.log(`[Database] Query: ${sql}`)
    return [{ id: 1, name: "Alice" }]
  }

  close() {
    console.log("[Database] Connection closed")
  }
}

class Cache {
  /** @param {Config} config */
  constructor(config) {
    this.url = config.redisUrl
    console.log(`[Cache] Connected to ${this.url}`)
    /** @type {Map<string, unknown>} */
    this.data = new Map()
  }

  /** @param {string} key */
  get(key) {
    return this.data.get(key)
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    this.data.set(key, value)
  }

  close() {
    console.log("[Cache] Connection closed")
  }
}

class Logger {
  /** @param {Config} config */
  constructor(config) {
    this.env = config.env
  }

  /** @param {string} message */
  log(message) {
    console.log(`[${this.env}] ${message}`)
  }
}

class UserService {
  /**
   * @param {Database} db
   * @param {Cache} cache
   * @param {Logger} logger
   */
  constructor(db, cache, logger) {
    // Dependencies are parameters - visible, testable, swappable!
    this.db = db
    this.cache = cache
    this.logger = logger
  }

  /** @param {number} id */
  getUser(id) {
    const cached = this.cache.get(`user:${id}`)
    if (cached) {
      this.logger.log(`Cache hit for user ${id}`)
      return cached
    }

    this.logger.log(`Cache miss for user ${id}`)
    const users = this.db.query(`SELECT * FROM users WHERE id = ${id}`)
    const user = users[0]
    if (user) this.cache.set(`user:${id}`, user)
    return user
  }
}

// =============================================================================
// Define Factories
// =============================================================================
// A factory is a function: (container) => instance
// The container caches results (singletons by default).

/** @type {Types.Factory<Config>} */
const config = factory("Config", () => new Config())

/** @type {Types.Factory<Database>} */
const database = factory("Database", (c) => {
  const db = new Database(c.get(config))
  c.onDispose(() => db.close()) // Cleanup on dispose!
  return db
})

/** @type {Types.Factory<Cache>} */
const cache = factory("Cache", (c) => {
  const redis = new Cache(c.get(config))
  c.onDispose(() => redis.close())
  return redis
})

/** @type {Types.Factory<Logger>} */
const logger = factory("Logger", (c) => new Logger(c.get(config)))

/** @type {Types.Factory<UserService>} */
const userService = factory("UserService", (c) =>
  new UserService(c.get(database), c.get(cache), c.get(logger))
)

// =============================================================================
// Production Usage
// =============================================================================

console.log("--- Creating Container ---")
const container = createContainer()

console.log("\n--- Getting UserService ---")
const service = container.get(userService)

console.log("\n--- Using the Service ---")
service.getUser(1) // Cache miss
service.getUser(1) // Cache hit

console.log("\n--- Singleton Behavior ---")
const service2 = container.get(userService)
console.log("Same instance?", service === service2) // true!

// =============================================================================
// Solution 1: TESTING IS EASY
// =============================================================================

console.log("\n--- Testing with Mocks ---")

// Create a fresh container with mock dependencies
const testContainer = createContainer()

// Override specific factories with mocks that match the interface
/** @type {Types.Factory<Database>} */
const mockDatabase = () => /** @type {Database} */ ({
  url: "mock://",
  query: () => [{ id: 99, name: "Mock User" }],
  close: () => {},
})

/** @type {Types.Factory<Cache>} */
const mockCache = () => /** @type {Cache} */ ({
  url: "mock://",
  data: new Map(),
  get: () => null,
  set: () => {},
  close: () => {},
})

/** @type {Types.Factory<Logger>} */
const mockLogger = () => /** @type {Logger} */ ({
  env: "test",
  log: () => {},
})

/** @type {Types.Factory<UserService>} */
const testUserService = factory("TestUserService", (c) =>
  new UserService(c.get(mockDatabase), c.get(mockCache), c.get(mockLogger))
)

const testService = testContainer.get(testUserService)
console.log("Test result:", testService.getUser(99))

// =============================================================================
// Solution 2: VISIBLE DEPENDENCIES
// =============================================================================

console.log(`
--- Visible Dependencies ---
Look at the factories - you can SEE the dependency graph:

  config (no deps)
     ↓
  ┌──┴──┬────────┐
  ↓     ↓        ↓
database cache  logger
  ↓      ↓       ↓
  └──────┴───────┘
         ↓
    userService
`)

// =============================================================================
// Solution 3: CONTROLLED SHARING
// =============================================================================

console.log("--- Controlled Sharing ---")
const db1 = container.get(database)
const db2 = container.get(database)
console.log("Same Database instance?", db1 === db2) // true - singleton!

// Want fresh instances? Use transient:
let counter = 0

/** @type {Types.Factory<{id: number}>} */
const transientFactory = transient(factory("Counter", () => ({ id: ++counter })))

const c = createContainer()
console.log("Transient 1:", c.get(transientFactory).id) // 1
console.log("Transient 2:", c.get(transientFactory).id) // 2
console.log("Transient 3:", c.get(transientFactory).id) // 3

// =============================================================================
// Solution 4: CENTRALIZED CONFIGURATION
// =============================================================================

console.log(`
--- Centralized Configuration ---
Config is ONE factory. Everything gets it injected.
Change config in one place → affects everywhere.
No more process.env scattered throughout constructors.
`)

// =============================================================================
// Solution 5: MANAGED LIFECYCLE
// =============================================================================

console.log("--- Managed Lifecycle ---")
console.log("Disposing container (cleanup in reverse order)...")
await container.dispose()

console.log(`
SUMMARY OF SOLUTIONS:

1. TESTING IS EASY
   Just create factories that return mocks.
   No jest.mock(). No environment hacks.

2. VISIBLE DEPENDENCIES
   Look at factory definitions to see the dependency graph.
   No hidden "new X()" calls inside constructors.

3. CONTROLLED SHARING
   Singletons by default. Use transient() for fresh instances.
   You control exactly what's shared.

4. CENTRALIZED CONFIGURATION
   One config factory. Inject it everywhere.
   Single source of truth.

5. MANAGED LIFECYCLE
   onDispose() registers cleanup.
   container.dispose() closes everything in reverse order.
`)
