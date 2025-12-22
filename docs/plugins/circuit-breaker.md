# Circuit Breaker Plugin

Fail fast when dependencies are down. Prevents cascading failures.

## Import

```ts
import { circuitBreaker, circuitBreakerPlugin, CircuitState, CircuitOpenError } from 'no-decoration/plugins'
```

## Quick Start

```ts
import { pipe, factory } from 'no-decoration'
import { circuitBreaker } from 'no-decoration/plugins'

// Wrap a factory with circuit breaker protection
const database = pipe(
  factory('Database', async () => connectToDb()),
  circuitBreaker('db', { failureThreshold: 5 })
)
```

## How It Works

The circuit breaker has three states:

```
CLOSED → (N failures) → OPEN → (timeout) → HALF_OPEN → (M successes) → CLOSED
                                              ↓
                                        (1 failure) → OPEN
```

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation. Failures are counted. |
| **OPEN** | Fails immediately with `CircuitOpenError`. No calls to factory. |
| **HALF_OPEN** | Allows limited requests to test recovery. |

## API

### circuitBreaker(name, options?)

Create a circuit breaker decorator for a factory.

```ts
const protected = circuitBreaker('my-service', {
  failureThreshold: 5,      // Trips after 5 failures (default: 5)
  resetTimeoutMs: 30000,    // Wait 30s before testing recovery (default: 30000)
  successThreshold: 2,      // Needs 2 successes to close (default: 2)
  onStateChange: (name, from, to) => {
    console.log(`Circuit ${name}: ${from} → ${to}`)
  }
})(factory)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failureThreshold` | `number` | `5` | Failures before opening |
| `resetTimeoutMs` | `number` | `30000` | Time before testing recovery |
| `successThreshold` | `number` | `2` | Successes to close from half-open |
| `onStateChange` | `function` | - | Callback on state transitions |

### CircuitOpenError

Thrown when the circuit is open.

```ts
try {
  await container.get(protectedService)
} catch (e) {
  if (e instanceof CircuitOpenError) {
    console.log(`Circuit ${e.circuitName} is open after ${e.failures} failures`)
    // Return cached/fallback data instead
    return fallbackData
  }
  throw e
}
```

### CircuitState

State constants for comparisons.

```ts
import { CircuitState } from 'no-decoration/plugins'

if (circuit.getState() === CircuitState.OPEN) {
  console.log('Circuit is open!')
}
```

## Plugin for Introspection

The `circuitBreakerPlugin` provides container methods for monitoring:

```ts
import { circuitBreakerPlugin } from 'no-decoration/plugins'

const container = createContainer().with(circuitBreakerPlugin)

// Query circuits
container.getCircuit('db')           // Get specific circuit
container.getAllCircuits()           // Get all circuits
container.getCircuitHealth()         // Get health status
container.resetAllCircuits()         // Reset all to CLOSED
```

### CircuitInfo

Information about a circuit.

```ts
const circuit = container.getCircuit('db')

circuit.getState()      // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
circuit.getFailures()   // Current failure count
circuit.getSuccesses()  // Success count (in HALF_OPEN)
circuit.getLastError()  // Last error that caused failure
circuit.reset()         // Manually reset to CLOSED
```

## Usage Patterns

### With Retry

Combine with retry for resilient services:

```ts
import { pipe, factory } from 'no-decoration'
import { retry } from 'no-decoration/plugins/patterns'
import { circuitBreaker } from 'no-decoration/plugins'

const externalApi = pipe(
  factory('ExternalAPI', async () => fetch('/api/data')),
  retry(3, 1000),                    // Retry 3 times with 1s delay
  circuitBreaker('external-api', {   // Then circuit breaker
    failureThreshold: 5
  })
)
```

### Health Check Integration

```ts
import { health, circuitBreakerPlugin } from 'no-decoration/plugins'

const container = createContainer()
  .with(health)
  .with(circuitBreakerPlugin)

// Expose circuit health
app.get('/health/circuits', (req, res) => {
  const health = container.getCircuitHealth()
  const body = Object.fromEntries(
    [...health].map(([name, status]) => [name, {
      state: status.state,
      failures: status.failures,
      error: status.lastError?.message
    }])
  )
  res.json(body)
})
```

### Fallback Pattern

```ts
const getUserData = async (container) => {
  try {
    return await container.get(userService)
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      // Return cached or default data
      return container.get(cachedUserService)
    }
    throw e
  }
}
```

### Monitor State Changes

```ts
const database = pipe(
  factory('Database', async () => connectToDb()),
  circuitBreaker('db', {
    onStateChange: (name, from, to) => {
      metrics.increment('circuit_state_change', { circuit: name, from, to })

      if (to === 'OPEN') {
        alerting.send(`Circuit ${name} opened!`)
      }
    }
  })
)
```

## See Also

- [cache](./cache.md) - TTL-based caching
- [retry pattern](./patterns.md) - Retry decorator
- [health](./health.md) - Health checks
