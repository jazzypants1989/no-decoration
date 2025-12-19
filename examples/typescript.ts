// =============================================================================
// Example: TypeScript Version
// =============================================================================
// Run with: npx tsx examples/typescript.ts
// =============================================================================
//
// 💡 IDE Tips - Notice how types flow through without any extra annotations:
//    • Hover over `userService` on line 53 → Factory<UserService> (inferred!)
//    • Hover over `service` on line 74 → UserService
//    • Cmd/Ctrl+Click on `inject` → jumps to definition in container.js
//    • Try: container.get(logger).findAll() → error: findAll doesn't exist on Logger
//
// The same container.js works for both JS and TS with full type inference.
//
// =============================================================================

import {
  createContainer,
  childContainer,
  inject,
  type Factory,
} from "no-decoration"

// =============================================================================
// Services (plain classes)
// =============================================================================

class Config {
  readonly env = process.env.NODE_ENV || "development"
}

class Logger {
  constructor(private config: Config) {}

  log(message: string) {
    console.log(`[${this.config.env}] ${message}`)
  }
}

class UserService {
  constructor(private logger: Logger) {}

  findAll() {
    this.logger.log("Finding all users")
    return [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]
  }
}

// =============================================================================
// Factories - Two equivalent styles shown
// =============================================================================

// Style 1: Explicit factories (more flexible, can add logic)
const config: Factory<Config> = () => new Config()
const logger: Factory<Logger> = (c) => new Logger(c.get(config))

// Style 2: Using inject() helper (shorter, less flexible)
const userService = inject(UserService, logger)

// Both styles work identically. Use whichever you prefer.
// The explicit style lets you do things like:
//
//   const logger: Factory<Logger> = (c) => {
//     const cfg = c.get(config)
//     return cfg.env === 'test' ? new MockLogger() : new Logger(cfg)
//   }

// =============================================================================
// Per-request scoping with childContainer
// =============================================================================

class RequestContext {
  constructor(public requestId: string, public userId: string | null) {}
}

class RequestHandler {
  constructor(private logger: Logger, private ctx: RequestContext) {}

  handle() {
    this.logger.log(
      `[${this.ctx.requestId}] Handling request for ${this.ctx.userId}`
    )
    return { ok: true }
  }
}

// =============================================================================
// Usage
// =============================================================================

// App-wide container (singletons)
const app = createContainer()

// Get singleton service
const service = app.get(userService)
console.log("Users:", service.findAll())

// Per-request handling
function handleRequest(userId: string | null) {
  const requestId = crypto.randomUUID().slice(0, 8)

  // Child container for request scope
  const request = childContainer(app)

  // Request-specific factories
  const ctx: Factory<RequestContext> = () =>
    new RequestContext(requestId, userId)
  const handler = inject(RequestHandler, logger, ctx)

  return request.get(handler).handle()
}

console.log("\n--- Requests ---")
handleRequest("alice")
handleRequest("bob")
