// =============================================================================
// Config Module
// =============================================================================
// This factory has no dependencies - it's a "root" of the dependency graph.

import { factory } from "no-decoration"

export class Config {
  env = process.env.NODE_ENV || "development"
  port = parseInt(process.env.PORT || "3000", 10)
  dbUrl = "postgres://localhost:5432/mydb"
  logLevel = "info"
}

export const config = factory("Config", () => new Config())
