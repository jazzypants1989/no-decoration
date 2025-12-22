# Debug Plugin

Development logging and warnings for debugging.

## Import

```ts
import { debug } from 'no-decoration/plugins'
```

## Setup

```ts
import { createContainer } from 'no-decoration'
import { debug } from 'no-decoration/plugins'

// Basic usage (all options enabled)
const container = createContainer().with(debug)

// With custom options
const container = createContainer().with(debug.configure({
  timing: true,
  warnings: true,
  logger: console
}))
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timing` | `boolean` | `true` | Log resolution timing |
| `warnings` | `boolean` | `true` | Warn about potential issues |
| `logger` | `object` | `console` | Custom logger with `log` and `warn` methods |

## What Gets Logged

### Resolution Events

```
[DI] Resolving: Database
[DI] Resolved: Database (5.23ms)
[DI] Resolving: UserService
[DI]   Resolving: Database (cached)
[DI] Resolved: UserService (12.45ms)
```

### Warnings

```
[DI] Warning: Slow factory "ExternalAPI" took 523ms
[DI] Warning: Override applied to "Database"
```

### Disposal

```
[DI] Disposed: Database
[DI] Disposed: CacheConnection
```

## Usage Patterns

### Development Only

```ts
const plugins = process.env.NODE_ENV === 'development'
  ? [debug]
  : []

const container = createContainer()
for (const plugin of plugins) {
  container.with(plugin)
}
```

### Custom Logger

```ts
import pino from 'pino'

const logger = pino({ level: 'debug' })

const container = createContainer().with(debug.configure({
  logger: {
    log: (msg) => logger.debug(msg),
    warn: (msg) => logger.warn(msg)
  }
}))
```

### Disable Timing

```ts
// Just show resolution flow, not timing
const container = createContainer().with(debug.configure({
  timing: false
}))
```

### Capture Logs for Testing

```ts
const logs = []
const testLogger = {
  log: (msg) => logs.push({ level: 'log', msg }),
  warn: (msg) => logs.push({ level: 'warn', msg })
}

const container = createContainer().with(debug.configure({
  logger: testLogger
}))

container.get(someFactory)

expect(logs).toContainEqual({
  level: 'log',
  msg: expect.stringContaining('Resolved: SomeFactory')
})
```

## When to Use

| Scenario | Recommendation |
|----------|----------------|
| Development | Enable with defaults |
| Production | Disable entirely |
| Debugging specific issues | Enable with custom logger |
| Performance profiling | Use [metrics](./metrics.md) instead |

## See Also

- [observability](./observability.md) - More powerful event subscriptions
- [metrics](./metrics.md) - Production-ready monitoring
- [tracing](./tracing.md) - Distributed tracing
