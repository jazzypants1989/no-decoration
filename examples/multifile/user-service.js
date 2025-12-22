// =============================================================================
// UserService Module
// =============================================================================
// Depends on: database, logger
// Demonstrates: async factory with async dependencies

import { factory } from "no-decoration"
import { database, Database } from "./database.js"
import { logger, Logger } from "./logger.js"

export class UserService {
  /**
   * @param {Database} db
   * @param {Logger} logger
   */
  constructor(db, logger) {
    this.db = db
    this.logger = logger
  }

  findAll() {
    this.logger.log("Finding all users")
    return this.db.query("SELECT * FROM users")
  }

  /** @param {number} id */
  findById(id) {
    this.logger.log(`Finding user ${id}`)
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`)[0]
  }
}

export const userService = factory("UserService", async (c) => {
  const db = await c.get(database) // database is async
  const log = c.get(logger) // logger is sync
  return new UserService(db, log)
})
