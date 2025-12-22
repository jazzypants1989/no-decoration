# Tracing Plugin

OpenTelemetry-style distributed tracing for factory resolution.

## Import

```ts
import { tracing } from 'no-decoration/plugins'
```

## Setup

```ts
import { createContainer } from 'no-decoration'
import { tracing } from 'no-decoration/plugins'

const container = createContainer().with(tracing({
  serviceName: 'user-service'
}))
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | `'di-container'` | Service name in spans |
| `onSpanStart` | `function` | - | Callback when span starts |
| `onSpanEnd` | `function` | - | Callback when span ends |
| `tracer` | `object` | - | External OpenTelemetry tracer |

## How It Works

Every factory resolution creates a span:

```
resolve:App ─────────────────────────────┐
  ├── resolve:UserService ────────────┐ │
  │     └── resolve:Database ───────┐ │ │
  │                                 │ │ │
  │                              5ms│ │ │
  │                        12ms ───┘ │ │
  │                   25ms ─────────┘ │
  └───────────────────────────── 30ms ┘
```

Spans include:
- Trace ID (shared across a request)
- Parent-child relationships
- Timing information
- Factory attributes

## API

### getCompletedSpans()

Get all completed spans.

```ts
const spans = container.getCompletedSpans()

for (const span of spans) {
  console.log(`${span.operationName}: ${span.duration}ms`)
}
```

### getActiveSpans()

Get currently in-progress spans.

```ts
const active = container.getActiveSpans()
console.log(`${active.length} resolutions in progress`)
```

### getSpansByTrace(traceId)

Get all spans for a specific trace.

```ts
const traceId = container.getCurrentTraceId()
const spans = container.getSpansByTrace(traceId)
```

### getCurrentTraceId()

Get the current trace ID.

```ts
const traceId = container.getCurrentTraceId()
```

### startNewTrace()

Start a new trace. Call at the start of each request.

```ts
app.use((req, res, next) => {
  const traceId = container.startNewTrace()
  req.traceId = traceId
  next()
})
```

### clearSpans()

Clear all completed spans.

```ts
container.clearSpans()
```

### withSpan(name, options?)

Create a manual span around a function.

```ts
const result = await container.withSpan('fetchUsers')(async () => {
  return await fetch('/api/users')
})

// With options
const result = await container.withSpan('processOrder', {
  attributes: { orderId: '123' }
})(async () => {
  return await processOrder()
})
```

### toJaegerJSON()

Export spans in Jaeger format.

```ts
const jaegerData = container.toJaegerJSON()

await fetch('http://jaeger:14268/api/traces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(jaegerData)
})
```

### toZipkinJSON()

Export spans in Zipkin format.

```ts
const zipkinSpans = container.toZipkinJSON()

await fetch('http://zipkin:9411/api/v2/spans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(zipkinSpans)
})
```

## Span Structure

```ts
interface Span {
  traceId: string          // Unique trace identifier
  spanId: string           // Unique span identifier
  parentSpanId?: string    // Parent span (if nested)
  operationName: string    // e.g., "resolve:Database"
  serviceName: string      // Service name
  startTime: number        // High-resolution start time
  endTime: number          // High-resolution end time
  duration: number         // Duration in ms
  status: 'OK' | 'ERROR'   // Span status
  attributes: object       // Key-value metadata
  events: SpanEvent[]      // Span events/logs
}
```

## Usage Patterns

### Per-Request Tracing

```ts
app.use((req, res, next) => {
  // Start new trace for each request
  const traceId = container.startNewTrace()

  // Store for logging
  req.traceId = traceId

  // Add to response headers
  res.setHeader('X-Trace-Id', traceId)

  next()
})

// After request, export spans
app.use((req, res, next) => {
  res.on('finish', async () => {
    const spans = container.getSpansByTrace(req.traceId)
    await exportToJaeger(spans)
    container.clearSpans()
  })
  next()
})
```

### Slow Resolution Alerting

```ts
const container = createContainer().with(tracing({
  onSpanEnd: (span) => {
    if (span.duration > 100) {
      logger.warn({
        message: 'Slow resolution',
        factory: span.operationName,
        duration: span.duration,
        traceId: span.traceId
      })
    }
  }
}))
```

### OpenTelemetry Integration

```ts
import { trace } from '@opentelemetry/api'

const container = createContainer().with(tracing({
  tracer: trace.getTracer('my-service')
}))

// Spans are now created through OpenTelemetry
// and will be exported by your configured exporter
```

### Custom Span Attributes

```ts
const container = createContainer().with(tracing({
  onSpanStart: (span) => {
    span.attributes['request.id'] = getCurrentRequestId()
    span.attributes['user.id'] = getCurrentUserId()
  }
}))
```

### Combine with Metrics

```ts
import { metrics, tracing } from 'no-decoration/plugins'

const container = createContainer()
  .with(metrics({ prefix: 'app' }))
  .with(tracing({ serviceName: 'app' }))

// Both work together
// - metrics: counters and histograms for monitoring
// - tracing: spans for debugging specific requests
```

## Export Formats

### Jaeger Format

```json
{
  "data": [{
    "traceID": "abc123",
    "spans": [{
      "traceID": "abc123",
      "spanID": "def456",
      "operationName": "resolve:Database",
      "startTime": 1234567890000,
      "duration": 5000,
      "tags": [
        { "key": "di.factory.name", "value": "Database" }
      ]
    }],
    "processes": {
      "p1": { "serviceName": "user-service" }
    }
  }]
}
```

### Zipkin Format

```json
[{
  "traceId": "abc123",
  "id": "def456",
  "name": "resolve:Database",
  "timestamp": 1234567890000,
  "duration": 5000,
  "localEndpoint": { "serviceName": "user-service" },
  "tags": { "di.factory.name": "Database" }
}]
```

## See Also

- [metrics](./metrics.md) - Prometheus-style monitoring
- [observability](./observability.md) - Event subscriptions
- [debug](./debug.md) - Simple development logging
