# Batch Plugin

Define multiple factories at once with forward reference support.

## Import

```ts
import { batch, defineFactories } from 'no-decoration/plugins'
```

## Standalone Usage

The `defineFactories` function works without a container:

```ts
import { defineFactories } from 'no-decoration/plugins'

const factories = defineFactories({
  config: () => ({ env: 'production', port: 3000 }),
  logger: (c) => new Logger(c.get(factories.config)),
  database: (c) => new Database(c.get(factories.config).dbUrl)
})

// Use factories
const container = createContainer()
const db = container.get(factories.database)
```

## Forward References

When factories reference each other, use the builder function pattern:

```ts
const factories = defineFactories((f) => ({
  // f.database is available before database is defined
  userRepository: (c) => new UserRepository(c.get(f.database)),
  orderRepository: (c) => new OrderRepository(c.get(f.database)),
  database: (c) => new Database(c.get(f.config)),
  config: () => loadConfig()
}))
```

## Plugin Usage

The batch plugin adds `defineFactories` as a container method:

```ts
import { createContainer } from 'no-decoration'
import { batch } from 'no-decoration/plugins'

const container = createContainer().with(batch)

const factories = container.defineFactories({
  config: () => ({ port: 3000 }),
  server: (c) => new Server(c.get(factories.config))
})
```

## API

### defineFactories(definitions)

Define multiple factories from an object.

```ts
// Simple object
const factories = defineFactories({
  a: () => 'a',
  b: (c) => c.get(factories.a) + 'b'
})

// Builder function for forward references
const factories = defineFactories((f) => ({
  a: (c) => c.get(f.b) + 'a',  // f.b is available
  b: () => 'b'
}))
```

**Returns:** An object with the same keys, each mapped to a factory.

## Features

- **Automatic displayName**: Each factory gets its key as displayName
- **Forward references**: Use builder function pattern
- **Type inference**: TypeScript infers return types

## Usage Patterns

### Organizing by Module

```ts
// users/factories.ts
export const userFactories = defineFactories((f) => ({
  userRepository: (c) => new UserRepository(c.get(f.database)),
  userService: (c) => new UserService(c.get(f.userRepository)),
  database: (c) => c.get(sharedFactories.database)  // From another module
}))

// orders/factories.ts
export const orderFactories = defineFactories((f) => ({
  orderRepository: (c) => new OrderRepository(c.get(f.database)),
  orderService: (c) => new OrderService(c.get(f.orderRepository)),
  database: (c) => c.get(sharedFactories.database)
}))
```

### With Validation

```ts
const factories = defineFactories({
  config: () => {
    const config = loadConfig()
    if (!config.apiKey) throw new Error('API key required')
    return config
  },
  api: (c) => new ApiClient(c.get(factories.config).apiKey)
})

// Validation happens on first resolution
const api = container.get(factories.api)  // Throws if config invalid
```

## See Also

- [Basic Example](../../examples/basic.js) - Simple factory patterns
- [Multifile Example](../../examples/multifile/) - Multi-module organization
