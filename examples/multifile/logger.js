// =============================================================================
// Logger Module
// =============================================================================
// Depends on: config

/** @import { Factory } from 'no-decoration' */
/** @import { Config } from './config.js' */

import { config } from "./config.js"

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

/** @type {Factory<Logger>} */
export const logger = (c) => new Logger(c.get(config))
