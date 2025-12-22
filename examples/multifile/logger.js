// =============================================================================
// Logger Module
// =============================================================================
// Depends on: config

import { factory } from "no-decoration"
import { config, Config } from "./config.js"

export class Logger {
  /** @param {Config} config */
  constructor(config) {
    this.config = config
  }

  /** @param {string} message */
  log(message) {
    console.log(`[${this.config.env}] ${message}`)
  }

  /** @param {string} message */
  debug(message) {
    if (this.config.logLevel === "debug") {
      console.log(`[DEBUG] ${message}`)
    }
  }
}

export const logger = factory("Logger", (c) => new Logger(c.get(config)))
