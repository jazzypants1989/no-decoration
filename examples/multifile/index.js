// =============================================================================
// HTTP Server Example
// =============================================================================
// Run with: node examples/multifile/index.js
// Test with: curl http://localhost:3000/users
//            curl http://localhost:3000/health
//
// This example demonstrates a real HTTP server using DI:
//   1. Pre-resolving singletons at startup
//   2. Creating a child container per request (request scoping)
//   3. Graceful shutdown with proper cleanup
//   4. Health checks
//
// File structure:
//   config.js         → Config (no dependencies)
//   logger.js         → Logger (depends on config)
//   database.js       → Database (depends on config, logger) - async!
//   user-service.js   → UserService (depends on database, logger)
//   request-context.js → RequestContext (created per-request)
//   index.js          → HTTP server entry point (this file)
// =============================================================================

import { createServer } from "node:http"
import { createContainer, childContainer } from "no-decoration"
import { health } from "no-decoration/plugins"

import { config, Config } from "./config.js"
import { logger } from "./logger.js"
import { database } from "./database.js"
import { userService } from "./user-service.js"
import { requestContext } from "./request-context.js"

// =============================================================================
// BOOTSTRAP
// =============================================================================

async function bootstrap() {
  const app = createContainer().with(health)

  // Get config and logger first for startup logging
  const cfg = app.get(config)
  const log = app.get(logger)

  log.log("Starting server...")

  // Pre-resolve singletons so child containers share the same instances
  await app.warmup([database, userService])

  log.log("Singletons warmed up")

  // Register health checks
  const db = await app.get(database)  // Already cached, just getting reference
  app.onHealthCheck("database", async () => {
    if (!db.connected) throw new Error("Database not connected")
  })

  return { app, cfg, log }
}

// =============================================================================
// REQUEST HANDLER
// =============================================================================

/**
 * @param {import("no-decoration").Container & { onHealthCheck: Function, checkHealth: Function }} app
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleRequest(app, req, res) {
  const log = app.get(logger)
  const requestId = crypto.randomUUID().slice(0, 8)

  // Create a child container for this request
  // It inherits app singletons but has its own cache for request-scoped factories
  const scope = childContainer(app)

  try {
    // Register request context (scoped to this request)
    const ctx = scope.get(requestContext(requestId, req.method || "GET", req.url || "/"))
    log.log(`[${ctx.requestId}] ${ctx.method} ${ctx.url}`)

    // Route handling
    const url = new URL(req.url || "/", `http://localhost`)

    if (url.pathname === "/health") {
      const result = await app.checkHealth()
      res.writeHead(result.healthy ? 200 : 503, { "Content-Type": "application/json" })
      res.end(JSON.stringify({
        status: result.healthy ? "healthy" : "unhealthy",
        checks: Object.fromEntries(
          Array.from(result.checks.entries()).map(([name, check]) => [
            name,
            { healthy: check.healthy, ms: check.ms.toFixed(2) }
          ])
        )
      }, null, 2))
      return
    }

    if (url.pathname === "/users") {
      const users = await scope.get(userService)
      const data = users.findAll()
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(data, null, 2))
      log.log(`[${ctx.requestId}] Completed in ${ctx.elapsed}ms`)
      return
    }

    if (url.pathname === "/users/" && url.pathname.length > 7) {
      const id = parseInt(url.pathname.slice(7), 10)
      const users = await scope.get(userService)
      const user = users.findById(id)
      if (user) {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(user, null, 2))
      } else {
        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "User not found" }))
      }
      log.log(`[${ctx.requestId}] Completed in ${ctx.elapsed}ms`)
      return
    }

    // 404 for unknown routes
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Not found" }))

  } catch (error) {
    log.log(`[${requestId}] Error: ${error instanceof Error ? error.message : error}`)
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Internal server error" }))
  } finally {
    // Clean up request-scoped resources
    await scope.dispose()
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const { app, cfg, log } = await bootstrap()

  const server = createServer((req, res) => {
    handleRequest(app, req, res).catch((err) => {
      console.error("Unhandled error:", err)
      if (!res.headersSent) {
        res.writeHead(500)
        res.end("Internal server error")
      }
    })
  })

  // Start listening
  server.listen(cfg.port, () => {
    log.log(`Server listening on http://localhost:${cfg.port}`)
    log.log("Try:")
    log.log(`  curl http://localhost:${cfg.port}/users`)
    log.log(`  curl http://localhost:${cfg.port}/health`)
    log.log("Press Ctrl+C to stop")
  })

  // Graceful shutdown
  /** @param {string} signal */
  const shutdown = async (signal) => {
    log.log(`\nReceived ${signal}, shutting down gracefully...`)

    // Stop accepting new connections
    server.close()

    // Dispose container (closes database, etc.)
    await app.dispose()

    log.log("Shutdown complete")
    process.exit(0)
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch((err) => {
  console.error("Failed to start:", err)
  process.exit(1)
})
