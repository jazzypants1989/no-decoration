# Health Plugin

Register and run health checks for production monitoring.

## Import

```ts
import { health } from 'no-decoration/plugins'
```

## Setup

```ts
import { createContainer } from 'no-decoration'
import { health } from 'no-decoration/plugins'

const container = createContainer().with(health)
```

## API

### onHealthCheck(name, check)

Register a health check.

```ts
container.onHealthCheck('database', async () => {
  await db.ping()
})

container.onHealthCheck('redis', async () => {
  await redis.ping()
})

container.onHealthCheck('external-api', async () => {
  const res = await fetch('https://api.example.com/health')
  if (!res.ok) throw new Error('API unhealthy')
})
```

### checkHealth()

Run all registered health checks and return a report.

```ts
const report = await container.checkHealth()

console.log(report.healthy) // true if all checks pass
console.log(report.checks)  // Map of check results
```

**Returns:**

```ts
interface HealthReport {
  healthy: boolean
  checks: Map<string, HealthCheckResult>
}

interface HealthCheckResult {
  healthy: boolean
  ms: number          // How long the check took
  error?: Error       // Present if check failed
}
```

## Usage Patterns

### Express Health Endpoint

```ts
app.get('/health', async (req, res) => {
  const report = await container.checkHealth()

  const body = {
    status: report.healthy ? 'healthy' : 'unhealthy',
    checks: Object.fromEntries(
      [...report.checks].map(([name, result]) => [
        name,
        {
          status: result.healthy ? 'pass' : 'fail',
          duration_ms: result.ms,
          error: result.error?.message
        }
      ])
    )
  }

  res.status(report.healthy ? 200 : 503).json(body)
})
```

### Register Health Checks in Factories

```ts
const database = factory('Database', (c) => {
  const db = new Database(c.get(config).dbUrl)

  // Register health check
  c.onHealthCheck('database', async () => {
    await db.ping()
  })

  return db
})
```

### Kubernetes Probes

```ts
// Liveness probe - is the container running?
app.get('/healthz', (req, res) => {
  res.status(200).send('OK')
})

// Readiness probe - is the container ready to serve traffic?
app.get('/ready', async (req, res) => {
  const report = await container.checkHealth()
  res.status(report.healthy ? 200 : 503).send()
})
```

## See Also

- [metrics](./metrics.md) - Prometheus-style monitoring
- [observability](./observability.md) - Events and validation
