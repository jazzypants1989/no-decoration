// =============================================================================
// UserService Module
// =============================================================================
// Depends on: database, logger
// Demonstrates: async factory with async dependencies
// @ts-check

/** @import { Database } from './database.js' */
/** @import { Logger } from './logger.js' */

import { database } from "./database.js"
import { logger } from "./logger.js"

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

// The JSDoc @import isn't playing nice with async/await for some reason...
/** @type {import('no-decoration').Factory<Promise<UserService>>} */
export const userService = async (c) => {
  const db = await c.get(database) // database is async
  const log = c.get(logger) // logger is sync
  return new UserService(db, log)
}
