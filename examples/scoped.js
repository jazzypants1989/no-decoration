// =============================================================================
// Example: Per-Request Scoping (JavaScript)
// =============================================================================
// Run with: node examples/scoped.js
// =============================================================================
// This shows how to use child containers for per-request isolation.
// Common use case: HTTP servers where each request needs its own context
// but should share app-wide singletons (database, logger, etc.)
// =============================================================================
// @ts-check

import { createContainer, childContainer } from "no-decoration"

/** @import { Factory } from 'no-decoration' */

// =============================================================================
// App-wide services (singletons, shared across all requests)
// =============================================================================

class Config {
  env = process.env.NODE_ENV || "development"
}

class Logger {
  /** @param {Config} config */
  constructor(config) {
    this.config = config
    console.log("Logger created (this should only print once)")
  }

  /** @param {string} message */
  log(message) {
    console.log(`[${this.config.env}] ${message}`)
  }
}

// =============================================================================
// Per-request services (fresh instance for each request)
// =============================================================================

class RequestContext {
  /**
   * @param {string} requestId
   * @param {string | null} userId
   */
  constructor(requestId, userId) {
    this.requestId = requestId
    this.userId = userId
  }
}

class RequestHandler {
  /**
   * @param {Logger} logger
   * @param {RequestContext} ctx
   */
  constructor(logger, ctx) {
    this.logger = logger
    this.ctx = ctx
  }

  handle() {
    this.logger.log(
      `[${this.ctx.requestId}] Handling request for user: ${this.ctx.userId}`
    )
    return { ok: true, requestId: this.ctx.requestId }
  }
}

// =============================================================================
// Factories
// =============================================================================

/** @type {Factory<Config>} */
const config = () => new Config()

/** @type {Factory<Logger>} */
const logger = (c) => new Logger(c.get(config))

// Per-request factories are functions that RETURN factories.
// This lets you pass request-specific data (requestId, userId, etc.)

/**
 * @param {string} requestId
 * @param {string | null} userId
 * @returns {Factory<RequestContext>}
 */
const requestContext = (requestId, userId) => () =>
  new RequestContext(requestId, userId)

/**
 * @param {Factory<RequestContext>} ctxFactory
 * @returns {Factory<RequestHandler>}
 */
const requestHandler = (ctxFactory) => (c) =>
  new RequestHandler(
    app.get(logger), // ← Get logger from app container (singleton)
    c.get(ctxFactory) // ← Get context from request container (per-request)
  )

// =============================================================================
// Simulated HTTP Server
// =============================================================================

// Global container holds app-wide singletons
const app = createContainer()

// Warm up singletons (optional - they're lazy by default)
app.get(logger)

/**
 * @param {{ 'x-request-id'?: string, 'x-user-id'?: string }} headers
 */
function handleHttpRequest(headers) {
  const id = headers["x-request-id"] || crypto.randomUUID().slice(0, 8)
  const user = headers["x-user-id"] || "anonymous"

  // Each request gets its own child container
  // This ensures RequestContext is fresh per request
  // But Logger is shared (singleton from app container, resolved via factory)
  const requestScope = childContainer(app)

  // Create request-specific factories
  const ctxFactory = requestContext(id, user)
  const handlerFactory = requestHandler(ctxFactory)

  // Resolve and handle
  const handler = requestScope.get(handlerFactory)
  return handler.handle()
}

// =============================================================================
// Simulate some requests
// =============================================================================

console.log("\n--- Request 1 ---")
handleHttpRequest({ "x-user-id": "alice" })

console.log("\n--- Request 2 ---")
handleHttpRequest({ "x-user-id": "bob" })

console.log("\n--- Request 3 ---")
handleHttpRequest({}) // anonymous user
