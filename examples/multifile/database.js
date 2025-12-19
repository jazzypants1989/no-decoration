// =============================================================================
// Database Module
// =============================================================================
// Depends on: config, logger
// Demonstrates: async factory, disposal

/** @import { Logger } from './logger.js' */

import { config } from "./config.js"
import { logger } from "./logger.js"

export class Database {
  /**
   * @param {string} url
   * @param {Logger} logger
   */
  constructor(url, logger) {
    this.url = url
    this.logger = logger
    this.connected = true
  }

  /**
   * @param {string} url
   * @param {Logger} logger
   */
  static async connect(url, logger) {
    // Simulate connection delay
    await new Promise((r) => setTimeout(r, 50))
    logger.log(`Database connected to ${url}`)
    return new Database(url, logger)
  }

  async close() {
    this.connected = false
    this.logger.log("Database connection closed")
  }

  /** @param {string} sql */
  query(sql) {
    if (!this.connected) throw new Error("Database not connected")
    this.logger.debug(`Executing: ${sql}`)
    return [{ id: 1, name: "Alice" }]
  }
}

/** @type {import('no-decoration').Factory<Promise<Database>>} */
export const database = async (c) => {
  const cfg = c.get(config)
  const log = c.get(logger)

  const db = await Database.connect(cfg.dbUrl, log)
  c.onDispose(() => db.close())
  return db
}
