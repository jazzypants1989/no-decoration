// =============================================================================
// Multi-File Example
// =============================================================================
// Run with: node examples/multifile/index.js
//
// This example demonstrates that factories work seamlessly across files.
// Each module exports its own factory, and dependencies are resolved
// automatically when you call container.get().
//
// File structure:
//   config.js      → Config (no dependencies)
//   logger.js      → Logger (depends on config)
//   database.js    → Database (depends on config, logger) - async!
//   user-service.js → UserService (depends on database, logger)
//   index.js       → App entry point (this file)
// =============================================================================

import { createContainer } from "no-decoration"

// Just import the factories you need at the entry point
import { userService } from "./user-service.js"
import { database } from "./database.js"
import { logger } from "./logger.js"

async function main() {
  const container = createContainer()

  console.log("=== Multi-File DI Example ===\n")

  // The container resolves the entire dependency tree:
  // userService needs database + logger
  // database needs config + logger (async!)
  // logger needs config
  // config has no dependencies

  console.log("1. Getting UserService (resolves entire tree)...")
  const users = await container.get(userService)

  console.log("\n2. Calling userService.findAll()...")
  const allUsers = await users.findAll()
  console.log("   Result:", allUsers)

  console.log("\n3. Getting logger (already cached)...")
  const log = container.get(logger)
  log.log("This logger instance is the same one UserService uses!")

  console.log("\n4. Getting database (already cached)...")
  const db = await container.get(database)
  console.log("   Same instance?", db === users.db)

  console.log("\n5. Disposing container (closes database)...")
  await container.dispose()

  console.log("\n=== Done ===")
}

main().catch(console.error)
