// =============================================================================
// Config Module
// =============================================================================
// This factory has no dependencies - it's a "root" of the dependency graph.

/** @import { Factory } from 'no-decoration' */

export class Config {
  env = process.env.NODE_ENV || "development"
  dbUrl = "postgres://localhost:5432/mydb"
  logLevel = "info"
}

/** @type {Factory<Config>} */
export const config = () => new Config()
