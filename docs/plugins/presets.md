# Presets

Pre-configured plugin combinations for common use cases.

## Import

```ts
import { production, development, testOnly } from 'no-decoration/presets'
```

## Available Presets

### production

Health checks, observability, and metrics for production deployments.

```ts
import { createContainer } from 'no-decoration'
import { production } from 'no-decoration/presets'

const container = createContainer().with(production)

// Health checks
container.onHealthCheck('db', () => db.ping())
container.checkHealth()

// Observability
container.on('resolve', handler)
container.validate(factories)
container.getDependencyGraph()

// Metrics (Prometheus)
container.getCounter('Database')
container.getHistogram('Database')
container.toPrometheus()
```

**Includes:** [health](./health.md) + [observability](./observability.md) + [metrics](./metrics.md)

### development

Everything in production, plus testing utilities and debug logging.

```ts
import { createContainer } from 'no-decoration'
import { development } from 'no-decoration/presets'

const container = createContainer().with(development)

// All production methods, plus:

// Testing
container.withMocks([[db, mockDb]])
container.snapshot()
container.restore(snap)

// Debug logging (automatic console output)
// [DI] Resolving: Database
// [DI] Resolved: Database (5.23ms)
```

**Includes:** [health](./health.md) + [observability](./observability.md) + [testing](./testing.md) + [debug](./debug.md)

### testOnly

Minimal testing utilities for unit tests.

```ts
import { createContainer } from 'no-decoration'
import { testOnly } from 'no-decoration/presets'

const container = createContainer().with(testOnly)

// Testing methods only:
container.withMocks([[db, mockDb]])
container.snapshot()
container.restore(snap)
```

**Includes:** [testing](./testing.md)

## Creating Custom Presets

Use `pipe()` to create your own preset:

```ts
import { pipe } from 'no-decoration'
import { health, observability, metrics, tracing } from 'no-decoration/plugins'

// Full observability stack
export const fullObservability = pipe(
  health,
  observability,
  metrics({ prefix: 'myapp' }),
  tracing({ serviceName: 'myapp' })
)

// Usage
const container = createContainer().with(fullObservability)
```

## Environment-Based Selection

```ts
import { createContainer } from 'no-decoration'
import { production, development, testOnly } from 'no-decoration/presets'

function getPreset() {
  switch (process.env.NODE_ENV) {
    case 'production':
      return production
    case 'test':
      return testOnly
    default:
      return development
  }
}

const container = createContainer().with(getPreset())
```

## Extending Presets

Add plugins on top of presets:

```ts
import { production } from 'no-decoration/presets'
import { metrics, tracing, debug } from 'no-decoration/plugins'

const container = createContainer()
  .with(production)              // Base preset
  .with(metrics())               // Add metrics
  .with(tracing())               // Add tracing
  .with(debug.configure({        // Add debug in dev
    enabled: process.env.NODE_ENV !== 'production'
  }))
```

## Preset Comparison

| Preset | health | observability | metrics | testing | debug | Use Case |
|--------|--------|---------------|---------|---------|-------|----------|
| `production` | ✓ | ✓ | ✓ | - | - | Production deployments |
| `development` | ✓ | ✓ | - | ✓ | ✓ | Local development |
| `testOnly` | - | - | - | ✓ | - | Unit tests |

## See Also

- [Writing Plugins](../plugins.md) - Create your own plugins
- Individual plugin docs for detailed API
