# HTTP Framework Integration

This guide shows how to integrate no-decoration with HTTP frameworks. The pattern is the same for all frameworks:

1. **Pre-resolve singletons at startup** (database connections, etc.)
2. **Create a child container per request** (request scoping)
3. **Dispose the child container when done** (cleanup)

## The Core Pattern

```javascript
import { createContainer, childContainer } from 'no-decoration'

// 1. Create and warm up the app container
const app = createContainer()
await app.warmup([database, cache, userService])  // Pre-resolve singletons!

// 2. For each request: create a child container
function handleRequest(req, res) {
  const scope = childContainer(app)

  try {
    // Resolve request-scoped services from the child
    const handler = scope.get(requestHandler)
    // ... handle request
  } finally {
    // 3. Clean up when done
    scope.dispose()
  }
}
```

**Why `warmup()`?** Child containers inherit their parent's cache. If a singleton isn't resolved in the parent, each child creates its own instance. `warmup()` ensures all children share the same database connection, logger, etc.

## Node.js HTTP (No Dependencies)

See [`examples/multifile/`](../examples/multifile/) for a complete example.

```javascript
import { createServer } from 'node:http'
import { createContainer, childContainer } from 'no-decoration'

const app = createContainer()
await app.warmup([database, userService])

const server = createServer(async (req, res) => {
  const scope = childContainer(app)

  try {
    const ctx = scope.get(requestContext(req))
    const handler = scope.get(router)
    await handler.handle(req, res)
  } finally {
    await scope.dispose()
  }
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  server.close()
  await app.dispose()  // Closes database, etc.
})
```

## Express

```javascript
import express from 'express'
import { createContainer, childContainer } from 'no-decoration'

const app = createContainer()
await app.warmup([database, userService])

const server = express()

// Middleware: create child container per request
server.use((req, res, next) => {
  req.scope = childContainer(app)
  res.on('finish', () => req.scope.dispose())
  next()
})

// Routes can access the scoped container
server.get('/users', async (req, res) => {
  const users = await req.scope.get(userService)
  res.json(await users.findAll())
})
```

## Hono

```javascript
import { Hono } from 'hono'
import { createContainer, childContainer } from 'no-decoration'

const app = createContainer()
await app.warmup([database, userService])

const server = new Hono()

// Middleware: create child container per request
server.use(async (c, next) => {
  const scope = childContainer(app)
  c.set('scope', scope)
  await next()
  await scope.dispose()
})

// Routes access the scoped container via context
server.get('/users', async (c) => {
  const scope = c.get('scope')
  const users = await scope.get(userService)
  return c.json(await users.findAll())
})
```

## Fastify

```javascript
import Fastify from 'fastify'
import { createContainer, childContainer } from 'no-decoration'

const app = createContainer()
await app.warmup([database, userService])

const server = Fastify()

// Decorate request with scoped container
server.decorateRequest('scope', null)

server.addHook('onRequest', async (request) => {
  request.scope = childContainer(app)
})

server.addHook('onResponse', async (request) => {
  await request.scope.dispose()
})

server.get('/users', async (request, reply) => {
  const users = await request.scope.get(userService)
  return users.findAll()
})
```

## Request-Scoped Factories

Use `scoped()` to create factories that take request-specific arguments:

```javascript
import { scoped } from 'no-decoration'

class RequestContext {
  constructor(requestId, userId, method, url) {
    this.requestId = requestId
    this.userId = userId
    this.method = method
    this.url = url
  }
}

// scoped() returns a function that creates a factory
export const requestContext = scoped(
  (container, requestId, userId, method, url) =>
    new RequestContext(requestId, userId, method, url)
)

// Usage in request handler:
const ctx = scope.get(requestContext(
  crypto.randomUUID(),
  req.user?.id,
  req.method,
  req.url
))
```

## Health Checks

Use the health plugin for production health endpoints:

```javascript
import { createContainer } from 'no-decoration'
import { health } from 'no-decoration/plugins'

const app = createContainer().with(health)

// Register health checks
app.onHealthCheck('database', async () => {
  const db = app.get(database)
  if (!db.connected) throw new Error('Database not connected')
})

app.onHealthCheck('redis', async () => {
  const cache = app.get(cache)
  await cache.ping()
})

// In your routes:
server.get('/health', async (req, res) => {
  const result = await app.checkHealth()
  res.status(result.healthy ? 200 : 503)
  res.json({
    status: result.healthy ? 'healthy' : 'unhealthy',
    checks: Object.fromEntries(result.checks)
  })
})
```

## Graceful Shutdown

Always dispose the container on shutdown to clean up resources:

```javascript
const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down...`)

  // Stop accepting new connections
  server.close()

  // Wait for in-flight requests (framework-specific)
  // ...

  // Dispose container (runs all onDispose handlers)
  await app.dispose()

  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
```

## Common Patterns

### Authentication Middleware

```javascript
// Auth service that depends on database
const authService = factory('AuthService', (c) =>
  new AuthService(c.get(database))
)

// Middleware that adds user to request context
server.use(async (req, res, next) => {
  const auth = req.scope.get(authService)
  const token = req.headers.authorization?.split(' ')[1]

  if (token) {
    req.user = await auth.verifyToken(token)
  }

  next()
})
```

### Request-Scoped Logger

```javascript
const requestLogger = factory('RequestLogger', (c) => {
  const ctx = c.get(requestContext)  // Request-scoped
  const baseLogger = c.get(logger)   // Singleton

  return {
    log: (msg) => baseLogger.log(`[${ctx.requestId}] ${msg}`),
    error: (msg) => baseLogger.error(`[${ctx.requestId}] ${msg}`)
  }
})

// Every service in this request gets the same request-aware logger
```

### Transactional Scope

```javascript
const transaction = factory('Transaction', async (c) => {
  const db = await c.get(database)
  const tx = await db.beginTransaction()

  c.onDispose(async () => {
    // If not committed, rollback
    if (!tx.committed) await tx.rollback()
  })

  return tx
})

// In request handler:
const scope = childContainer(app)
try {
  const tx = await scope.get(transaction)
  const users = await scope.get(userService)  // Uses the transaction
  await users.create({ name: 'Alice' })
  await tx.commit()
} finally {
  await scope.dispose()  // Rolls back if not committed
}
```

## See Also

- [examples/multifile/](../examples/multifile/) - Complete HTTP server example
- [gotchas.md](./gotchas.md) - Common pitfalls, including "Child Container Singleton Confusion"
- [features.md](./features.md) - All container features including disposal and child containers
