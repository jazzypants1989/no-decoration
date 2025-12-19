// =============================================================================
// Example: Advanced Features
// =============================================================================
// Run with: node examples/advanced.js
// =============================================================================
// This demonstrates:
//   - Async factories
//   - Disposal/cleanup
//   - Circular dependency detection
// =============================================================================

import { createContainer } from "no-decoration"

/** @import { Factory } from 'no-decoration' */

// =============================================================================
// Async Factories
// =============================================================================

class Config {
  constructor() {
    this.dbUrl = process.env.DATABASE_URL || "postgres://localhost:5432/mydb"
  }
}

// Simulated async database connection
class Database {
  /** @param {string} url */
  constructor(url) {
    this.url = url
    this.connected = true
  }

  /** @param {string} url */
  static async connect(url) {
    // Simulate connection delay
    await new Promise((r) => setTimeout(r, 100))
    console.log(`Connected to ${url}`)
    return new Database(url)
  }

  async close() {
    await new Promise((r) => setTimeout(r, 50))
    this.connected = false
    console.log("Database connection closed")
  }

  query() {
    if (!this.connected) throw new Error("Database not connected")
    return [{ id: 1, name: "Alice" }]
  }
}

/** @type {Factory<Config>} */
const config = () => new Config()

/** @type {Factory<Promise<Database>>} */
const database = (c) => {
  const cfg = c.get(config)
  return Database.connect(cfg.dbUrl).then((db) => {
    // Register cleanup - will be called on container.dispose()
    c.onDispose(() => db.close())
    return db
  })
}

// =============================================================================
// Circular Dependency Detection
// =============================================================================

// Uncomment these to see the circular dependency error:
//
// const a = (c) => ({ name: "A", b: c.get(b) })
// const b = (c) => ({ name: "B", a: c.get(a) })
//
// container.get(a)
// → Error: Circular dependency detected: a -> b -> a

// =============================================================================
// Usage
// =============================================================================

async function main() {
  const container = createContainer()

  // Async factory - just await it
  const db = await container.get(database)
  console.log("Query result:", db.query())

  // Cleanup everything
  await container.dispose()
  console.log("Container disposed")

  // Trying to query now would throw
  try {
    db.query()
  } catch (e) {
    console.log("Expected error:", /** @type {Error} */ (e).message)
  }
}

main()
