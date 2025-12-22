# Metrics Plugin

Prometheus-style metrics for monitoring factory resolution.

## Import

```ts
import { metrics } from 'no-decoration/plugins'
```

## Setup

```ts
import { createContainer } from 'no-decoration'
import { metrics } from 'no-decoration/plugins'

const container = createContainer().with(metrics({
  prefix: 'myapp_di',
  labels: { environment: 'production' }
}))
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | `'di'` | Metric name prefix |
| `buckets` | `number[]` | `[1,5,10,25,50,100,250,500,1000,2500,5000]` | Histogram bucket boundaries (ms) |
| `labels` | `object` | `{}` | Additional labels for all metrics |

## Metrics Collected

### Counters

| Metric | Description |
|--------|-------------|
| `{prefix}_resolutions_total` | Total factory resolutions |
| `{prefix}_errors_total` | Total resolution errors |

### Histograms

| Metric | Description |
|--------|-------------|
| `{prefix}_resolution_duration_ms` | Resolution time distribution |

### Gauges

| Metric | Description |
|--------|-------------|
| `{prefix}_active_resolutions` | Currently in-progress resolutions |
| `{prefix}_peak_active_resolutions` | Peak concurrent resolutions |

## API

### getCounter(factoryName)

Get resolution count for a factory.

```ts
const count = container.getCounter('Database')
console.log(`Database resolved ${count} times`)
```

### getErrorCount(factoryName)

Get error count for a factory.

```ts
const errors = container.getErrorCount('ExternalAPI')
if (errors > 10) {
  console.warn('High error rate!')
}
```

### getHistogram(factoryName)

Get resolution time histogram.

```ts
const histogram = container.getHistogram('Database')
console.log(`Count: ${histogram.count}`)
console.log(`Total: ${histogram.sum}ms`)
console.log(`Average: ${histogram.sum / histogram.count}ms`)

// Bucket data
for (const bucket of histogram.buckets) {
  console.log(`<= ${bucket.le}ms: ${bucket.count}`)
}
```

### getActiveResolutions()

Get current in-progress resolution count.

```ts
console.log(`Active resolutions: ${container.getActiveResolutions()}`)
```

### getPeakActiveResolutions()

Get peak concurrent resolutions seen.

```ts
console.log(`Peak: ${container.getPeakActiveResolutions()}`)
```

### getAllMetrics()

Get all collected metrics.

```ts
const all = container.getAllMetrics()

console.log('Counters:', all.counters)      // Map<string, number>
console.log('Errors:', all.errors)          // Map<string, number>
console.log('Histograms:', all.histograms)  // Map<string, HistogramData>
console.log('Active:', all.activeResolutions)
console.log('Peak:', all.peakActiveResolutions)
```

### recordError(factoryName)

Manually record an error.

```ts
try {
  container.get(riskyFactory)
} catch (e) {
  container.recordError('riskyFactory')
  throw e
}
```

### resetMetrics()

Reset all metrics to zero.

```ts
container.resetMetrics()
```

### toPrometheus()

Export in Prometheus text format.

```ts
const output = container.toPrometheus()
```

**Example output:**

```
# HELP myapp_di_resolutions_total Total number of factory resolutions
# TYPE myapp_di_resolutions_total counter
myapp_di_resolutions_total{factory="Database",environment="production"} 42

# HELP myapp_di_resolution_duration_ms Factory resolution duration in milliseconds
# TYPE myapp_di_resolution_duration_ms histogram
myapp_di_resolution_duration_ms_bucket{factory="Database",le="10"} 35
myapp_di_resolution_duration_ms_bucket{factory="Database",le="50"} 40
myapp_di_resolution_duration_ms_bucket{factory="Database",le="+Inf"} 42
myapp_di_resolution_duration_ms_sum{factory="Database"} 523.45
myapp_di_resolution_duration_ms_count{factory="Database"} 42

# HELP myapp_di_active_resolutions Current number of active resolutions
# TYPE myapp_di_active_resolutions gauge
myapp_di_active_resolutions 0

# HELP myapp_di_peak_active_resolutions Peak number of concurrent resolutions
# TYPE myapp_di_peak_active_resolutions gauge
myapp_di_peak_active_resolutions 5
```

## Usage Patterns

### Express /metrics Endpoint

```ts
app.get('/metrics', (req, res) => {
  res.type('text/plain')
  res.send(container.toPrometheus())
})
```

### Fastify Plugin

```ts
fastify.get('/metrics', async () => {
  return container.toPrometheus()
})
```

### Alerting on Slow Factories

```ts
setInterval(() => {
  const all = container.getAllMetrics()

  for (const [name, histogram] of all.histograms) {
    const avg = histogram.sum / histogram.count
    if (avg > 100) {
      alerting.send(`Factory ${name} averaging ${avg}ms`)
    }
  }
}, 60000)
```

### Combine with Labels

```ts
const container = createContainer().with(metrics({
  prefix: 'app_di',
  labels: {
    service: 'user-service',
    version: process.env.VERSION,
    environment: process.env.NODE_ENV
  }
}))
```

### Reset Between Tests

```ts
beforeEach(() => {
  container.resetMetrics()
})
```

## See Also

- [tracing](./tracing.md) - Distributed tracing with spans
- [health](./health.md) - Health checks
- [observability](./observability.md) - Event subscriptions
