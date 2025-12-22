# Plugins

Plugins extend the container with additional functionality. This library provides a rich set of built-in plugins for common needs.

## Available Plugins

### Core Plugins

| Plugin | Purpose | Import |
|--------|---------|--------|
| [health](./plugins/health.md) | Health checks for monitoring | `health` |
| [observability](./plugins/observability.md) | Events, validation, dependency graphs | `observability` |
| [testing](./plugins/testing.md) | Mocking, snapshots, test isolation | `testing` |
| [debug](./plugins/debug.md) | Development logging and warnings | `debug` |
| [batch](./plugins/batch.md) | Define multiple factories at once | `batch` |
| [discovery](./plugins/discovery.md) | Scan codebase for factories | `discovery` |

### Resilience Plugins

| Plugin | Purpose | Import |
|--------|---------|--------|
| [circuit-breaker](./plugins/circuit-breaker.md) | Fail fast when dependencies are down | `circuitBreaker`, `circuitBreakerPlugin` |
| [cache](./plugins/cache.md) | TTL-based caching strategies | `ttlCache`, `slidingCache`, `refreshAhead`, `keyedCache` |

### Observability Plugins

| Plugin | Purpose | Import |
|--------|---------|--------|
| [metrics](./plugins/metrics.md) | Prometheus-style counters and histograms | `metrics` |
| [tracing](./plugins/tracing.md) | OpenTelemetry-style distributed tracing | `tracing` |

### Presets

| Preset | Includes | Import |
|--------|----------|--------|
| [production](./plugins/presets.md) | health + observability + metrics | `production` |
| [development](./plugins/presets.md) | health + observability + testing + debug | `development` |
| [testOnly](./plugins/presets.md) | testing | `testOnly` |

## Quick Start

```ts
import { createContainer } from 'no-decoration'
import { health, metrics, tracing } from 'no-decoration/plugins'

const container = createContainer()
  .with(health)
  .with(metrics())
  .with(tracing())

// Container now has all plugin methods
container.checkHealth()      // from health
container.toPrometheus()     // from metrics
container.getCompletedSpans() // from tracing
```

## Composing Plugins

Use `pipe()` to combine plugins into a single unit:

```ts
import { pipe } from 'no-decoration'
import { health, observability, metrics, tracing } from 'no-decoration/plugins'

export const production = pipe(
  health,
  observability,
  metrics({ prefix: 'myapp' }),
  tracing({ serviceName: 'myapp' })
)

const container = createContainer().with(production)
```

---

# Writing Plugins

Plugins are simple objects that add methods to the container.

## The Plugin Interface

```ts
interface Plugin<T extends object = object> {
  name: string
  apply(container: Container, internals: ContainerInternals): T
}
```

- `name`: Identifier for debugging and composition
- `apply`: Called when `.with(plugin)` is invoked
- Returns an object whose methods are added to the container

## Simple Plugin Example

```ts
import { definePlugin } from 'no-decoration'

export const timing = definePlugin('timing', (container, internals) => {
  const timings = new Map()

  // Hook into resolution
  internals.hooks.afterResolve.push((factory, value, ms) => {
    timings.set(factory.displayName || 'anonymous', ms)
  })

  // Return methods to add to container
  return {
    getTimings() {
      return new Map(timings)
    }
  }
})

// Usage
const container = createContainer().with(timing)
container.get(someFactory)
console.log(container.getTimings())
```

## ContainerInternals Structure

Plugins receive access to container internals:

```ts
interface ContainerInternals {
  // The resolution cache (factory -> resolved value)
  cache: Map<Factory<unknown>, unknown>

  // Override mappings (original factory -> replacement)
  overrides: Map<Factory<unknown>, Factory<unknown>>

  // Lifecycle hooks
  hooks: {
    beforeResolve: Array<(factory: Factory<unknown>) => void>
    afterResolve: Array<(factory: Factory<unknown>, value: unknown, ms: number) => void>
    onDispose: Array<(factory: Factory<unknown>) => void>
    onOverride: Array<(original: Factory<unknown>, replacement: Factory<unknown>) => void>
  }

  // Current resolution stack (for tracking dependency depth)
  resolutionStack: Factory<unknown>[]
}
```

## Hook Use Cases

### beforeResolve

Called before a factory starts resolving.

```ts
internals.hooks.beforeResolve.push((factory) => {
  console.log(`About to resolve: ${factory.displayName}`)
})
```

**Use cases:** Logging, tracking dependency relationships, permission checks

### afterResolve

Called after a factory completes resolution.

```ts
internals.hooks.afterResolve.push((factory, value, ms) => {
  if (ms > 100) {
    console.warn(`Slow resolution: ${factory.displayName} took ${ms}ms`)
  }
})
```

**Use cases:** Timing/performance monitoring, cache analytics, dependency graph construction

### onDispose

Called when the container is disposed.

```ts
internals.hooks.onDispose.push((factory) => {
  console.log(`Disposed: ${factory.displayName}`)
})
```

**Use cases:** Cleanup tracking, resource management logging

### onOverride

Called when `override()` is used.

```ts
internals.hooks.onOverride.push((original, replacement) => {
  console.log(`Overriding ${original.displayName} with ${replacement.displayName}`)
})
```

**Use cases:** Test setup logging, override validation

## Plugins with Configuration

For plugins that need options, return a function:

```ts
export function rateLimit(options = {}) {
  const maxPerSecond = options.maxPerSecond ?? 100

  return {
    name: 'rateLimit',
    apply(container, internals) {
      let count = 0
      let lastReset = Date.now()

      internals.hooks.beforeResolve.push(() => {
        const now = Date.now()
        if (now - lastReset > 1000) {
          count = 0
          lastReset = now
        }
        if (++count > maxPerSecond) {
          throw new Error('Rate limit exceeded')
        }
      })

      return {}
    }
  }
}

// Usage
container.with(rateLimit())                      // Defaults
container.with(rateLimit({ maxPerSecond: 50 })) // Custom
```

## Plugins vs Decorators

| Use Plugins When | Use Decorators When |
|------------------|---------------------|
| You need access to internals (cache, hooks) | You're wrapping a single factory |
| You're adding container-wide behavior | The logic is per-factory |
| You need to track resolution across factories | You want to compose with `pipe()` |

### Decorator Example (not a plugin)

```ts
import { pipe, factory } from 'no-decoration'
import { retry, circuitBreaker } from 'no-decoration/plugins'

// Decorators wrap individual factories
const reliableDb = pipe(
  factory('Database', () => connectToDb()),
  retry(3, 1000),
  circuitBreaker('db', { failureThreshold: 5 })
)
```

See the [cache](./plugins/cache.md) and [circuit-breaker](./plugins/circuit-breaker.md) plugins for decorator examples.

## TypeScript Support

For full type safety, create a `.d.ts` file for your plugin:

```ts
// my-plugin.d.ts
import type { Plugin } from 'no-decoration'

export interface MyPluginMethods {
  myMethod(): void
  anotherMethod(arg: string): number
}

export declare function myPlugin(options?: MyPluginOptions): Plugin<MyPluginMethods>
```

See the built-in plugins in `lib/plugins/` for examples.
