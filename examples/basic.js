// =============================================================================
// Example: Basic Dependency Injection (JavaScript)
// =============================================================================
// Run with: node examples/basic.js
// =============================================================================
//
// 💡 IDE Tips - Try these to see type inference in action:
//    • Hover over `logger` on line 54 → shows Factory<Logger>
//    • Hover over `service` on line 65 → shows UserService
//    • Hover over `c.get(config)` on line 54 → shows Config
//    • Try changing line 54 to: (c) => new Logger("wrong") → type error!
//    • Try changing line 65 to: container.get(config).log("hi") → type error!
//
// =============================================================================

import { createContainer } from "no-decoration"

/** @import { Factory } from 'no-decoration' */

// =============================================================================
// Step 1: Define your classes (plain classes, no decorators needed)
// =============================================================================

class Config {
  constructor() {
    this.env = process.env.NODE_ENV || "development"
    this.port = 3000
  }
}

class Logger {
  /** @param {Config} config */
  constructor(config) {
    this.config = config
  }

  /** @param {string} message */
  log(message) {
    console.log(`[${this.config.env}] ${message}`)
  }
}

class UserService {
  /** @param {Logger} logger */
  constructor(logger) {
    this.logger = logger
  }

  /** @param {string} name */
  createUser(name) {
    this.logger.log(`Creating user: ${name}`)
    return { id: crypto.randomUUID(), name }
  }
}

// =============================================================================
// Step 2: Define factories (one line per service)
//
// A factory is just a function: (container) => instance
// The container caches results, so each factory only runs once (singleton).
// =============================================================================

/** @type {Factory<Config>} */
const config = () => new Config()

/** @type {Factory<Logger>} */
const logger = (c) => new Logger(c.get(config))
//                    ↑ Dependencies are explicit: "Logger needs Config"

/** @type {Factory<UserService>} */
const userService = (c) => new UserService(c.get(logger))
//                         ↑ "UserService needs Logger" (which needs Config)

// =============================================================================
// Step 3: Use the container
// =============================================================================

const container = createContainer()

// Get services - dependencies are resolved automatically
const service = container.get(userService)
service.createUser("Alice")
service.createUser("Bob")

// Same instance every time (singleton)
const service2 = container.get(userService)
console.log(`Same instance? ${service === service2}`) // true
