# Observability Plugin

Event subscriptions, startup validation, and dependency graph visualization.

## Import

```ts
import { observability } from 'no-decoration/plugins'
```

## Setup

```ts
import { createContainer } from 'no-decoration'
import { observability } from 'no-decoration/plugins'

const container = createContainer().with(observability)
```

## API

### on(event, handler)

Subscribe to container events. Returns an unsubscribe function.

```ts
// Track all resolutions
const unsubscribe = container.on('resolve', (factory, value, ms) => {
  console.log(`Resolved ${factory.displayName} in ${ms}ms`)
})

// Track disposals
container.on('dispose', (factory) => {
  console.log(`Disposed ${factory.displayName}`)
})

// Track overrides
container.on('override', (original, replacement) => {
  console.log(`Overriding ${original.displayName}`)
})

// Later: stop listening
unsubscribe()
```

**Events:**

| Event | Handler Signature |
|-------|-------------------|
| `resolve` | `(factory, value, ms) => void` |
| `dispose` | `(factory) => void` |
| `override` | `(original, replacement) => void` |

### validate(factories)

Validate that all factories can be resolved. Throws on first error.

```ts
// At application startup
await container.validate([database, cache, userService, orderService])
```

### validateReport(factories)

Like `validate()` but returns a report instead of throwing.

```ts
const report = await container.validateReport([database, cache, userService])

if (!report.valid) {
  console.error('Validation errors:')
  for (const err of report.errors) {
    console.error(`  ${err.factory}: ${err.error.message}`)
  }
}
```

**Returns:**

```ts
interface ValidationReport {
  valid: boolean
  errors: Array<{ factory: string; error: Error }>
}
```

### getResolutionContext()

Get information about the current resolution (call during factory resolution).

```ts
const userService = factory('UserService', (c) => {
  const ctx = c.getResolutionContext()
  console.log(`Depth: ${ctx.depth}, Parent: ${ctx.parent?.displayName}`)
  return new UserService()
})
```

**Returns:**

```ts
interface ResolutionContext {
  parent: Factory | null  // The factory that triggered this resolution
  depth: number           // How deep in the resolution stack
}
```

### getDependencyGraph()

Get the dependency graph after resolving factories.

```ts
// First resolve your factories
container.get(app)

// Then get the graph
const graph = container.getDependencyGraph()
```

**Graph methods:**

```ts
// Raw edges
graph.edges  // Map<Factory, Set<Factory>>

// Generate Mermaid diagram
console.log(graph.toMermaid())
// graph TD
//   App --> UserService
//   App --> Database
//   UserService --> Database

// Get topological order (dependencies first)
const order = graph.getTopologicalOrder()
// [Database, UserService, App]
```

## Usage Patterns

### Startup Validation

```ts
async function startApp() {
  const container = createContainer()
    .with(observability)

  // Validate all critical factories before accepting traffic
  try {
    await container.validate([
      database,
      cache,
      messageQueue,
      userService,
      orderService
    ])
    console.log('All factories validated')
  } catch (e) {
    console.error('Startup validation failed:', e.message)
    process.exit(1)
  }

  // Now safe to start server
  app.listen(3000)
}
```

### Dependency Visualization

```ts
// Generate a Mermaid diagram for documentation
container.get(app)
const mermaid = container.getDependencyGraph().toMermaid()

fs.writeFileSync('docs/dependencies.md', `
# Dependencies

\`\`\`mermaid
${mermaid}
\`\`\`
`)
```

### Resolution Logging

```ts
const container = createContainer().with(observability)

container.on('resolve', (factory, value, ms) => {
  logger.debug({
    event: 'factory_resolved',
    factory: factory.displayName,
    duration_ms: ms
  })
})
```

## See Also

- [debug](./debug.md) - Development logging (simpler alternative)
- [metrics](./metrics.md) - Prometheus-style counters and histograms
- [tracing](./tracing.md) - Distributed tracing with spans
